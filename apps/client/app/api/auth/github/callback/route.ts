import { NextRequest, NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { PrismaClient } from "@repo/store/generated/prisma";
import { PrismaNeon } from "@prisma/adapter-neon";

// GitHub OAuth URLs
const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
const GITHUB_USER_URL = "https://api.github.com/user";
const GITHUB_EMAILS_URL = "https://api.github.com/user/emails";
const FRONTEND_URL =
  process.env.NEXT_PUBLIC_FRONTEND_URL || "http://localhost:3000";

// Create Prisma client for Next.js (doesn't use Bun-dependent config)
const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

// Types for GitHub API responses
interface GitHubTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  error?: string;
  error_description?: string;
}

interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
}

interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility: string | null;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  // Handle OAuth errors
  if (error) {
    const errorDescription =
      searchParams.get("error_description") || "Authentication failed";
    return NextResponse.redirect(
      `${FRONTEND_URL}/login?error=${encodeURIComponent(errorDescription)}`,
    );
  }

  // Validate required parameters
  if (!code) {
    return NextResponse.redirect(
      `${FRONTEND_URL}/login?error=${encodeURIComponent("Missing authorization code")}`,
    );
  }

  try {
    // Step 1: Exchange code for access token
    const tokenResponse = await fetch(GITHUB_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: process.env.CLIENT_ID_GITHUB,
        client_secret: process.env.CLIENT_SECRET_GITHUB,
        code,
      }),
    });

    const tokenData: GitHubTokenResponse = await tokenResponse.json();

    if (tokenData.error || !tokenData.access_token) {
      throw new Error(
        tokenData.error_description || "Failed to exchange code for token",
      );
    }

    const accessToken = tokenData.access_token;

    // Step 2: Fetch user profile
    const userResponse = await fetch(GITHUB_USER_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    if (!userResponse.ok) {
      throw new Error("Failed to fetch GitHub user profile");
    }

    const githubUser: GitHubUser = await userResponse.json();

    // Step 3: Fetch user emails (since email might be private)
    const emailsResponse = await fetch(GITHUB_EMAILS_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });

    let primaryEmail: string | null = githubUser.email;

    if (emailsResponse.ok) {
      const emails: GitHubEmail[] = await emailsResponse.json();
      const primary = emails.find((e) => e.primary && e.verified);
      if (primary) {
        primaryEmail = primary.email;
      } else {
        const verified = emails.find((e) => e.verified);
        if (verified) {
          primaryEmail = verified.email;
        }
      }
    }

    // Step 4: Find or create user and account
    const githubId = githubUser.id.toString();

    const existingAccount = await prisma.account.findUnique({
      where: {
        provider_providerAccountId: {
          provider: "github",
          providerAccountId: githubId,
        },
      },
      include: { user: true },
    });

    let user;

    if (existingAccount) {
      user = await prisma.user.update({
        where: { id: existingAccount.userId },
        data: {
          name: githubUser.name || githubUser.login,
          avatarUrl: githubUser.avatar_url,
          ...(primaryEmail && !existingAccount.user.email
            ? { email: primaryEmail }
            : {}),
        },
      });

      await prisma.account.update({
        where: { id: existingAccount.id },
        data: { accessToken },
      });
    } else {
      const existingUser = primaryEmail
        ? await prisma.user.findUnique({ where: { email: primaryEmail } })
        : null;

      if (existingUser) {
        await prisma.account.create({
          data: {
            userId: existingUser.id,
            provider: "github",
            providerAccountId: githubId,
            accessToken,
          },
        });

        user = await prisma.user.update({
          where: { id: existingUser.id },
          data: {
            name: existingUser.name || githubUser.name || githubUser.login,
            avatarUrl: existingUser.avatarUrl || githubUser.avatar_url,
          },
        });
      } else {
        user = await prisma.user.create({
          data: {
            email: primaryEmail || `github_${githubId}@placeholder.local`,
            name: githubUser.name || githubUser.login,
            avatarUrl: githubUser.avatar_url,
            emailVerified: !!primaryEmail,
            accounts: {
              create: {
                provider: "github",
                providerAccountId: githubId,
                accessToken,
              },
            },
          },
        });
      }
    }

    // Step 5: Create JWT token
    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      throw new Error("JWT_SECRET not configured");
    }

    const token = jwt.sign({ userId: user.id }, jwtSecret, {
      expiresIn: "1h",
    });

    // Redirect to callback page with token
    return NextResponse.redirect(
      `${FRONTEND_URL}/auth/callback?token=${encodeURIComponent(token)}&state=${encodeURIComponent(state || "")}`,
    );
  } catch (err) {
    console.error("GitHub OAuth error:", err);
    const errorMessage =
      err instanceof Error ? err.message : "Authentication failed";
    return NextResponse.redirect(
      `${FRONTEND_URL}/login?error=${encodeURIComponent(errorMessage)}`,
    );
  }
}

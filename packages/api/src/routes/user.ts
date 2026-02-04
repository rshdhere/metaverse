import { TRPCError } from "@trpc/server";
import jwt from "jsonwebtoken";
import { z } from "zod";
import {
  router,
  publicProcedure,
  protectedProcedure,
  JWT_SECRET,
} from "../trpc.js";
import {
  userOutputValidation,
  userInputValidation,
  githubAuthInput,
  signupOutputValidation,
} from "@repo/validators";
import { prismaClient } from "@repo/store";
import { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET } from "@repo/config";
import {
  GITHUB_TOKEN_URL,
  GITHUB_USER_URL,
  GITHUB_EMAILS_URL,
} from "@repo/config/constants";
import { sendVerificationEmail } from "../email.js";

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

// Helper to generate verification token
function generateVerificationToken(): string {
  return crypto.randomUUID() + crypto.randomUUID().replace(/-/g, "");
}

export const userRouter = router({
  signup: publicProcedure
    .output(signupOutputValidation)
    .input(userInputValidation)
    .mutation(async (opts) => {
      const email = opts.input.email;
      const password = opts.input.password;

      const userAlreadyExists = await prismaClient.user.findFirst({
        where: { email },
      });

      if (userAlreadyExists) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "user already exists, try signing-in",
        });
      }

      const hash = await Bun.password.hash(password);

      // Create user with emailVerified: false (default)
      await prismaClient.user.create({
        data: {
          email: email,
          passwordHash: hash,
        },
      });

      // Generate verification token (expires in 24 hours)
      const verificationToken = generateVerificationToken();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      // Delete any existing tokens for this email
      await prismaClient.emailVerificationToken.deleteMany({
        where: { email },
      });

      // Create new verification token
      await prismaClient.emailVerificationToken.create({
        data: {
          token: verificationToken,
          email,
          expiresAt,
        },
      });

      // Send verification email (fire-and-forget for faster response)
      sendVerificationEmail(email, verificationToken)
        .then(() => {})
        .catch((err) => {
          console.error("Failed to send verification email:", err);
          // TODO: Add to retry queue
        });

      return {
        message: "Please check your email to verify your account",
        email,
      };
    }),

  verifyEmail: publicProcedure
    .input(z.object({ token: z.string().min(1, "Token is required") }))
    .output(userOutputValidation)
    .mutation(async ({ input }) => {
      const { token } = input;

      // Find the verification token
      const verificationToken =
        await prismaClient.emailVerificationToken.findUnique({
          where: { token },
        });

      if (!verificationToken) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Invalid or expired verification link",
        });
      }

      // Check if token is expired
      if (verificationToken.expiresAt < new Date()) {
        // Delete expired token
        await prismaClient.emailVerificationToken.delete({
          where: { id: verificationToken.id },
        });

        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Verification link has expired. Please sign up again.",
        });
      }

      // Find and update the user
      const user = await prismaClient.user.findUnique({
        where: { email: verificationToken.email },
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      // Mark email as verified
      await prismaClient.user.update({
        where: { id: user.id },
        data: { emailVerified: true },
      });

      // Delete the verification token
      await prismaClient.emailVerificationToken.delete({
        where: { id: verificationToken.id },
      });

      // Generate JWT token
      const jwtToken = jwt.sign({ userId: user.id }, JWT_SECRET, {
        expiresIn: "1h",
      });

      return {
        token: jwtToken,
        user: {
          id: user.id,
          email: user.email,
        },
      };
    }),

  resendVerification: publicProcedure
    .input(z.object({ email: z.string().email() }))
    .output(z.object({ message: z.string() }))
    .mutation(async ({ input }) => {
      const { email } = input;

      // Check if user exists and is not verified
      const user = await prismaClient.user.findUnique({
        where: { email },
      });

      if (!user) {
        // Don't reveal if user exists or not for security
        return {
          message: "If an account exists, a verification email has been sent",
        };
      }

      if (user.emailVerified) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Email is already verified",
        });
      }

      // Generate new verification token
      const verificationToken = generateVerificationToken();
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

      // Delete any existing tokens for this email
      await prismaClient.emailVerificationToken.deleteMany({
        where: { email },
      });

      // Create new verification token
      await prismaClient.emailVerificationToken.create({
        data: {
          token: verificationToken,
          email,
          expiresAt,
        },
      });

      // Send verification email
      await sendVerificationEmail(email, verificationToken);

      return {
        message: "If an account exists, a verification email has been sent",
      };
    }),

  login: publicProcedure
    .output(userOutputValidation)
    .input(userInputValidation)
    .mutation(async (opts) => {
      const email = opts.input.email;
      const password = opts.input.password;

      const user = await prismaClient.user.findFirst({
        where: { email },
      });

      if (!user || !user.passwordHash) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "user not found",
        });
      }

      // Check if email is verified
      if (!user.emailVerified) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Please verify your email before logging in",
        });
      }

      const passwordMatched = await Bun.password.verify(
        password,
        user.passwordHash,
      );

      if (!passwordMatched) {
        throw new TRPCError({
          code: "UNAUTHORIZED",
          message: "Invalid Credentials",
        });
      }

      const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
        expiresIn: "1h",
      });

      return {
        token,
        user: {
          id: user.id,
          email: user.email,
        },
      };
    }),

  updateMetadata: protectedProcedure
    .input(z.object({ avatarId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await prismaClient.user.update({
        where: { id: ctx.user.userId },
        data: {
          avatarId: input.avatarId,
        },
      });
      return { success: true };
    }),

  getBulkMetadata: publicProcedure
    .input(z.object({ ids: z.array(z.string()) }))
    .query(async ({ input }) => {
      const users = await prismaClient.user.findMany({
        where: {
          id: {
            in: input.ids,
          },
        },
        select: {
          id: true,
          avatar: true,
        },
      });

      return {
        avatars: users.map((u) => ({
          userId: u.id,
          imageUrl: u.avatar?.imageUrl,
        })),
      };
    }),

  githubAuth: publicProcedure
    .input(githubAuthInput)
    .output(userOutputValidation)
    .mutation(async ({ input }) => {
      const { code } = input;

      // Step 1: Exchange code for access token
      const tokenResponse = await fetch(GITHUB_TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          client_id: GITHUB_CLIENT_ID,
          client_secret: GITHUB_CLIENT_SECRET,
          code,
        }),
      });

      const tokenData: GitHubTokenResponse = await tokenResponse.json();

      if (tokenData.error || !tokenData.access_token) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            tokenData.error_description || "Failed to exchange code for token",
        });
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
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to fetch GitHub user profile",
        });
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
          // Fallback to first verified email
          const verified = emails.find((e) => e.verified);
          if (verified) {
            primaryEmail = verified.email;
          }
        }
      }

      // Step 4: Find or create user and account
      const githubId = githubUser.id.toString();

      // Check if account already exists
      const existingAccount = await prismaClient.account.findUnique({
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
        // Update user info and return existing user
        user = await prismaClient.user.update({
          where: { id: existingAccount.userId },
          data: {
            name: githubUser.name || githubUser.login,
            avatarUrl: githubUser.avatar_url,
            // Update email only if user doesn't have one
            ...(primaryEmail && !existingAccount.user.email
              ? { email: primaryEmail }
              : {}),
          },
        });

        // Update account tokens
        await prismaClient.account.update({
          where: { id: existingAccount.id },
          data: {
            accessToken: accessToken,
          },
        });
      } else {
        // Check if user with this email already exists
        const existingUser = primaryEmail
          ? await prismaClient.user.findUnique({
              where: { email: primaryEmail },
            })
          : null;

        if (existingUser) {
          // Link GitHub account to existing user
          await prismaClient.account.create({
            data: {
              userId: existingUser.id,
              provider: "github",
              providerAccountId: githubId,
              accessToken: accessToken,
            },
          });

          // Update user profile
          user = await prismaClient.user.update({
            where: { id: existingUser.id },
            data: {
              name: existingUser.name || githubUser.name || githubUser.login,
              avatarUrl: existingUser.avatarUrl || githubUser.avatar_url,
            },
          });
        } else {
          // Create new user with GitHub account
          user = await prismaClient.user.create({
            data: {
              email: primaryEmail || `github_${githubId}@placeholder.local`,
              name: githubUser.name || githubUser.login,
              avatarUrl: githubUser.avatar_url,
              emailVerified: !!primaryEmail, // Verified if we got email from GitHub
              accounts: {
                create: {
                  provider: "github",
                  providerAccountId: githubId,
                  accessToken: accessToken,
                },
              },
            },
          });
        }
      }

      // Step 5: Create JWT token
      const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
        expiresIn: "1h",
      });

      return {
        token,
        user: {
          id: user.id,
          email: user.email || "",
        },
      };
    }),
});

/**
 * Authentication Flow Tests (Smoke Tests)
 *
 * Purpose: Confidence tests
 * Contains: Very few tests like signup → verify → login
 *
 * Rules:
 * - Minimal assertions
 * - No edge cases
 * - Treat like a smoke test
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
  mockPrismaClient,
  createCaller,
  resetAllMocks,
} from "./_setup/authTestSetup.js";

describe("Authentication Flow", () => {
  beforeEach(() => {
    resetAllMocks();
  });

  it("complete signup → verify → login flow works", async () => {
    const caller = createCaller();
    const email = `f${Math.random().toString(36).slice(2, 8)}@t.co`;
    const password = "FlowTest123!@#";
    const passwordHash = await Bun.password.hash(password);

    // Step 1: Signup
    mockPrismaClient.user.findFirst.mockResolvedValueOnce(null);
    mockPrismaClient.user.create.mockResolvedValueOnce({
      id: "user-456",
      email,
      emailVerified: false,
      passwordHash,
    });
    mockPrismaClient.emailVerificationToken.deleteMany.mockResolvedValueOnce({
      count: 0,
    });
    mockPrismaClient.emailVerificationToken.create.mockResolvedValueOnce({
      id: "token-456",
      token: "flow-verification-token",
      email,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const signupResult = await caller.signup({ email, password });
    expect(signupResult.message).toBe(
      "Please check your email to verify your account",
    );

    // Step 2: Verify Email
    const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
    mockPrismaClient.emailVerificationToken.findUnique.mockResolvedValueOnce({
      id: "token-456",
      token: "flow-verification-token",
      email,
      expiresAt: futureDate,
    });
    mockPrismaClient.user.findUnique.mockResolvedValueOnce({
      id: "user-456",
      email,
      emailVerified: false,
    });
    mockPrismaClient.user.update.mockResolvedValueOnce({
      id: "user-456",
      email,
      emailVerified: true,
    });
    mockPrismaClient.emailVerificationToken.delete.mockResolvedValueOnce({
      id: "token-456",
    });

    const verifyResult = await caller.verifyEmail({
      token: "flow-verification-token",
    });
    expect(verifyResult.token).toBeDefined();

    // Step 3: Login (user is now verified)
    mockPrismaClient.user.findFirst.mockResolvedValueOnce({
      id: "user-456",
      email,
      emailVerified: true,
      passwordHash,
    });

    const loginResult = await caller.login({ email, password });
    expect(loginResult.token).toBeDefined();
  });

  it("githubAuth → can authenticate successfully", async () => {
    const caller = createCaller();
    const { mockFetch } = await import("./_setup/authTestSetup.js");

    // Reset fetch mock for this test
    mockFetch.mockClear();

    // Mock GitHub OAuth flow
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: "mock-access-token",
          token_type: "bearer",
          scope: "user:email",
        }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          id: 12345,
          login: "flowuser",
          name: "Flow User",
          email: "flow@example.com",
          avatar_url: "https://avatar.url",
        }),
    });

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve([
          {
            email: "flow@example.com",
            primary: true,
            verified: true,
            visibility: "public",
          },
        ]),
    });

    mockPrismaClient.account.findUnique.mockResolvedValueOnce(null);
    mockPrismaClient.user.findUnique.mockResolvedValueOnce(null);
    mockPrismaClient.user.create.mockResolvedValueOnce({
      id: "user-flow",
      email: "flow@example.com",
      name: "Flow User",
      avatarUrl: "https://avatar.url",
      emailVerified: true,
    });

    const result = await caller.githubAuth({ code: "flow-test-code" });
    expect(result.token).toBeDefined();
  });
});

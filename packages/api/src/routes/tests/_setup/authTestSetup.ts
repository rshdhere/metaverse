/**
 * Shared test setup for authentication tests
 *
 * Exports:
 * - mockPrismaClient: Mock Prisma client with all necessary methods
 * - mockSendVerificationEmail: Mock email sending function
 * - mockFetch: Mock fetch for external API calls
 * - mockJwtSign: Spy on jwt.sign
 * - createCaller: Create unauthenticated tRPC caller
 * - createAuthenticatedCaller: Create authenticated tRPC caller
 * - resetAllMocks: Reset all mocks between tests
 * - mockGithubFetchSequence: Helper to set up GitHub OAuth fetch mocks
 */

import { mock, spyOn } from "bun:test";
import jwt from "jsonwebtoken";
import type { Context } from "../../../trpc.js";

// ============================================================================
// Mock Objects
// ============================================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const mockPrismaClient: any = {
  user: {
    findFirst: mock(() => Promise.resolve(null)),
    findUnique: mock(() => Promise.resolve(null)),
    create: mock(() => Promise.resolve(null)),
    update: mock(() => Promise.resolve(null)),
  },
  account: {
    findUnique: mock(() => Promise.resolve(null)),
    create: mock(() => Promise.resolve(null)),
    update: mock(() => Promise.resolve(null)),
  },
  emailVerificationToken: {
    findUnique: mock(() => Promise.resolve(null)),
    create: mock(() => Promise.resolve(null)),
    delete: mock(() => Promise.resolve(null)),
    deleteMany: mock(() => Promise.resolve({ count: 0 })),
  },
};

export const mockSendVerificationEmail = mock(() =>
  Promise.resolve({ success: true }),
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const mockFetch: any = mock(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
  }),
);

// ============================================================================
// Module Mocks (must be called before importing routers)
// ============================================================================

mock.module("@repo/store", () => ({
  prismaClient: mockPrismaClient,
}));

mock.module("../../../email.js", () => ({
  sendVerificationEmail: mockSendVerificationEmail,
}));

global.fetch = mockFetch;

// Mock jwt.sign
export const mockJwtSign = spyOn(jwt, "sign").mockImplementation(
  () => "mock-jwt-token",
);

// Import userRouter after mocks are set up
import { userRouter } from "../../user.js";

// ============================================================================
// Helper Functions
// ============================================================================

// Type for the tRPC caller
type Caller = ReturnType<typeof userRouter.createCaller>;

/**
 * Create an unauthenticated tRPC caller
 */
export function createCaller(): Caller {
  const ctx: Context = { user: null };
  return userRouter.createCaller(ctx);
}

/**
 * Create an authenticated tRPC caller with given userId
 */
export function createAuthenticatedCaller(userId: string): Caller {
  const ctx: Context = { user: { userId } };
  return userRouter.createCaller(ctx);
}

/**
 * Reset all mocks between tests
 */
export function resetAllMocks() {
  mockPrismaClient.user.findFirst.mockClear();
  mockPrismaClient.user.findUnique.mockClear();
  mockPrismaClient.user.create.mockClear();
  mockPrismaClient.user.update.mockClear();
  mockPrismaClient.account.findUnique.mockClear();
  mockPrismaClient.account.create.mockClear();
  mockPrismaClient.account.update.mockClear();
  mockPrismaClient.emailVerificationToken.findUnique.mockClear();
  mockPrismaClient.emailVerificationToken.create.mockClear();
  mockPrismaClient.emailVerificationToken.delete.mockClear();
  mockPrismaClient.emailVerificationToken.deleteMany.mockClear();
  mockSendVerificationEmail.mockClear();
  mockFetch.mockClear();
  mockJwtSign.mockClear();
}

// ============================================================================
// GitHub OAuth Mock Helpers
// ============================================================================

interface GitHubMockConfig {
  accessToken?: string;
  tokenError?: string;
  user?: {
    id: number;
    login: string;
    name: string | null;
    email: string | null;
    avatar_url: string;
  };
  emails?: Array<{
    email: string;
    primary: boolean;
    verified: boolean;
    visibility: string | null;
  }>;
  userFetchFails?: boolean;
}

/**
 * Set up mock fetch responses for GitHub OAuth flow
 */
export function mockGithubFetchSequence(config: GitHubMockConfig) {
  const {
    accessToken = "mock-access-token",
    tokenError,
    user = {
      id: 12345,
      login: "testuser",
      name: "Test User",
      email: "test@example.com",
      avatar_url: "https://avatar.url",
    },
    emails = [
      {
        email: "test@example.com",
        primary: true,
        verified: true,
        visibility: "public",
      },
    ],
    userFetchFails = false,
  } = config;

  // Token exchange response
  if (tokenError) {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          error: tokenError,
          error_description: "Token exchange failed",
        }),
    });
  } else {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          access_token: accessToken,
          token_type: "bearer",
          scope: "user:email",
        }),
    });
  }

  // User profile response
  if (!tokenError) {
    if (userFetchFails) {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      });
    } else {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(user),
      });

      // Emails response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(emails),
      });
    }
  }
}

// Re-export TRPCError for convenience
export { TRPCError } from "@trpc/server";

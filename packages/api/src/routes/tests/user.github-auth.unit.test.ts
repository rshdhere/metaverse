/**
 * GitHub OAuth Unit Tests
 *
 * Purpose: OAuth logic clarity
 * Contains: GitHub token exchange, missing email fallback, account linking, error handling
 *
 * Separated because:
 * - Heavy fetch mocking
 * - OAuth logic evolves independently
 * - Easier to reason about failures
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
  mockPrismaClient,
  mockFetch,
  mockJwtSign,
  createCaller,
  resetAllMocks,
  mockGithubFetchSequence,
  TRPCError,
} from "./_setup/authTestSetup.js";

describe("githubAuth", () => {
  const mockCode = "github-auth-code";
  const mockGithubUser = {
    id: 12345,
    login: "testuser",
    name: "Test User",
    email: "test@example.com",
    avatar_url: "https://avatar.url",
  };

  beforeEach(() => {
    resetAllMocks();
  });

  it("should successfully authenticate with GitHub and create new user", async () => {
    const caller = createCaller();

    mockGithubFetchSequence({
      user: mockGithubUser,
    });

    mockPrismaClient.account.findUnique.mockResolvedValueOnce(null);
    mockPrismaClient.user.findUnique.mockResolvedValueOnce(null);
    mockPrismaClient.user.create.mockResolvedValueOnce({
      id: "user-123",
      email: mockGithubUser.email,
      name: mockGithubUser.name,
      avatarUrl: mockGithubUser.avatar_url,
      emailVerified: true,
    });
    mockPrismaClient.account.create.mockResolvedValueOnce({
      id: "account-123",
      userId: "user-123",
      provider: "github",
      providerAccountId: "12345",
    });

    const result = await caller.githubAuth({ code: mockCode });

    expect(result).toEqual({
      token: "mock-jwt-token",
      user: {
        id: "user-123",
        email: "test@example.com",
      },
    });
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(mockPrismaClient.user.create).toHaveBeenCalled();
    expect(mockJwtSign).toHaveBeenCalled();
  });

  it("should link GitHub account to existing user", async () => {
    const caller = createCaller();

    mockGithubFetchSequence({
      user: mockGithubUser,
    });

    mockPrismaClient.account.findUnique.mockResolvedValueOnce(null);
    mockPrismaClient.user.findUnique.mockResolvedValueOnce({
      id: "existing-user-123",
      email: mockGithubUser.email,
      name: "Existing User",
      avatarUrl: null,
    });

    mockPrismaClient.account.create.mockResolvedValueOnce({
      id: "account-123",
      userId: "existing-user-123",
      provider: "github",
    });

    mockPrismaClient.user.update.mockResolvedValueOnce({
      id: "existing-user-123",
      email: mockGithubUser.email,
      name: "Existing User",
      avatarUrl: mockGithubUser.avatar_url,
    });

    const result = await caller.githubAuth({ code: mockCode });

    expect(result).toEqual({
      token: "mock-jwt-token",
      user: {
        id: "existing-user-123",
        email: "test@example.com",
      },
    });
    expect(mockPrismaClient.account.create).toHaveBeenCalled();
    expect(mockPrismaClient.user.update).toHaveBeenCalled();
  });

  it("should update existing GitHub account", async () => {
    const caller = createCaller();

    mockGithubFetchSequence({
      user: mockGithubUser,
    });

    mockPrismaClient.account.findUnique.mockResolvedValueOnce({
      id: "account-123",
      userId: "user-123",
      provider: "github",
      providerAccountId: "12345",
      user: {
        id: "user-123",
        email: mockGithubUser.email,
        name: "Old Name",
        avatarUrl: "old-avatar",
      },
    });

    mockPrismaClient.user.update.mockResolvedValueOnce({
      id: "user-123",
      email: mockGithubUser.email,
      name: mockGithubUser.name,
      avatarUrl: mockGithubUser.avatar_url,
    });

    mockPrismaClient.account.update.mockResolvedValueOnce({
      id: "account-123",
    });

    const result = await caller.githubAuth({ code: mockCode });

    expect(result).toEqual({
      token: "mock-jwt-token",
      user: {
        id: "user-123",
        email: "test@example.com",
      },
    });
    expect(mockPrismaClient.user.update).toHaveBeenCalled();
    expect(mockPrismaClient.account.update).toHaveBeenCalled();
  });

  it("should throw BAD_REQUEST error if GitHub token exchange fails", async () => {
    const caller = createCaller();

    mockGithubFetchSequence({
      tokenError: "bad_verification_code",
    });

    try {
      await caller.githubAuth({ code: mockCode });
      expect(false).toBe(true);
    } catch (error) {
      expect(error).toBeInstanceOf(TRPCError);
      expect((error as TRPCError).code).toBe("BAD_REQUEST");
    }
  });

  it("should throw INTERNAL_SERVER_ERROR if GitHub user fetch fails", async () => {
    const caller = createCaller();

    mockGithubFetchSequence({
      userFetchFails: true,
    });

    try {
      await caller.githubAuth({ code: mockCode });
      expect(false).toBe(true);
    } catch (error) {
      expect(error).toBeInstanceOf(TRPCError);
      expect((error as TRPCError).code).toBe("INTERNAL_SERVER_ERROR");
      expect((error as TRPCError).message).toBe(
        "Failed to fetch GitHub user profile",
      );
    }
  });

  it("should handle missing email from GitHub", async () => {
    const caller = createCaller();

    const githubUserNoEmail = {
      ...mockGithubUser,
      email: null,
    };

    mockGithubFetchSequence({
      user: githubUserNoEmail,
      emails: [], // No emails available
    });

    mockPrismaClient.account.findUnique.mockResolvedValueOnce(null);
    mockPrismaClient.user.findUnique.mockResolvedValueOnce(null);
    mockPrismaClient.user.create.mockResolvedValueOnce({
      id: "user-123",
      email: "github_12345@placeholder.local",
      name: mockGithubUser.name,
      avatarUrl: mockGithubUser.avatar_url,
      emailVerified: false,
    });

    const result = await caller.githubAuth({ code: mockCode });

    expect(result).toEqual({
      token: "mock-jwt-token",
      user: {
        id: "user-123",
        email: "github_12345@placeholder.local",
      },
    });
    expect(mockPrismaClient.user.create).toHaveBeenCalled();
  });

  it("should validate input", async () => {
    const caller = createCaller();

    await expect(caller.githubAuth({ code: "" })).rejects.toThrow();
  });
});

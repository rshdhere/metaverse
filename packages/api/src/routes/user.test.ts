import { describe, it, expect, beforeEach, mock, spyOn } from "bun:test";
import { TRPCError } from "@trpc/server";
import jwt from "jsonwebtoken";
import type { Context } from "../trpc.js";

// Create mock functions
const mockPrismaClient = {
  user: {
    findFirst: mock(() => Promise.resolve(null)),
    findUnique: mock(() => Promise.resolve(null)),
    create: mock(() =>
      Promise.resolve({
        id: "user-123",
        email: "test@example.com",
        emailVerified: false,
      }),
    ),
    update: mock(() =>
      Promise.resolve({
        id: "user-123",
        email: "test@example.com",
        emailVerified: true,
      }),
    ),
  },
  account: {
    findUnique: mock(() => Promise.resolve(null)),
    create: mock(() =>
      Promise.resolve({
        id: "account-123",
        userId: "user-123",
        provider: "github",
      }),
    ),
    update: mock(() => Promise.resolve({ id: "account-123" })),
  },
  emailVerificationToken: {
    findUnique: mock(() => Promise.resolve(null)),
    create: mock(() =>
      Promise.resolve({
        id: "token-123",
        token: "test-token",
        email: "test@example.com",
      }),
    ),
    delete: mock(() => Promise.resolve({ id: "token-123" })),
    deleteMany: mock(() => Promise.resolve({ count: 1 })),
  },
};

const mockSendVerificationEmail = mock(() =>
  Promise.resolve({ success: true }),
);

// Mock modules before importing userRouter
mock.module("@repo/store", () => ({
  prismaClient: mockPrismaClient,
}));

mock.module("../email.js", () => ({
  sendVerificationEmail: mockSendVerificationEmail,
}));

// Mock global fetch
const mockFetch = mock(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
  } as Response),
);

global.fetch = mockFetch as typeof fetch;

// Mock jwt.sign
const mockJwtSign = spyOn(jwt, "sign").mockImplementation(
  () => "mock-jwt-token",
);

// Import userRouter after mocks are set up
import { userRouter } from "./user.js";

// Helper to create a caller
function createCaller() {
  const ctx: Context = { user: null };
  return userRouter.createCaller(ctx);
}

describe("userRouter", () => {
  beforeEach(() => {
    // Reset all mocks before each test
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
  });

  describe("signup", () => {
    it("should successfully create a new user", async () => {
      const caller = createCaller();
      mockPrismaClient.user.findFirst.mockResolvedValueOnce(null);
      mockPrismaClient.user.create.mockResolvedValueOnce({
        id: "user-123",
        email: "test@example.com",
        emailVerified: false,
        passwordHash: "hashed-password",
      });
      mockPrismaClient.emailVerificationToken.deleteMany.mockResolvedValueOnce({
        count: 0,
      });
      mockPrismaClient.emailVerificationToken.create.mockResolvedValueOnce({
        id: "token-123",
        token: "verification-token",
        email: "test@example.com",
        expiresAt: new Date(),
      });

      const result = await caller.signup({
        email: "test@example.com",
        password: "Test123!@#",
      });

      expect(result).toEqual({
        message: "Please check your email to verify your account",
        email: "test@example.com",
      });
      expect(mockPrismaClient.user.findFirst).toHaveBeenCalledWith({
        where: { email: "test@example.com" },
      });
      expect(mockPrismaClient.user.create).toHaveBeenCalled();
      expect(mockPrismaClient.emailVerificationToken.create).toHaveBeenCalled();
      expect(mockSendVerificationEmail).toHaveBeenCalled();
    });

    it("should throw CONFLICT error if user already exists", async () => {
      const caller = createCaller();
      mockPrismaClient.user.findFirst.mockResolvedValueOnce({
        id: "user-123",
        email: "test@example.com",
      });

      try {
        await caller.signup({
          email: "test@example.com",
          password: "Test123!@#",
        });
        expect(false).toBe(true); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe("CONFLICT");
        expect((error as TRPCError).message).toBe(
          "user already exists, try signing-in",
        );
      }
    });

    it("should validate email format", async () => {
      const caller = createCaller();

      await expect(
        caller.signup({
          email: "invalid-email",
          password: "Test123!@#",
        }),
      ).rejects.toThrow();
    });

    it("should validate password requirements", async () => {
      const caller = createCaller();

      // Too short
      await expect(
        caller.signup({
          email: "test@example.com",
          password: "Short1!",
        }),
      ).rejects.toThrow();

      // Missing uppercase
      await expect(
        caller.signup({
          email: "test@example.com",
          password: "lowercase123!",
        }),
      ).rejects.toThrow();

      // Missing lowercase
      await expect(
        caller.signup({
          email: "test@example.com",
          password: "UPPERCASE123!",
        }),
      ).rejects.toThrow();

      // Missing number
      await expect(
        caller.signup({
          email: "test@example.com",
          password: "NoNumber!@#",
        }),
      ).rejects.toThrow();

      // Missing special character
      await expect(
        caller.signup({
          email: "test@example.com",
          password: "NoSpecial123",
        }),
      ).rejects.toThrow();
    });
  });

  describe("verifyEmail", () => {
    it("should successfully verify email and return JWT token", async () => {
      const caller = createCaller();
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const token = "valid-token";

      mockPrismaClient.emailVerificationToken.findUnique.mockResolvedValueOnce({
        id: "token-123",
        token,
        email: "test@example.com",
        expiresAt: futureDate,
      });

      mockPrismaClient.user.findUnique.mockResolvedValueOnce({
        id: "user-123",
        email: "test@example.com",
        emailVerified: false,
      });

      mockPrismaClient.user.update.mockResolvedValueOnce({
        id: "user-123",
        email: "test@example.com",
        emailVerified: true,
      });

      mockPrismaClient.emailVerificationToken.delete.mockResolvedValueOnce({
        id: "token-123",
      });

      const result = await caller.verifyEmail({ token });

      expect(result).toEqual({ token: "mock-jwt-token" });
      expect(
        mockPrismaClient.emailVerificationToken.findUnique,
      ).toHaveBeenCalledWith({
        where: { token },
      });
      expect(mockPrismaClient.user.update).toHaveBeenCalledWith({
        where: { id: "user-123" },
        data: { emailVerified: true },
      });
      expect(mockPrismaClient.emailVerificationToken.delete).toHaveBeenCalled();
      expect(mockJwtSign).toHaveBeenCalled();
    });

    it("should throw NOT_FOUND error for invalid token", async () => {
      const caller = createCaller();
      mockPrismaClient.emailVerificationToken.findUnique.mockResolvedValueOnce(
        null,
      );

      try {
        await caller.verifyEmail({ token: "invalid-token" });
        expect(false).toBe(true); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe("NOT_FOUND");
        expect((error as TRPCError).message).toBe(
          "Invalid or expired verification link",
        );
      }
    });

    it("should throw BAD_REQUEST error for expired token", async () => {
      const caller = createCaller();
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const token = "expired-token";

      mockPrismaClient.emailVerificationToken.findUnique.mockResolvedValueOnce({
        id: "token-123",
        token,
        email: "test@example.com",
        expiresAt: pastDate,
      });

      mockPrismaClient.emailVerificationToken.delete.mockResolvedValueOnce({
        id: "token-123",
      });

      try {
        await caller.verifyEmail({ token });
        expect(false).toBe(true); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe("BAD_REQUEST");
        expect((error as TRPCError).message).toBe(
          "Verification link has expired. Please sign up again.",
        );
      }
      expect(mockPrismaClient.emailVerificationToken.delete).toHaveBeenCalled();
    });

    it("should throw NOT_FOUND error if user not found", async () => {
      const caller = createCaller();
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const token = "valid-token";

      mockPrismaClient.emailVerificationToken.findUnique.mockResolvedValueOnce({
        id: "token-123",
        token,
        email: "test@example.com",
        expiresAt: futureDate,
      });

      mockPrismaClient.user.findUnique.mockResolvedValueOnce(null);

      try {
        await caller.verifyEmail({ token });
        expect(false).toBe(true); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe("NOT_FOUND");
        expect((error as TRPCError).message).toBe("User not found");
      }
    });

    it("should validate token input", async () => {
      const caller = createCaller();

      await expect(caller.verifyEmail({ token: "" })).rejects.toThrow();
    });
  });

  describe("resendVerification", () => {
    it("should successfully resend verification email", async () => {
      const caller = createCaller();
      const email = "test@example.com";

      mockPrismaClient.user.findUnique.mockResolvedValueOnce({
        id: "user-123",
        email,
        emailVerified: false,
      });

      mockPrismaClient.emailVerificationToken.deleteMany.mockResolvedValueOnce({
        count: 1,
      });
      mockPrismaClient.emailVerificationToken.create.mockResolvedValueOnce({
        id: "token-123",
        token: "new-token",
        email,
        expiresAt: new Date(),
      });

      mockSendVerificationEmail.mockResolvedValueOnce({ success: true });

      const result = await caller.resendVerification({ email });

      expect(result).toEqual({
        message: "If an account exists, a verification email has been sent",
      });
      expect(mockPrismaClient.user.findUnique).toHaveBeenCalledWith({
        where: { email },
      });
      expect(
        mockPrismaClient.emailVerificationToken.deleteMany,
      ).toHaveBeenCalledWith({
        where: { email },
      });
      expect(mockPrismaClient.emailVerificationToken.create).toHaveBeenCalled();
      expect(mockSendVerificationEmail).toHaveBeenCalled();
    });

    it("should return success message even if user doesn't exist (security)", async () => {
      const caller = createCaller();
      const email = "nonexistent@example.com";

      mockPrismaClient.user.findUnique.mockResolvedValueOnce(null);

      const result = await caller.resendVerification({ email });

      expect(result).toEqual({
        message: "If an account exists, a verification email has been sent",
      });
      expect(mockPrismaClient.user.findUnique).toHaveBeenCalledWith({
        where: { email },
      });
      expect(mockSendVerificationEmail).not.toHaveBeenCalled();
    });

    it("should throw BAD_REQUEST error if email already verified", async () => {
      const caller = createCaller();
      const email = "test@example.com";

      mockPrismaClient.user.findUnique.mockResolvedValueOnce({
        id: "user-123",
        email,
        emailVerified: true,
      });

      try {
        await caller.resendVerification({ email });
        expect(false).toBe(true); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe("BAD_REQUEST");
        expect((error as TRPCError).message).toBe("Email is already verified");
      }
    });

    it("should validate email format", async () => {
      const caller = createCaller();

      await expect(
        caller.resendVerification({ email: "invalid-email" }),
      ).rejects.toThrow();
    });
  });

  describe("login", () => {
    it("should successfully login and return JWT token", async () => {
      const caller = createCaller();
      const email = "test@example.com";
      const password = "Test123!@#";
      const passwordHash = await Bun.password.hash(password);

      mockPrismaClient.user.findFirst.mockResolvedValueOnce({
        id: "user-123",
        email,
        emailVerified: true,
        passwordHash,
      });

      const result = await caller.login({ email, password });

      expect(result).toEqual({ token: "mock-jwt-token" });
      expect(mockPrismaClient.user.findFirst).toHaveBeenCalledWith({
        where: { email },
      });
      expect(mockJwtSign).toHaveBeenCalled();
    });

    it("should throw NOT_FOUND error if user doesn't exist", async () => {
      const caller = createCaller();
      mockPrismaClient.user.findFirst.mockResolvedValueOnce(null);

      try {
        await caller.login({
          email: "nonexistent@example.com",
          password: "Test123!@#",
        });
        expect(false).toBe(true); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe("NOT_FOUND");
        expect((error as TRPCError).message).toBe("user not found");
      }
    });

    it("should throw NOT_FOUND error if user has no password hash", async () => {
      const caller = createCaller();
      mockPrismaClient.user.findFirst.mockResolvedValueOnce({
        id: "user-123",
        email: "test@example.com",
        passwordHash: null,
      });

      try {
        await caller.login({
          email: "test@example.com",
          password: "Test123!@#",
        });
        expect(false).toBe(true); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe("NOT_FOUND");
      }
    });

    it("should throw FORBIDDEN error if email not verified", async () => {
      const caller = createCaller();
      const password = "Test123!@#";
      const passwordHash = await Bun.password.hash(password);

      mockPrismaClient.user.findFirst.mockResolvedValueOnce({
        id: "user-123",
        email: "test@example.com",
        emailVerified: false,
        passwordHash,
      });

      try {
        await caller.login({
          email: "test@example.com",
          password,
        });
        expect(false).toBe(true); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe("FORBIDDEN");
        expect((error as TRPCError).message).toBe(
          "Please verify your email before logging in",
        );
      }
    });

    it("should throw UNAUTHORIZED error for wrong password", async () => {
      const caller = createCaller();
      const wrongPasswordHash = await Bun.password.hash("WrongPassword123!@#");

      mockPrismaClient.user.findFirst.mockResolvedValueOnce({
        id: "user-123",
        email: "test@example.com",
        emailVerified: true,
        passwordHash: wrongPasswordHash,
      });

      try {
        await caller.login({
          email: "test@example.com",
          password: "Test123!@#",
        });
        expect(false).toBe(true); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe("UNAUTHORIZED");
        expect((error as TRPCError).message).toBe("Invalid Credentials");
      }
    });

    it("should validate input", async () => {
      const caller = createCaller();

      await expect(
        caller.login({
          email: "invalid-email",
          password: "Test123!@#",
        }),
      ).rejects.toThrow();
    });
  });

  describe("githubAuth", () => {
    const mockCode = "github-auth-code";
    const mockAccessToken = "github-access-token";
    const mockGithubUser = {
      id: 12345,
      login: "testuser",
      name: "Test User",
      email: "test@example.com",
      avatar_url: "https://avatar.url",
    };
    const mockGithubEmails = [
      {
        email: "test@example.com",
        primary: true,
        verified: true,
        visibility: "public",
      },
    ];

    beforeEach(() => {
      // Reset fetch mock
      mockFetch.mockClear();
    });

    it("should successfully authenticate with GitHub and create new user", async () => {
      const caller = createCaller();

      // Mock GitHub token exchange
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: mockAccessToken,
            token_type: "bearer",
            scope: "user:email",
          }),
      } as Response);

      // Mock GitHub user fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockGithubUser),
      } as Response);

      // Mock GitHub emails fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockGithubEmails),
      } as Response);

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

      expect(result).toEqual({ token: "mock-jwt-token" });
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(mockPrismaClient.user.create).toHaveBeenCalled();
      expect(mockJwtSign).toHaveBeenCalled();
    });

    it("should link GitHub account to existing user", async () => {
      const caller = createCaller();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: mockAccessToken,
            token_type: "bearer",
            scope: "user:email",
          }),
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockGithubUser),
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockGithubEmails),
      } as Response);

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

      expect(result).toEqual({ token: "mock-jwt-token" });
      expect(mockPrismaClient.account.create).toHaveBeenCalled();
      expect(mockPrismaClient.user.update).toHaveBeenCalled();
    });

    it("should update existing GitHub account", async () => {
      const caller = createCaller();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: mockAccessToken,
            token_type: "bearer",
            scope: "user:email",
          }),
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockGithubUser),
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockGithubEmails),
      } as Response);

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

      expect(result).toEqual({ token: "mock-jwt-token" });
      expect(mockPrismaClient.user.update).toHaveBeenCalled();
      expect(mockPrismaClient.account.update).toHaveBeenCalled();
    });

    it("should throw BAD_REQUEST error if GitHub token exchange fails", async () => {
      const caller = createCaller();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            error: "bad_verification_code",
            error_description: "The code passed is incorrect or expired",
          }),
      } as Response);

      try {
        await caller.githubAuth({ code: mockCode });
        expect(false).toBe(true); // Should not reach here
      } catch (error) {
        expect(error).toBeInstanceOf(TRPCError);
        expect((error as TRPCError).code).toBe("BAD_REQUEST");
      }
    });

    it("should throw INTERNAL_SERVER_ERROR if GitHub user fetch fails", async () => {
      const caller = createCaller();

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: mockAccessToken,
            token_type: "bearer",
            scope: "user:email",
          }),
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      } as Response);

      try {
        await caller.githubAuth({ code: mockCode });
        expect(false).toBe(true); // Should not reach here
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

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: mockAccessToken,
            token_type: "bearer",
            scope: "user:email",
          }),
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(githubUserNoEmail),
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({}),
      } as Response);

      mockPrismaClient.account.findUnique.mockResolvedValueOnce(null);
      mockPrismaClient.user.findUnique.mockResolvedValueOnce(null);
      mockPrismaClient.user.create.mockResolvedValueOnce({
        id: "user-123",
        email: `github_${githubUserNoEmail.id}@placeholder.local`,
        name: githubUserNoEmail.name,
        avatarUrl: githubUserNoEmail.avatar_url,
        emailVerified: false,
      });

      const result = await caller.githubAuth({ code: mockCode });

      expect(result).toEqual({ token: "mock-jwt-token" });
      expect(mockPrismaClient.user.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            email: `github_${githubUserNoEmail.id}@placeholder.local`,
            emailVerified: false,
          }),
        }),
      );
    });

    it("should validate input", async () => {
      const caller = createCaller();

      await expect(caller.githubAuth({ code: "" })).rejects.toThrow();
    });
  });
});

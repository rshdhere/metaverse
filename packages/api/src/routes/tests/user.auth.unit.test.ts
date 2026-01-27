/**
 * User Authentication Unit Tests
 *
 * Purpose: Pure router behavior tests
 * Contains: signup, login, verifyEmail, resendVerification
 *
 * These tests:
 * - Mock Prisma hard
 * - Assert exact TRPCError codes/messages
 * - Are fast and deterministic
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
  mockPrismaClient,
  mockSendVerificationEmail,
  mockJwtSign,
  createCaller,
  resetAllMocks,
  TRPCError,
} from "./_setup/authTestSetup.js";

describe("userRouter", () => {
  beforeEach(() => {
    resetAllMocks();
  });

  // ==========================================================================
  // SIGNUP TESTS
  // ==========================================================================

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

  // ==========================================================================
  // VERIFY EMAIL TESTS
  // ==========================================================================

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
        expect(false).toBe(true);
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
        expect(false).toBe(true);
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
        expect(false).toBe(true);
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

  // ==========================================================================
  // RESEND VERIFICATION TESTS
  // ==========================================================================

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
        expect(false).toBe(true);
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

  // ==========================================================================
  // LOGIN TESTS
  // ==========================================================================

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
        expect(false).toBe(true);
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
        expect(false).toBe(true);
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
        expect(false).toBe(true);
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
        expect(false).toBe(true);
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
});

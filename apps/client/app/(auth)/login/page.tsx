"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { GITHUB_OAUTH_URL } from "@repo/config/constants";
import { PasswordInput } from "@/components/ui/password-input";

function getErrorMessage(error: { message: string }): string {
  try {
    const parsed = JSON.parse(error.message);
    if (Array.isArray(parsed) && parsed.length > 0 && parsed[0].message) {
      return parsed[0].message;
    }
  } catch {
    // Not JSON, return as-is
  }
  return error.message;
}

function handleGitHubLogin() {
  // Generate state for CSRF protection
  const state = crypto.randomUUID();
  sessionStorage.setItem("oauth_state", state);

  const params = new URLSearchParams({
    client_id: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID || "",
    scope: "read:user user:email",
    state,
  });

  window.location.href = `${GITHUB_OAUTH_URL}?${params.toString()}`;
}

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showResendOption, setShowResendOption] = useState(false);

  // Handle OAuth error from redirect
  useEffect(() => {
    const error = searchParams.get("error");
    if (error) {
      toast.error("Authentication failed", {
        description: error,
      });
      // Clear the error from URL
      const url = new URL(window.location.href);
      url.searchParams.delete("error");
      window.history.replaceState({}, "", url.pathname);
    }
  }, [searchParams]);

  // Handle session expiration
  useEffect(() => {
    const sessionExpired = sessionStorage.getItem("session_expired");
    if (sessionExpired === "true") {
      toast.info("Session expired", {
        description: "Your session has expired. Please log in again.",
      });
      sessionStorage.removeItem("session_expired");
    }
  }, []);

  const login = trpc.user.login.useMutation({
    onSuccess: (data) => {
      localStorage.setItem("token", data.token);
      toast.success("Welcome back!", {
        description: "You have been logged in successfully.",
      });
      router.push("/");
    },
    onError: (err) => {
      const message = getErrorMessage(err);
      // Check if error is about unverified email
      if (message.toLowerCase().includes("verify your email")) {
        setShowResendOption(true);
      }
      toast.error("Login failed", {
        description: message,
      });
    },
  });

  const resendVerification = trpc.user.resendVerification.useMutation({
    onSuccess: () => {
      toast.success("Verification email sent", {
        description: "Please check your inbox",
      });
    },
    onError: (err) => {
      toast.error("Failed to resend", {
        description: getErrorMessage(err),
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowResendOption(false);
    login.mutate({ email, password });
  };

  const handleResend = () => {
    if (email) {
      resendVerification.mutate({ email });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold">Welcome back</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Enter your credentials to continue
          </p>
        </div>

        {/* GitHub OAuth Button */}
        <button
          type="button"
          onClick={handleGitHubLogin}
          className="flex w-full items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-800 dark:text-white dark:hover:bg-gray-700"
        >
          <svg
            className="h-5 w-5"
            fill="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"
              clipRule="evenodd"
            />
          </svg>
          Continue with GitHub
        </button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-gray-300 dark:border-gray-700" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-2 text-gray-500 dark:bg-gray-950 dark:text-gray-400">
              Or continue with email
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-black focus:outline-none focus:ring-2 focus:ring-gray-900 dark:border-gray-700 dark:bg-gray-900 dark:text-white dark:focus:ring-gray-100"
            />
          </div>

          <div className="space-y-2">
            <label htmlFor="password" className="text-sm font-medium">
              Password
            </label>
            <PasswordInput
              id="password"
              value={password}
              onChange={setPassword}
              required
            />
          </div>

          <button
            type="submit"
            disabled={login.isPending}
            className="w-full rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
          >
            {login.isPending ? "Logging in..." : "Log in"}
          </button>
        </form>

        {showResendOption && email && (
          <div className="rounded-md border border-yellow-200 bg-yellow-50 p-4 dark:border-yellow-800 dark:bg-yellow-900/20">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              Your email is not verified yet.{" "}
              <button
                type="button"
                onClick={handleResend}
                disabled={resendVerification.isPending}
                className="font-medium underline hover:no-underline disabled:opacity-50"
              >
                {resendVerification.isPending
                  ? "Sending..."
                  : "Resend verification email"}
              </button>
            </p>
          </div>
        )}

        <p className="text-center text-sm text-gray-500 dark:text-gray-400">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="font-medium text-black hover:underline"
          >
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
}

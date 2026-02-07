"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { GITHUB_OAUTH_URL } from "@repo/config/constants";
import { PasswordInput, isPasswordValid } from "@/components/ui/password-input";
import { Button } from "@/components/ui/button";

import SplitAuthLayout from "@/components/auth/SplitAuthLayout";

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

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [verificationSent, setVerificationSent] = useState(false);
  const [sentToEmail, setSentToEmail] = useState("");

  const signup = trpc.user.signup.useMutation({
    onSuccess: (data) => {
      setSentToEmail(data.email);
      setVerificationSent(true);
      toast("Check your email", {
        description: data.message,
        icon: <CheckCircle className="h-5 w-5 text-black dark:text-white" />,
        className:
          "!bg-white !text-black dark:!bg-black dark:!text-white !border-black dark:!border-white",
      });
    },
    onError: (err) => {
      toast.error("Sign up failed", {
        description: getErrorMessage(err),
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
    signup.mutate({ email, password });
  };

  const handleResend = () => {
    resendVerification.mutate({ email: sentToEmail });
  };

  const resendToastShown = useRef(false);

  useEffect(() => {
    if (verificationSent && !resendToastShown.current) {
      resendToastShown.current = true;
      const timer = setTimeout(() => {
        toast("Didn't receive the email?", {
          description: "Check your spam folder or click here",
          duration: Infinity,
          action: {
            label: "Resend",
            onClick: handleResend,
          },
        });
      }, 10000);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verificationSent, sentToEmail]);

  // Show verification sent screen
  if (verificationSent) {
    return (
      <SplitAuthLayout>
        <div className="space-y-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center">
            <svg
              className="h-10 w-10 animate-spin text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-foreground">
              Check your email
            </h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              We&apos;ve sent a verification link to{" "}
              <span className="font-medium text-gray-900 dark:text-white">
                {sentToEmail}
              </span>
            </p>
          </div>

          <p className="text-sm text-gray-500 dark:text-gray-400">
            Click the link in the email to verify your account. The link will
            expire in 24 hours.
          </p>

          <p className="text-center text-sm text-gray-500 dark:text-gray-400">
            <Link
              href="/login"
              className="font-medium text-black hover:underline dark:text-white"
            >
              Back to login
            </Link>
          </p>
        </div>
      </SplitAuthLayout>
    );
  }

  return (
    <SplitAuthLayout>
      <div className="space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            Create an account
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Enter your details to get started
          </p>
        </div>

        {/* GitHub OAuth Button */}
        <Button
          variant="outline"
          type="button"
          onClick={handleGitHubLogin}
          className="w-full cursor-pointer"
        >
          <svg
            className="mr-2 h-4 w-4"
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
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-gray-300 dark:border-gray-800" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white px-2 text-gray-500 dark:bg-black dark:text-gray-400">
              Or continue with email
            </span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="email"
              className="text-sm font-medium text-gray-200"
            >
              Email
            </label>
            <input
              id="email"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full rounded-md border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-400"
            />
          </div>

          <div className="space-y-2">
            <label
              htmlFor="password"
              className="text-sm font-medium text-gray-200"
            >
              Password
            </label>
            <PasswordInput
              id="password"
              value={password}
              onChange={setPassword}
              required
              showStrength
            />
          </div>

          <Button
            type="submit"
            disabled={signup.isPending || !isPasswordValid(password)}
            className="w-full cursor-pointer"
          >
            {signup.isPending ? "Creating account..." : "Sign up"}
          </Button>
        </form>

        <p className="text-center text-sm text-gray-500 dark:text-gray-400">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-white hover:underline"
          >
            Log in
          </Link>
        </p>
      </div>
    </SplitAuthLayout>
  );
}

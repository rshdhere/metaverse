"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

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

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token");

  const [status, setStatus] = useState<"loading" | "success" | "error">(
    "loading",
  );
  const [errorMessage, setErrorMessage] = useState("");

  const verifyEmail = trpc.user.verifyEmail.useMutation({
    onSuccess: (data) => {
      localStorage.setItem("token", data.token);
      setStatus("success");
      toast.success("Email verified!", {
        description: "Your account is now active.",
      });
      // Redirect to home after a short delay
      setTimeout(() => {
        router.push("/");
      }, 2000);
    },
    onError: (err) => {
      setStatus("error");
      setErrorMessage(getErrorMessage(err));
      toast.error("Verification failed", {
        description: getErrorMessage(err),
      });
    },
  });

  useEffect(() => {
    if (token && status === "loading") {
      verifyEmail.mutate({ token });
    } else if (!token) {
      setStatus("error");
      setErrorMessage("No verification token provided");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        {status === "loading" && (
          <>
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
              <h1 className="text-2xl font-semibold">Verifying your email</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Please wait while we verify your email address...
              </p>
            </div>
          </>
        )}

        {status === "success" && (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
              <svg
                className="h-8 w-8 text-green-600 dark:text-green-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold">Email verified!</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Your account is now active. Redirecting you to the homepage...
              </p>
            </div>
          </>
        )}

        {status === "error" && (
          <>
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900">
              <svg
                className="h-8 w-8 text-red-600 dark:text-red-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold">Verification failed</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {errorMessage}
              </p>
            </div>
            <div className="space-y-3">
              <Link
                href="/signup"
                className="block w-full rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white hover:bg-gray-800 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200"
              >
                Try signing up again
              </Link>
              <Link
                href="/login"
                className="block text-sm font-medium text-gray-900 hover:underline dark:text-white"
              >
                Back to login
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

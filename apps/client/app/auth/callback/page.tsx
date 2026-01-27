"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const token = searchParams.get("token");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
      toast.error("Authentication failed", {
        description: error,
      });
      setTimeout(() => router.push("/login"), 2000);
      return;
    }

    if (!token) {
      toast.error("Authentication failed", {
        description: "No authentication token received",
      });
      setTimeout(() => router.push("/login"), 2000);
      return;
    }

    // Verify state matches (CSRF protection)
    const savedState = sessionStorage.getItem("oauth_state");
    if (state && savedState && state !== savedState) {
      toast.error("Authentication failed", {
        description: "Security verification failed. Please try again.",
      });
      sessionStorage.removeItem("oauth_state");
      setTimeout(() => router.push("/login"), 2000);
      return;
    }

    // Clear the saved state
    sessionStorage.removeItem("oauth_state");

    // Store the token
    localStorage.setItem("token", token);

    toast.success("Welcome!", {
      description: "You have been signed in with GitHub successfully.",
    });

    // Redirect to home after a short delay to show the toast
    setTimeout(() => router.push("/"), 1500);
  }, [searchParams, router]);

  // Only show a loading spinner while processing
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-gray-300 border-t-gray-900 dark:border-gray-700 dark:border-t-gray-100" />
    </div>
  );
}

"use client";

import { createTRPCReact } from "@trpc/react-query";
import { httpBatchLink } from "@trpc/client";
import { TRPCClientError } from "@trpc/client";
import { QueryClient, QueryCache, MutationCache } from "@tanstack/react-query";
import { BACKEND_URL } from "@repo/config/constants";
import type { AppRouter } from "@repo/api";
import { logout, isTokenExpired } from "./auth";

export const trpc = createTRPCReact<AppRouter>();

function getApiUrl() {
  // BACKEND_URL is already environment-aware (dev vs production)
  return BACKEND_URL;
}

export function getTrpcClient() {
  return trpc.createClient({
    links: [
      httpBatchLink({
        url: getApiUrl(),
        headers() {
          const token =
            typeof window !== "undefined"
              ? localStorage.getItem("token")
              : null;

          // Check if token is expired before sending request
          if (token && isTokenExpired(token)) {
            logout("/login", true); // Show toast for automatic logout
            return {};
          }

          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    ],
  });
}

/**
 * Create QueryClient with error handling for UNAUTHORIZED errors
 */
export function createQueryClient() {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (err) => {
        if (err instanceof TRPCClientError) {
          // Handle UNAUTHORIZED errors
          if (err.data?.code === "UNAUTHORIZED") {
            logout("/login", true); // Show toast for automatic logout
          }
        }
      },
    }),
    mutationCache: new MutationCache({
      onError: (err) => {
        if (err instanceof TRPCClientError) {
          // Handle UNAUTHORIZED errors
          if (err.data?.code === "UNAUTHORIZED") {
            logout("/login", true); // Show toast for automatic logout
          }
        }
      },
    }),
  });
}

"use client";

import React, { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { trpc, getTrpcClient, createQueryClient } from "@/lib/trpc";
import { TokenMonitor } from "@/components/auth/token-monitor";

export function TRPCProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => createQueryClient());
  const [trpcClient] = useState(() => getTrpcClient());

  return (
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <TokenMonitor />
        {children as any}
        <Toaster
          position="bottom-right"
          richColors
          toastOptions={{
            style: { fontFamily: "Inter, sans-serif" },
          }}
        />
      </QueryClientProvider>
    </trpc.Provider>
  );
}

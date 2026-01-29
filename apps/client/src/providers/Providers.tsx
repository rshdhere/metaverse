"use client";
import React from "react";
import { AppStateProvider } from "./AppStateProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return <AppStateProvider>{children}</AppStateProvider>;
}

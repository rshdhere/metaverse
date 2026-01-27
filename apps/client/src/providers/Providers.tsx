"use client";
import React from "react";
import { ThemeProvider } from "@mui/material/styles";
import muiTheme from "../theme/muiTheme";
import { AppStateProvider } from "./AppStateProvider";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AppStateProvider>
      <ThemeProvider theme={muiTheme}>{children}</ThemeProvider>
    </AppStateProvider>
  );
}

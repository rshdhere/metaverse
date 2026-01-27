import React from "react";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { TRPCProvider } from "./providers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Turborepo Template",
  description: "Full-stack TypeScript monorepo template",
  icons: {
    icon: "/circle_logo.png",
    apple: "/circle_logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <TRPCProvider>
            <main className="bg-background text-foreground min-h-screen">
              {children}
            </main>
          </TRPCProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

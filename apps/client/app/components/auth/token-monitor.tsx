"use client";

import { useEffect } from "react";
import { isTokenExpired, getTimeUntilExpiration, logout } from "@/lib/auth";

/**
 * Component that monitors JWT token expiration and automatically logs out when expired
 * This should be mounted once at the app root level
 */
export function TokenMonitor() {
  useEffect(() => {
    const token = localStorage.getItem("token");

    // If no token, nothing to monitor
    if (!token) {
      return;
    }

    // If token is expired, logout immediately
    if (isTokenExpired(token)) {
      logout("/login", true); // Show toast for automatic logout
      return;
    }

    // Calculate time until expiration
    const timeUntilExpiration = getTimeUntilExpiration(token);

    if (timeUntilExpiration === null || timeUntilExpiration <= 0) {
      logout("/login", true); // Show toast for automatic logout
      return;
    }

    // Set timeout to logout when token expires
    // Add a small buffer (1 second) to ensure we logout slightly before expiration
    const timeoutId = setTimeout(
      () => {
        logout("/login", true); // Show toast for automatic logout
      },
      Math.max(0, timeUntilExpiration - 1000),
    );

    // Also check periodically every 30 seconds as a safety measure
    const intervalId = setInterval(() => {
      const currentToken = localStorage.getItem("token");
      if (currentToken && isTokenExpired(currentToken)) {
        logout("/login", true); // Show toast for automatic logout
      }
    }, 30000); // Check every 30 seconds

    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, []);

  // This component doesn't render anything
  return null;
}

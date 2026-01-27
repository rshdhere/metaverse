/**
 * Auth utility functions for token management and validation
 */

/**
 * Decode JWT token without verification (client-side only)
 * Note: This only decodes the payload, it does NOT verify the signature
 */
function decodeJWT(
  token: string,
): { userId: string; exp: number; iat: number } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return null;
    }

    const payload = parts[1];
    // Decode base64url
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const jsonPayload = decodeURIComponent(
      atob(base64)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join(""),
    );

    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

/**
 * Check if a JWT token is expired
 */
export function isTokenExpired(token: string | null): boolean {
  if (!token) {
    return true;
  }

  const decoded = decodeJWT(token);
  if (!decoded || !decoded.exp) {
    return true;
  }

  // Check if token is expired (with 5 second buffer for clock skew)
  const currentTime = Math.floor(Date.now() / 1000);
  return decoded.exp < currentTime - 5;
}

/**
 * Get token expiration time in milliseconds
 */
export function getTokenExpirationTime(token: string | null): number | null {
  if (!token) {
    return null;
  }

  const decoded = decodeJWT(token);
  if (!decoded || !decoded.exp) {
    return null;
  }

  return decoded.exp * 1000; // Convert to milliseconds
}

/**
 * Get time until token expires in milliseconds
 */
export function getTimeUntilExpiration(token: string | null): number | null {
  const expirationTime = getTokenExpirationTime(token);
  if (!expirationTime) {
    return null;
  }

  const timeUntilExpiration = expirationTime - Date.now();
  return timeUntilExpiration > 0 ? timeUntilExpiration : 0;
}

/**
 * Logout user by clearing token and redirecting
 * @param redirectTo - URL to redirect to after logout (default: "/login")
 * @param showToast - Whether to show a toast notification (default: false)
 */
export function logout(
  redirectTo: string = "/login",
  showToast: boolean = false,
): void {
  if (typeof window === "undefined") {
    return;
  }

  localStorage.removeItem("token");

  // Store flag in sessionStorage to show toast on login page (for automatic logout)
  if (showToast) {
    sessionStorage.setItem("session_expired", "true");
  }

  // Redirect to login page
  window.location.href = redirectTo;
}

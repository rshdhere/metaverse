// Authentication utility functions for managing tokens and cookies

export function setAuthCookie(
  token: string,
  username: string,
  avatarName?: string,
) {
  if (typeof window === "undefined") return;

  // Set cookie with 7 days expiration
  const expiresIn = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
  const expires = new Date(Date.now() + expiresIn).toUTCString();

  document.cookie = `authToken=${token}; path=/; expires=${expires}; SameSite=Lax`;

  // Also store in localStorage for easier access
  localStorage.setItem("authToken", token);
  localStorage.setItem("username", username);
  if (avatarName) {
    localStorage.setItem("avatarName", avatarName);
  }
}

export function removeAuthCookie() {
  if (typeof window === "undefined") return;

  // Remove cookie
  document.cookie = "authToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";

  // Remove from localStorage
  localStorage.removeItem("authToken");
  localStorage.removeItem("username");
  localStorage.removeItem("avatarName");
}

export function getAuthToken(): string | null {
  if (typeof window === "undefined") return null;

  // Try localStorage first (faster)
  const token = localStorage.getItem("authToken");
  if (token) return token;

  // Fallback to cookie
  const cookies = document.cookie.split(";");
  for (const cookie of cookies) {
    const [name, value] = cookie.trim().split("=");
    if (name === "authToken") {
      return value;
    }
  }

  return null;
}

export function getStoredCredentials() {
  if (typeof window === "undefined") return null;

  const token = getAuthToken();
  const username = localStorage.getItem("username");
  const avatarName = localStorage.getItem("avatarName");

  if (!token || !username) return null;

  return { token, username, avatarName: avatarName || "ron" };
}

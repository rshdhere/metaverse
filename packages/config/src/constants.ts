// Shared constants that can be used by both client and server
// No Bun-specific APIs here

const isProduction =
  typeof process !== "undefined" && process.env.NODE_ENV === "production";

// Backend API
export const BACKEND_PORT = 8082;
export const BACKEND_URL = isProduction
  ? "https://game-server.raashed.xyz"
  : `http://localhost:${BACKEND_PORT}`;

// Frontend
export const FRONTEND_PORT = 3001;
export const FRONTEND_URL = isProduction
  ? "https://game.raashed.xyz"
  : `http://localhost:${FRONTEND_PORT}`;

// WebSocket (World Server)
export const WS_PORT = 8083;
export const WS_URL = isProduction
  ? "https://game.raashed.xyz/ws"
  : `ws://localhost:${WS_PORT}/ws`;

// CORS allowed origins
export const CORS_ORIGINS = [
  "http://localhost:3001",
  "https://game.raashed.xyz",
  "https://raashed.xyz",
];

// GitHub OAuth URLs
export const GITHUB_OAUTH_URL = "https://github.com/login/oauth/authorize";
export const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
export const GITHUB_USER_URL = "https://api.github.com/user";
export const GITHUB_EMAILS_URL = "https://api.github.com/user/emails";

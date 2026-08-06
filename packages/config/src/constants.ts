// Shared constants that can be used by both client and server
// No Bun-specific APIs here

const isProduction =
  typeof process !== "undefined" && process.env.NODE_ENV === "production";

const PRODUCTION_ORIGINS = [
  "https://metaverse.raashed.com",
  "https://game.raashed.com",
  "https://game-server.raashed.com",
] as const;

// Backend API
export const BACKEND_PORT = 8082;
export const BACKEND_URL =
  typeof window !== "undefined"
    ? window.location.hostname === "localhost"
      ? `http://localhost:${BACKEND_PORT}`
      : "https://game-server.raashed.com"
    : isProduction
      ? "https://game-server.raashed.com"
      : `http://localhost:${BACKEND_PORT}`;

// Frontend
export const FRONTEND_PORT = 3001;
export const FRONTEND_URL =
  typeof window !== "undefined"
    ? window.location.hostname === "localhost"
      ? `http://localhost:${FRONTEND_PORT}`
      : "https://metaverse.raashed.com"
    : isProduction
      ? "https://metaverse.raashed.com"
      : `http://localhost:${FRONTEND_PORT}`;

// WebSocket (World Server)
export const WS_PORT = 8083;
export const WS_URL =
  typeof window !== "undefined"
    ? window.location.hostname === "localhost"
      ? `ws://localhost:${WS_PORT}/ws`
      : "wss://game.raashed.com/ws"
    : `ws://localhost:${WS_PORT}/ws`;

// CORS allowed origins (production hosts only)
export const CORS_ORIGINS = [...PRODUCTION_ORIGINS];

// GitHub OAuth URLs
export const GITHUB_OAUTH_URL = "https://github.com/login/oauth/authorize";
export const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
export const GITHUB_USER_URL = "https://api.github.com/user";
export const GITHUB_EMAILS_URL = "https://api.github.com/user/emails";

export const TEST_CREDENTIALS = [
  {
    label: "test-credential-01",
    email: "test-credential-01@metaverse.raashed.cloud",
    password: "TestCredential01!",
  },
  {
    label: "test-credential-02",
    email: "test-credential-02@metaverse.raashed.cloud",
    password: "TestCredential02!",
  },
] as const;

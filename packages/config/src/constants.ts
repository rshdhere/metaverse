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
  ? "https://metaverse.raashed.xyz"
  : `http://localhost:${FRONTEND_PORT}`;

// WebSocket (World Server)
export const WS_PORT = 8083;
export const WS_URL =
  typeof window !== "undefined"
    ? window.location.hostname === "localhost"
      ? `ws://localhost:${WS_PORT}/ws`
      : // VPS production (frontend → dedicated WS host)
        window.location.hostname === "metaverse.raashed.xyz"
        ? "wss://game.raashed.xyz/ws"
        : // K8s production (same-origin WS via ingress)
          window.location.hostname === "k8s-metaverse.raashed.xyz"
          ? "wss://k8s-metaverse.raashed.xyz/ws"
          : // fallback (safe default)
            `wss://${window.location.host}/ws`
    : `ws://localhost:${WS_PORT}/ws`;

// CORS allowed origins
export const CORS_ORIGINS = [
  "http://localhost:3001",
  "https://metaverse.raashed.xyz",
  "https://game.raashed.xyz",
  "https://raashed.xyz",
];

// GitHub OAuth URLs
export const GITHUB_OAUTH_URL = "https://github.com/login/oauth/authorize";
export const GITHUB_TOKEN_URL = "https://github.com/login/oauth/access_token";
export const GITHUB_USER_URL = "https://api.github.com/user";
export const GITHUB_EMAILS_URL = "https://api.github.com/user/emails";

import { join, dirname } from "path";
import { fileURLToPath } from "url";

// Get the directory of this file
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from the config package root
const envPath = join(__dirname, "..", ".env");

// Use Bun to load the .env file
const envFile = Bun.file(envPath);
const envExists = await envFile.exists();

if (envExists) {
  const envContent = await envFile.text();

  // Parse and set environment variables
  for (const line of envContent.split("\n")) {
    const trimmedLine = line.trim();

    // Skip empty lines and comments
    if (!trimmedLine || trimmedLine.startsWith("#")) continue;

    const equalIndex = trimmedLine.indexOf("=");
    if (equalIndex === -1) continue;

    const key = trimmedLine.slice(0, equalIndex).trim();
    let value = trimmedLine.slice(equalIndex + 1).trim();

    // Remove surrounding quotes if present
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Only set if not already defined (allows runtime override)
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

// Export typed environment variables
function getEnvVar(key: string, required: boolean = true): string {
  const value = process.env[key];
  if (required && !value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value || "";
}

// Database
export const DATABASE_URL = getEnvVar("DATABASE_URL");

// Auth
export const JWT_SECRET = getEnvVar("JWT_SECRET");

// GitHub OAuth
export const GITHUB_CLIENT_ID = getEnvVar("CLIENT_ID_GITHUB");
export const GITHUB_CLIENT_SECRET = getEnvVar("CLIENT_SECRET_GITHUB");

// Resend (Email)
export const RESEND_API_KEY = getEnvVar("RESEND_API_KEY");

// Server
import { BACKEND_PORT as DEFAULT_BACKEND_PORT } from "./constants.js";
export const BACKEND_PORT =
  getEnvVar("BACKEND_PORT", false) || String(DEFAULT_BACKEND_PORT);

// Export all env vars as a single object for convenience
export const env = {
  DATABASE_URL,
  JWT_SECRET,
  GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET,
  BACKEND_PORT,
  RESEND_API_KEY,
} as const;

import type { NextConfig } from "next";
import * as dotenv from "dotenv";
import * as path from "path";

// Load .env from the shared config package
dotenv.config({
  path: path.resolve(__dirname, "../../packages/config/.env"),
});

const nextConfig: NextConfig = {
  // Expose env vars from the shared config package
  env: {
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    CLIENT_ID_GITHUB: process.env.CLIENT_ID_GITHUB,
    CLIENT_SECRET_GITHUB: process.env.CLIENT_SECRET_GITHUB,
    NEXT_PUBLIC_GITHUB_CLIENT_ID: process.env.CLIENT_ID_GITHUB,
  },
};

export default nextConfig;

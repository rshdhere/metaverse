import js from "@eslint/js";
import { globalIgnores } from "eslint/config";
import eslintConfigPrettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";
import pluginReactHooks from "eslint-plugin-react-hooks";
import pluginReact from "eslint-plugin-react";
import globals from "globals";
import pluginNext from "@next/eslint-plugin-next";
import baseConfig from "./base.js";

/**
 * ESLint configuration for Next.js applications.
 *
 * Applies ONLY to Next.js apps (apps/**),
 * not the workspace root or non-Next packages.
 *
 * @type {import("eslint").Linter.Config[]}
 */
export default [
  // Base shared rules
  ...baseConfig,

  // Global ignores (important!)
  globalIgnores([
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    "**/dist/**",
    "**/node_modules/**",
    "next-env.d.ts",
  ]),

  // Apply Next + React rules ONLY to apps
  {
    files: ["apps/**/*.{js,jsx,ts,tsx}"],

    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
      },
    },

    plugins: {
      react: pluginReact,
      "react-hooks": pluginReactHooks,
      "@next/next": pluginNext,
    },

    rules: {
      // Base + TS
      ...js.configs.recommended.rules,
      ...tseslint.configs.recommended.rules,

      // React
      ...pluginReact.configs.flat.recommended.rules,

      // React Hooks
      ...pluginReactHooks.configs.recommended.rules,

      // Next.js
      ...pluginNext.configs.recommended.rules,
      ...pluginNext.configs["core-web-vitals"].rules,

      // JSX transform
      "react/react-in-jsx-scope": "off",

      // Pages Directory
      "@next/next/no-html-link-for-pages": "off",
    },

    settings: {
      react: {
        version: "detect",
      },
    },
  },

  // Prettier LAST
  eslintConfigPrettier,
];

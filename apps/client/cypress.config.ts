import { defineConfig } from "cypress";

const baseUrl = process.env.CYPRESS_BASE_URL ?? "http://localhost:3001";

export default defineConfig({
  e2e: {
    baseUrl,
    specPattern: "cypress/e2e/**/*.cy.{ts,tsx}",
    supportFile: "cypress/support/e2e.ts",
    viewportWidth: 1280,
    viewportHeight: 720,
    video: false,
    screenshotOnRunFailure: true,
    defaultCommandTimeout: 10000,
    requestTimeout: 10000,
    responseTimeout: 10000,
    setupNodeEvents(_on, _config) {
      // implement node event listeners here
    },
  },
});

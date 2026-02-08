/// <reference types="cypress" />

// ***********************************************
// Custom commands and type augmentations for Cypress
// ***********************************************

declare global {
  namespace Cypress {
    interface Chainable {
      /**
       * Clear auth state (localStorage token/session) to simulate logged-out user.
       */
      clearAuth(): Chainable<void>;
    }
  }
}

Cypress.Commands.add("clearAuth", () => {
  cy.window().then((win) => {
    win.localStorage.removeItem("token");
    win.localStorage.removeItem("authToken");
    win.localStorage.removeItem("username");
    win.sessionStorage.clear();
  });
});

export {};

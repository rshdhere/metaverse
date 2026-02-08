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
    win.localStorage.removeItem("avatarName");
    win.sessionStorage.clear();
    win.document.cookie =
      "authToken=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  });
});

export {};

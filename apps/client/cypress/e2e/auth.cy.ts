describe("Auth pages", () => {
  beforeEach(() => {
    cy.clearAuth();
  });

  describe("Login page", () => {
    beforeEach(() => {
      cy.visit("/login");
    });

    it("displays login form and heading", () => {
      cy.contains("h1", "Welcome back").should("be.visible");
      cy.contains("Enter your credentials to continue").should("be.visible");
    });

    it("has email and password inputs", () => {
      cy.get("input#email")
        .should("be.visible")
        .and("have.attr", "type", "email");
      cy.get("input#password").should("be.visible");
    });

    it("has Continue with GitHub button", () => {
      cy.contains("button", "Continue with GitHub").should("be.visible");
    });

    it("has link to sign up", () => {
      cy.contains("a", "Sign up")
        .should("be.visible")
        .and("have.attr", "href", "/signup");
    });

    it("shows validation when submitting empty form", () => {
      cy.contains("button", "Log in").click();
      cy.get("input#email").then(($el) => {
        expect(($el[0] as HTMLInputElement).validity.valueMissing).to.be.true;
      });
    });
  });

  describe("Signup page", () => {
    beforeEach(() => {
      cy.visit("/signup");
    });

    it("has link back to login", () => {
      cy.contains("a", "Log in")
        .should("be.visible")
        .and("have.attr", "href", "/login");
    });
  });
});

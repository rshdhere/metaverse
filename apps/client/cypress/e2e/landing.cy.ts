describe("Landing page", () => {
  beforeEach(() => {
    cy.clearAuth();
    cy.visit("/");
  });

  it("displays the main heading and tagline", () => {
    cy.contains("h1", "Your workspace, reimagined").should("be.visible");
    cy.contains("metaverse").should("be.visible");
    cy.contains(
      "A virtual office for modern remote teams to collaborate",
    ).should("be.visible");
  });

  it("shows Log in and Get Started when not logged in", () => {
    cy.contains("a", "Log in")
      .should("be.visible")
      .and("have.attr", "href", "/login");
    cy.contains("a", "Get Started")
      .should("be.visible")
      .and("have.attr", "href", "/signup");
  });

  it("navigates to login when clicking Log in", () => {
    cy.contains("a", "Log in").click();
    cy.url().should("include", "/login");
    cy.contains("Welcome back").should("be.visible");
  });

  it("navigates to signup when clicking Get Started", () => {
    cy.contains("a", "Get Started").click();
    cy.url().should("include", "/signup");
  });
});

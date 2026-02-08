describe("Navigation", () => {
  beforeEach(() => {
    cy.clearAuth();
  });

  it("landing page loads at /", () => {
    cy.visit("/");
    cy.url().should("match", /\/?$/);
    cy.contains("Your workspace, reimagined").should("be.visible");
  });

  it("can navigate from landing to login and back via browser", () => {
    cy.visit("/");
    cy.contains("a", "Log in").click();
    cy.url().should("include", "/login");
    cy.go("back");
    cy.url().should("not.include", "/login");
    cy.contains("Your workspace, reimagined").should("be.visible");
  });

  it("can navigate from login to signup", () => {
    cy.visit("/login");
    cy.contains("a", "Sign up").click();
    cy.url().should("include", "/signup");
  });

  it("space list page is reachable", () => {
    cy.visit("/space");
    cy.url().should("include", "/space");
  });

  it("arena page is reachable", () => {
    cy.visit("/arena");
    cy.url().should("include", "/arena");
  });
});

/**
 * E2E: When two avatars come closer to each other they should be able to listen to each other.
 * We simulate one peer entering/leaving audio proximity and assert the client's listening state.
 * Arena only renders the game when authenticated, so we set auth before visiting.
 */
describe("Proximity audio (avatars can listen when close)", () => {
  beforeEach(() => {
    cy.clearAuth();
  });

  function getNetworkFromGame(win: Window): {
    simulateProximityUpdate: (p: {
      type: "enter" | "leave";
      media: "audio" | "video";
      peerId: string;
    }) => Promise<void>;
  } | null {
    const game = (
      win as unknown as {
        game?: { scene?: { keys?: Record<string, { network?: unknown }> } };
      }
    ).game;
    const preloader = game?.scene?.keys?.preloader;
    const network = preloader?.network as
      | { simulateProximityUpdate: (p: unknown) => Promise<void> }
      | undefined;
    return network ?? null;
  }

  function waitForNetworkAndSimulate(
    win: Window,
    actions: Array<{
      type: "enter" | "leave";
      media: "audio" | "video";
      peerId: string;
    }>,
    timeoutMs = 30000,
  ): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve, reject) => {
      const check = async () => {
        const network = getNetworkFromGame(win);
        if (network) {
          for (const a of actions) {
            await network.simulateProximityUpdate(a);
          }
          resolve();
          return;
        }
        if (Date.now() > deadline) {
          reject(new Error("Timeout waiting for game network"));
          return;
        }
        setTimeout(check, 300);
      };
      check();
    });
  }

  const arenaAuth = {
    onBeforeLoad: (win: Window) => {
      win.localStorage.setItem("authToken", "e2e-proximity-test-token");
      win.localStorage.setItem("username", "e2e-user");
      win.localStorage.setItem("avatarName", "harry");
    },
  };

  /** Retrying assertion so CI has time for the app to update the count. */
  function expectAudioProximityCount(expected: number) {
    cy.window().should((win) =>
      expect(
        (win as unknown as { __audioProximityCount?: number })
          .__audioProximityCount,
      ).to.equal(expected),
    );
  }

  it("when another avatar enters proximity, client can listen (audio proximity count increases)", () => {
    cy.visit("/arena", arenaAuth);
    cy.window().then((win) =>
      waitForNetworkAndSimulate(win, [
        { type: "enter", media: "audio", peerId: "peer-1" },
      ]),
    );
    expectAudioProximityCount(1);
  });

  it("when the other avatar leaves proximity, client stops listening (count goes to 0)", () => {
    cy.visit("/arena", arenaAuth);
    cy.window().then((win) =>
      waitForNetworkAndSimulate(win, [
        { type: "enter", media: "audio", peerId: "peer-1" },
        { type: "leave", media: "audio", peerId: "peer-1" },
      ]),
    );
    expectAudioProximityCount(0);
  });

  it(
    "when two peers are in proximity, client can listen to both (count is 2)",
    { defaultCommandTimeout: 35000 },
    () => {
      cy.visit("/arena", arenaAuth);
      cy.window().then((win) =>
        waitForNetworkAndSimulate(win, [
          { type: "enter", media: "audio", peerId: "peer-1" },
          { type: "enter", media: "audio", peerId: "peer-2" },
        ]),
      );
      // Give CI time for both handleProximityUpdate calls to run and sync (no audio device in CI)
      cy.wait(500, { log: false });
      expectAudioProximityCount(2);
    },
  );
});

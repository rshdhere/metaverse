"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useAppState } from "../../src/providers/AppStateProvider";
import { getStoredCredentials } from "../../src/utils/auth";

const PhaserGameWrapper = dynamic(
  () => import("../../src/components/PhaserGameWrapper"),
  { ssr: false },
);
const MobileVirtualJoystick = dynamic(
  () => import("../../src/components/MobileVirtualJoystick"),
  { ssr: false },
);
const ComputerDialog = dynamic(
  () => import("../../src/components/ComputerDialog"),
  { ssr: false },
);

export default function ArenaPage() {
  const router = useRouter();
  const {
    token,
    username,
    avatarName,
    loggedIn,
    computerDialogOpen,
    setToken,
    setUsername,
    setAvatarName,
    setLoggedIn,
  } = useAppState();
  const [gameInitialized, setGameInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [selectedAvatar, setSelectedAvatar] = useState("adam");
  const [showNameInput, setShowNameInput] = useState(true);

  const availableAvatars = [
    { id: "adam", name: "Adam", image: "/assets/character/adam.png" },
    { id: "ash", name: "Ash", image: "/assets/character/ash.png" },
    { id: "lucy", name: "Lucy", image: "/assets/character/lucy.png" },
    { id: "nancy", name: "Nancy", image: "/assets/character/nancy.png" },
  ];

  // Check authentication and redirect if not logged in
  useEffect(() => {
    if (!token && !loggedIn) {
      const credentials = getStoredCredentials();
      if (credentials) {
        setToken(credentials.token);
        setUsername(credentials.username);
        setAvatarName(credentials.avatarName);
        // Pre-fill display name and avatar if available
        if (credentials.username && !credentials.username.includes("@")) {
          setDisplayName(credentials.username);
          setShowNameInput(false);
        }
        if (credentials.avatarName) {
          setSelectedAvatar(credentials.avatarName);
        }
      } else {
        router.push("/login");
      }
    }
  }, [token, loggedIn, router, setToken, setUsername, setAvatarName]);

  // Join the space and launch the office game when we have auth AND displayName
  useEffect(() => {
    if (
      (token || loggedIn) &&
      !gameInitialized &&
      !showNameInput &&
      displayName
    ) {
      let active = true;

      // Wait for Phaser Bootstrap scene to be ready
      const interval = setInterval(() => {
        type SceneBootstrap = {
          launchGame?: () => boolean;
          isReady?: () => boolean;
          setPendingAvatarName?: (name: string) => void;
          network?: {
            setMyAvatarName?: (name: string) => void;
            applyAuth?: (token: string, username?: string) => void;
            joinOrCreatePublic?: () => Promise<void>;
          };
        };
        type WindowGame = { scene?: { keys?: Record<string, SceneBootstrap> } };
        const game = (window as unknown as { game?: WindowGame }).game;
        const bootstrap = game?.scene?.keys?.bootstrap;

        // Check if bootstrap is ready (assets loaded) and network is available
        if (
          bootstrap &&
          bootstrap.network &&
          typeof bootstrap.isReady === "function" &&
          bootstrap.isReady()
        ) {
          clearInterval(interval);

          // Join space and launch game in sequence
          (async () => {
            try {
              if (!bootstrap.network) {
                console.error("Bootstrap network not available");
                setError(
                  "Failed to connect to game server. Network unavailable.",
                );
                return;
              }

              // Set the avatar name
              const finalAvatar = avatarName || "adam";
              if (bootstrap.setPendingAvatarName) {
                bootstrap.setPendingAvatarName(finalAvatar);
              }

              // Apply auth to the shared Phaser network instance
              if (token && displayName) {
                bootstrap.network.applyAuth?.(token, displayName);
                bootstrap.network.setMyAvatarName?.(finalAvatar);
              }

              // Join the public lobby via WebSocket
              await bootstrap.network.joinOrCreatePublic?.();

              // Launch the office game scene
              if (active && typeof bootstrap.launchGame === "function") {
                const launched = bootstrap.launchGame();
                if (launched) {
                  setLoggedIn(true);
                  setGameInitialized(true);
                }
              }
            } catch (error) {
              console.error("Failed to join and launch game:", error);
              setError(
                "Failed to join the arena. Please check your connection and try again.",
              );
            }
          })();
        }
      }, 100);

      // Cleanup timeout - reduced to 8 seconds for faster feedback
      const timeout = setTimeout(() => {
        clearInterval(interval);
        if (active && !gameInitialized) {
          console.error("Timed out waiting for Phaser");
          setError(
            "Game initialization timed out. Please try again or check your connection.",
          );
        }
      }, 8000);

      return () => {
        active = false;
        clearInterval(interval);
        clearTimeout(timeout);
      };
    }
  }, [
    token,
    loggedIn,
    avatarName,
    gameInitialized,
    setLoggedIn,
    router,
    showNameInput,
    displayName,
  ]);

  const handleNameSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (displayName.trim()) {
      // Store the display name and avatar
      if (typeof window !== "undefined") {
        localStorage.setItem("username", displayName.trim());
        localStorage.setItem("avatarName", selectedAvatar);
      }
      setUsername(displayName.trim());
      setAvatarName(selectedAvatar);
      setShowNameInput(false);
    }
  };

  // Don't render game until authenticated
  if (!token && !loggedIn) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-[#1a1d2e] to-[#2d3250]">
        <div className="text-[#eee] text-xl">Loading...</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0">
      {/* Phaser canvas container */}
      <div id="phaser-container" style={{ position: "fixed", inset: 0 }} />
      <PhaserGameWrapper />

      {/* UI overlay - only show when game is initialized */}
      {gameInitialized && (
        <div className="absolute top-0 left-0 h-full w-full z-0 pointer-events-none">
          {computerDialogOpen ? <ComputerDialog /> : <MobileVirtualJoystick />}
        </div>
      )}

      {/* Loading/Error indicator while game initializes */}
      {!gameInitialized && !showNameInput && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
          <div className="bg-[#222639] rounded-2xl px-8 py-6 shadow-lg max-w-md">
            {error ? (
              <>
                <div className="text-[#ff6b6b] text-xl mb-4">Error</div>
                <div className="text-[#eee] mb-6">{error}</div>
                <div className="flex gap-4 justify-center">
                  <button
                    onClick={() => router.push("/space")}
                    className="px-6 py-2 bg-[#33ac96] hover:bg-[#2a9980] text-white rounded-lg transition-colors"
                  >
                    Back to Spaces
                  </button>
                  <button
                    onClick={() => window.location.reload()}
                    className="px-6 py-2 bg-[#4a5568] hover:bg-[#3a4558] text-white rounded-lg transition-colors"
                  >
                    Retry
                  </button>
                </div>
              </>
            ) : (
              <div className="text-[#eee] text-xl">Loading game...</div>
            )}
          </div>
        </div>
      )}

      {/* Username and Character input screen */}
      {showNameInput && (
        <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-70 z-50">
          <div className="bg-[#222639] rounded-2xl px-10 py-8 shadow-2xl max-w-2xl w-full mx-4">
            <h2 className="text-[#33ac96] text-2xl font-bold mb-2 text-center">
              Choose Your Character
            </h2>
            <p className="text-[#aaa] text-sm mb-6 text-center">
              Pick your avatar and enter your name
            </p>

            {/* Character Selection */}
            <div className="grid grid-cols-4 gap-4 mb-6">
              {availableAvatars.map((avatar) => (
                <button
                  key={avatar.id}
                  type="button"
                  onClick={() => setSelectedAvatar(avatar.id)}
                  className={`relative p-4 rounded-lg border-2 transition-all ${
                    selectedAvatar === avatar.id
                      ? "border-[#33ac96] bg-[#33ac96]/10"
                      : "border-[#33ac96]/30 hover:border-[#33ac96]/60"
                  }`}
                >
                  <div className="aspect-square relative mb-2">
                    <img
                      src={avatar.image}
                      alt={avatar.name}
                      className="w-full h-full object-contain"
                    />
                  </div>
                  <p className="text-[#eee] text-sm font-medium text-center">
                    {avatar.name}
                  </p>
                  {selectedAvatar === avatar.id && (
                    <div className="absolute top-2 right-2 w-5 h-5 bg-[#33ac96] rounded-full flex items-center justify-center">
                      <svg
                        className="w-3 h-3 text-white"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Name Input */}
            <form onSubmit={handleNameSubmit}>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Enter your display name"
                className="w-full px-4 py-3 bg-[#1a1d2e] text-[#eee] rounded-lg border border-[#33ac96]/30 focus:border-[#33ac96] focus:outline-none mb-4"
                maxLength={20}
                autoFocus
              />
              <button
                type="submit"
                disabled={!displayName.trim()}
                className="w-full px-6 py-3 bg-[#33ac96] hover:bg-[#2a9980] disabled:bg-[#2a4a40] disabled:cursor-not-allowed text-white rounded-lg transition-colors font-medium"
              >
                Join Arena
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

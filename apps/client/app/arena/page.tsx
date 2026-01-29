"use client";
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { useAppState } from "../../src/providers/AppStateProvider";
import { getStoredCredentials } from "../../src/utils/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

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

      // Wait for Phaser Preloader scene to be ready
      const interval = setInterval(() => {
        type ScenePreloader = {
          launchGame?: () => boolean;
          isReady?: () => boolean;
          setPendingAvatarName?: (name: string) => void;
          network?: {
            setMyAvatarName?: (name: string) => void;
            applyAuth?: (token: string, username?: string) => void;
            joinOrCreatePublic?: () => Promise<void>;
            resetForRejoin?: () => void;
          };
        };
        type WindowGame = { scene?: { keys?: Record<string, ScenePreloader> } };
        const game = (window as unknown as { game?: WindowGame }).game;
        const preloader = game?.scene?.keys?.preloader;

        // Check if preloader is ready (assets loaded) and network is available
        if (
          preloader &&
          preloader.network &&
          typeof preloader.isReady === "function" &&
          preloader.isReady()
        ) {
          clearInterval(interval);

          // Join space and launch game in sequence
          (async () => {
            try {
              if (!preloader.network) {
                console.error("Preloader network not available");
                setError(
                  "Failed to connect to game server. Network unavailable.",
                );
                return;
              }

              // Set the avatar name
              const finalAvatar = avatarName || "adam";
              if (preloader.setPendingAvatarName) {
                preloader.setPendingAvatarName(finalAvatar);
              }

              // Reset network state for fresh join
              preloader.network.resetForRejoin?.();

              // Apply auth to the shared Phaser network instance
              if (token && displayName) {
                preloader.network.applyAuth?.(token, displayName);
                preloader.network.setMyAvatarName?.(finalAvatar);
              }

              // Launch the office game scene FIRST (so event listeners are registered)
              if (active && typeof preloader.launchGame === "function") {
                const launched = await preloader.launchGame();
                if (launched) {
                  setLoggedIn(true);
                  setGameInitialized(true);

                  // Now join the public lobby via WebSocket AFTER scene is ready
                  await preloader.network.joinOrCreatePublic?.();
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
    <div className="fixed inset-0" style={{ backgroundColor: "#2d3250" }}>
      {/* Phaser canvas container */}
      <div
        id="phaser-container"
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "#2d3250",
          zIndex: 0,
        }}
      />
      <PhaserGameWrapper />

      {/* UI overlay - only show when game is initialized */}
      {gameInitialized && (
        <div
          className="absolute top-0 left-0 h-full w-full pointer-events-none"
          style={{ zIndex: 10 }}
        >
          {computerDialogOpen ? <ComputerDialog /> : <MobileVirtualJoystick />}
        </div>
      )}

      {/* Loading/Error indicator while game initializes */}
      {!gameInitialized && !showNameInput && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50 z-50">
          <Card className="w-full max-w-md bg-[#222639] border-none text-[#eee]">
            <CardHeader>
              <CardTitle className={error ? "text-destructive" : ""}>
                {error ? "Error" : "Loading game..."}
              </CardTitle>
            </CardHeader>
            <CardContent>{error && <p>{error}</p>}</CardContent>
            {error && (
              <CardFooter className="flex justify-center gap-4">
                <Button
                  variant="secondary"
                  onClick={() => router.push("/space")}
                >
                  Back to Spaces
                </Button>
                <Button
                  variant="outline"
                  className="border-gray-600 text-gray-200 hover:bg-gray-700 hover:text-white"
                  onClick={() => window.location.reload()}
                >
                  Retry
                </Button>
              </CardFooter>
            )}
          </Card>
        </div>
      )}

      {/* Username and Character input screen */}
      {showNameInput && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/70 z-50 p-4">
          <Card className="w-full max-w-2xl bg-[#1a1d2e] border-none shadow-2xl">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-bold text-[#33ac96]">
                Choose Your Character
              </CardTitle>
              <CardDescription className="text-gray-400">
                Pick your avatar and enter your name
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
                {availableAvatars.map((avatar) => (
                  <button
                    key={avatar.id}
                    type="button"
                    onClick={() => setSelectedAvatar(avatar.id)}
                    className={cn(
                      "relative p-4 rounded-xl border-2 transition-all duration-200 group hover:-translate-y-1 bg-[#222639]",
                      selectedAvatar === avatar.id
                        ? "border-[#33ac96] shadow-[0_0_20px_rgba(51,172,150,0.3)]"
                        : "border-transparent hover:border-[#33ac96]/50",
                    )}
                  >
                    <div className="aspect-square relative mb-3">
                      <img
                        src={avatar.image}
                        alt={avatar.name}
                        className="w-full h-full object-contain drop-shadow-lg"
                      />
                    </div>
                    <p
                      className={cn(
                        "text-sm font-medium text-center transition-colors",
                        selectedAvatar === avatar.id
                          ? "text-[#33ac96]"
                          : "text-gray-400 group-hover:text-gray-200",
                      )}
                    >
                      {avatar.name}
                    </p>
                    {selectedAvatar === avatar.id && (
                      <div className="absolute top-3 right-3 w-6 h-6 bg-[#33ac96] rounded-full flex items-center justify-center shadow-sm">
                        <Check className="w-3.5 h-3.5 text-[#1a1d2e] stroke-[3]" />
                      </div>
                    )}
                  </button>
                ))}
              </div>

              <form onSubmit={handleNameSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="displayName" className="sr-only">
                    Display Name
                  </Label>
                  <Input
                    id="displayName"
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Enter your display name"
                    className="h-12 bg-[#222639] border-[#33ac96]/20 focus-visible:ring-[#33ac96] text-lg text-white placeholder:text-gray-500"
                    maxLength={20}
                    autoFocus
                  />
                </div>
                <Button
                  type="submit"
                  disabled={!displayName.trim()}
                  className="w-full h-12 text-lg font-medium bg-[#33ac96] hover:bg-[#2a9980] text-[#1a1d2e] disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                  Join Arena
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

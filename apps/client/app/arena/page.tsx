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
    {
      id: "adam",
      name: "Ron",
      image: "/assets/character/single/Adam_idle_anim_1.png",
    },
    {
      id: "ash",
      name: "Harry",
      image: "/assets/character/single/Ash_idle_anim_1.png",
    },
    {
      id: "lucy",
      name: "Ginny",
      image: "/assets/character/single/Lucy_idle_anim_1.png",
    },
    {
      id: "nancy",
      name: "Hermoine",
      image: "/assets/character/single/Nancy_idle_anim_1.png",
    },
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
      <div className="fixed inset-0 flex items-center justify-center bg-black">
        <div className="text-white text-xl">Loading...</div>
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
        <div className="fixed inset-0 flex items-center justify-center bg-black z-50">
          <Card className="w-full max-w-md bg-black border border-white/20 text-white">
            <CardHeader className="text-center">
              <CardTitle className={error ? "text-red-500" : "text-white"}>
                {error ? "Error" : "Loading game..."}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {error && <p className="text-gray-400">{error}</p>}
            </CardContent>
            {error && (
              <CardFooter className="flex justify-center gap-4">
                <Button
                  className="bg-white text-black hover:bg-gray-200 cursor-pointer"
                  onClick={() => router.push("/space")}
                >
                  Back to Spaces
                </Button>
                <Button
                  variant="outline"
                  className="border-zinc-700 text-white hover:bg-zinc-700 hover:text-white cursor-pointer"
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
        <div className="fixed inset-0 flex items-center justify-center bg-black z-50 p-4">
          <Card className="w-full max-w-2xl bg-black border border-white/20 shadow-2xl">
            <CardHeader className="text-center">
              <CardTitle className="text-2xl font-bold text-white">
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
                      "relative p-4 rounded-xl border-2 transition-all duration-200 group hover:-translate-y-1 bg-zinc-900 cursor-pointer",
                      selectedAvatar === avatar.id
                        ? "border-white shadow-[0_0_20px_rgba(255,255,255,0.2)]"
                        : "border-zinc-700 hover:border-white/50",
                    )}
                  >
                    <div className="aspect-square relative mb-3 flex items-center justify-center">
                      <img
                        src={avatar.image}
                        alt={avatar.name}
                        className="w-16 h-24 object-contain drop-shadow-lg [image-rendering:pixelated]"
                      />
                    </div>
                    <p
                      className={cn(
                        "text-sm font-medium text-center transition-colors",
                        selectedAvatar === avatar.id
                          ? "text-white"
                          : "text-gray-400 group-hover:text-gray-200",
                      )}
                    >
                      {avatar.name}
                    </p>
                    {selectedAvatar === avatar.id && (
                      <div className="absolute top-3 right-3 w-6 h-6 bg-white rounded-full flex items-center justify-center shadow-sm">
                        <Check className="w-3.5 h-3.5 text-black stroke-[3]" />
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
                    className="h-12 bg-zinc-900 border-zinc-700 focus-visible:ring-white focus-visible:border-white text-lg text-white placeholder:text-gray-500"
                    maxLength={20}
                    autoFocus
                  />
                </div>
                <Button
                  type="submit"
                  disabled={!displayName.trim()}
                  className="w-full h-12 text-lg font-medium bg-white hover:bg-gray-200 text-black disabled:opacity-50 disabled:cursor-not-allowed transition-all cursor-pointer"
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

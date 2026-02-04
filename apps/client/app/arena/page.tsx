"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
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
import { toast } from "sonner";

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

const StableVideoMount = React.memo(
  React.forwardRef<HTMLDivElement>((_props, ref) => (
    <div
      ref={ref}
      className="grid grid-cols-2 gap-3 w-md"
      style={{ minHeight: "150px" }}
    />
  )),
  () => true,
);
StableVideoMount.displayName = "StableVideoMount";

const StableLocalVideoMount = React.memo(
  React.forwardRef<HTMLDivElement>((_props, ref) => (
    <div
      ref={ref}
      className="h-32 w-56 overflow-hidden rounded-xl bg-zinc-900/50 shadow-inner"
    />
  )),
  () => true,
);
StableLocalVideoMount.displayName = "StableLocalVideoMount";

export default function ArenaPage() {
  const router = useRouter();
  const {
    token,
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
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [activeMeetingPeers, setActiveMeetingPeers] = useState<string[]>([]);
  const [hasRemoteVideo, setHasRemoteVideo] = useState(false);
  const remoteVideoRef = useRef<HTMLDivElement | null>(null);
  const localVideoRef = useRef<HTMLDivElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const getNetwork = useCallback(() => {
    type ScenePreloader = {
      network?: {
        setVideoContainers?: (
          remote: HTMLElement | null,
          local: HTMLElement | null,
        ) => void;
        isCameraEnabled?: () => boolean;
        setMeetingToastEnabled?: (enabled: boolean) => void;
        getActiveMeetingPeers?: () => string[];
        getRemoteVideoCount?: () => number;
      };
    };
    type WindowGame = { scene?: { keys?: Record<string, ScenePreloader> } };
    const game = (window as unknown as { game?: WindowGame }).game;
    const preloader = game?.scene?.keys?.preloader;
    return preloader?.network;
  }, []);

  const syncVideoContainers = useCallback(() => {
    if (!gameInitialized) return false;
    const network = getNetwork();
    const localContainer = localVideoRef.current;
    const remoteContainer = remoteVideoRef.current;
    if (network?.setVideoContainers && localContainer && remoteContainer) {
      network.setVideoContainers(remoteContainer, localContainer);
      return true;
    }
    return false;
  }, [gameInitialized, getNetwork]);

  const setRemoteVideoMount = useCallback(
    (node: HTMLDivElement | null) => {
      remoteVideoRef.current = node;
      syncVideoContainers();
    },
    [syncVideoContainers],
  );

  const setLocalVideoMount = useCallback(
    (node: HTMLDivElement | null) => {
      localVideoRef.current = node;
      syncVideoContainers();
    },
    [syncVideoContainers],
  );

  // Background Music Logic
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    // Set initial low volume
    audio.volume = 0.05;

    // Try to play on user interaction/load
    const playAudio = () => {
      audio.play().catch((e) => {});
    };

    // Audio is now triggered in handleNameSubmit to satisfy browser autoplay policies
    // if (gameInitialized && !showNameInput) {
    //   playAudio();
    // }

    // Global interaction fallback for auto-join users
    const handleGlobalClick = () => {
      const audio = audioRef.current;
      if (audio && audio.paused) {
        audio.play().catch((e) => {});
      }
      // Remove listener after first interaction attempt
      window.removeEventListener("click", handleGlobalClick);
    };

    if (gameInitialized && !showNameInput) {
      window.addEventListener("click", handleGlobalClick);

      // Try autoplay one more time just in case browser allows it (e.g. reload)
      playAudio();
    }

    // Pause/Resume based on meeting status
    if (activeMeetingPeers.length > 0) {
      // Fade out
      const fadeOut = setInterval(() => {
        if (audio.volume > 0.01) {
          audio.volume -= 0.005;
        } else {
          audio.pause();
          clearInterval(fadeOut);
        }
      }, 50);
      return () => {
        clearInterval(fadeOut);
        window.removeEventListener("click", handleGlobalClick);
      };
    } else {
      // Fade in (if previously playing or just starting)
      if (gameInitialized && !showNameInput) {
        audio.play().catch(() => {});
        const fadeIn = setInterval(() => {
          if (audio.volume < 0.05) {
            audio.volume += 0.005;
          } else {
            clearInterval(fadeIn);
          }
        }, 50);
        return () => {
          clearInterval(fadeIn);
          window.removeEventListener("click", handleGlobalClick);
        };
      }
    }
  }, [activeMeetingPeers.length, gameInitialized, showNameInput]);

  // Volume Control (0/1)
  useEffect(() => {
    const handleVolumeControl = (e: KeyboardEvent) => {
      const audio = audioRef.current;
      if (!audio) return;

      if (e.key === "0") {
        audio.volume = Math.max(0, audio.volume - 0.05);
        toast(`Volume: ${Math.round(audio.volume * 100)}%`);
      } else if (e.key === "1") {
        audio.volume = Math.min(1, audio.volume + 0.05);
        toast(`Volume: ${Math.round(audio.volume * 100)}%`);
      }
    };

    window.addEventListener("keydown", handleVolumeControl);
    return () => window.removeEventListener("keydown", handleVolumeControl);
  }, []);

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
        queueMicrotask(() => {
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
        });
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

  useEffect(() => {
    if (!gameInitialized) return;

    let active = true;
    const interval = setInterval(() => {
      const network = getNetwork();
      if (!network) return;
      if (syncVideoContainers()) {
        if (network.setMeetingToastEnabled) {
          network.setMeetingToastEnabled(true);
        }
        if (active && network.isCameraEnabled) {
          setCameraEnabled(network.isCameraEnabled());
        }
        if (active && network.getActiveMeetingPeers) {
          const newPeers = network.getActiveMeetingPeers();
          setActiveMeetingPeers((prev) => {
            if (
              prev.length === newPeers.length &&
              prev.every((p, i) => p === newPeers[i])
            ) {
              return prev;
            }
            return newPeers;
          });
        }
        clearInterval(interval);
      }
    }, 250);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [gameInitialized, getNetwork, syncVideoContainers]);

  useEffect(() => {
    if (!gameInitialized) return;
    return () => {
      type ScenePreloader = {
        network?: {
          setMeetingToastEnabled?: (enabled: boolean) => void;
        };
      };
      type WindowGame = { scene?: { keys?: Record<string, ScenePreloader> } };
      const game = (window as unknown as { game?: WindowGame }).game;
      const preloader = game?.scene?.keys?.preloader;
      preloader?.network?.setMeetingToastEnabled?.(false);
    };
  }, [gameInitialized]);

  useEffect(() => {
    if (!gameInitialized) return;
    const interval = setInterval(() => {
      const network = getNetwork();
      if (network?.getActiveMeetingPeers) {
        const newPeers = network.getActiveMeetingPeers();
        setActiveMeetingPeers((prev) => {
          if (
            prev.length === newPeers.length &&
            prev.every((p, i) => p === newPeers[i])
          ) {
            return prev;
          }
          return newPeers;
        });
      }
      if (network?.getRemoteVideoCount) {
        const remoteCount = network.getRemoteVideoCount();
        setHasRemoteVideo(remoteCount > 0);
      }
    }, 500);

    return () => clearInterval(interval);
  }, [gameInitialized, getNetwork]);

  // Sync video containers when peers change (and checking if remote ref is ready)
  useEffect(() => {
    if (!gameInitialized) return;

    const interval = setInterval(() => {
      if (syncVideoContainers()) {
        clearInterval(interval);
      }
    }, 200);

    return () => clearInterval(interval);
  }, [activeMeetingPeers.length, gameInitialized, syncVideoContainers]);

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

      // Attempt to play audio immediately on user interaction
      const audio = audioRef.current;
      if (audio) {
        audio.volume = 0.05;
        audio.play().catch((e) => {});
      }
    }
  };

  const handleCameraToggle = async () => {
    type ScenePreloader = {
      network?: {
        enableCamera?: () => Promise<void>;
        disableCamera?: () => void;
        isCameraEnabled?: () => boolean;
      };
    };
    type WindowGame = { scene?: { keys?: Record<string, ScenePreloader> } };
    const game = (window as unknown as { game?: WindowGame }).game;
    const preloader = game?.scene?.keys?.preloader;
    const network = preloader?.network;
    if (!network) return;

    const enabled = network.isCameraEnabled?.() ?? false;
    if (enabled) {
      network.disableCamera?.();
      setCameraEnabled(false);
    } else {
      await network.enableCamera?.();
      setCameraEnabled(true);
    }
  };

  const handleLeaveMeeting = async () => {
    type ScenePreloader = {
      network?: {
        endMeetings?: () => Promise<void>;
      };
    };
    type WindowGame = { scene?: { keys?: Record<string, ScenePreloader> } };
    const game = (window as unknown as { game?: WindowGame }).game;
    const preloader = game?.scene?.keys?.preloader;
    const network = preloader?.network;
    if (!network?.endMeetings) return;
    await network.endMeetings();
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
      <audio
        ref={audioRef}
        src="/assets/audio/Metro Boomin - Am I Dreaming Instrumental (Official Audio) 4.mp3"
        loop
      />
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

      {gameInitialized && (
        <>
          {/* Local user video - top right */}
          <div className="absolute top-4 right-4 z-20 pointer-events-auto flex flex-col gap-3 items-end max-w-[50vw] max-h-[80vh] p-2">
            <div className="p-1 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 shadow-2xl overflow-hidden transition-all hover:bg-black/60">
              <div className="relative group">
                <StableLocalVideoMount ref={setLocalVideoMount} />
                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-[10px] font-medium text-white/80 bg-black/50 px-2 py-0.5 rounded-full">
                    You
                  </span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 rounded-full bg-white/10 hover:bg-white/20 text-white cursor-pointer"
                    onClick={handleCameraToggle}
                  >
                    {cameraEnabled ? (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M23 7l-7 5 7 5V7z" />
                        <rect
                          x="1"
                          y="5"
                          width="15"
                          height="14"
                          rx="2"
                          ry="2"
                        />
                      </svg>
                    ) : (
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M16 16v1a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2m5.66 0H14a2 2 0 0 1 2 2v3.34l1 1L23 7v10" />
                        <line x1="1" y1="1" x2="23" y2="23" />
                      </svg>
                    )}
                  </Button>
                </div>
              </div>
            </div>

            {(activeMeetingPeers.length > 0 || hasRemoteVideo) && (
              <Button
                size="sm"
                variant="destructive"
                className="w-full rounded-xl shadow-lg hover:bg-red-600/90 transition-all font-medium text-xs h-8 cursor-pointer text-white"
                onClick={handleLeaveMeeting}
              >
                Leave Meeting
              </Button>
            )}
          </div>

          {/* Remote user video - bottom left */}
          <div
            className={cn(
              "absolute bottom-4 left-4 z-20 flex flex-col gap-3 items-start max-w-[50vw] max-h-[80vh] p-2 transition-all duration-200",
              activeMeetingPeers.length > 0 || hasRemoteVideo
                ? "pointer-events-auto animate-slide-in-left opacity-100"
                : "pointer-events-none opacity-0 translate-y-4",
            )}
          >
            <div className="p-2 rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 shadow-2xl">
              <StableVideoMount ref={setRemoteVideoMount} />
            </div>
          </div>
        </>
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
                      <Image
                        src={avatar.image}
                        alt={avatar.name}
                        width={64}
                        height={96}
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
                        <Check className="w-3.5 h-3.5 text-black stroke-3" />
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

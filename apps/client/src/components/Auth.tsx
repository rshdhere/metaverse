"use client";
import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useAppState } from "../providers/AppStateProvider";
import Network from "../services/Network";

const subtitleClass = "m-0 text-sm text-[#c2c2c2] text-center";

const defaultAvatars = ["adam", "ash", "lucy", "nancy"];

export default function Auth() {
  const {
    setLoggedIn,
    setUsername: setUserCtx,
    setAvatarName: setAvatarCtx,
    setToken,
    avatarName,
  } = useAppState();
  const [network] = useState<Network>(() => new Network());
  const [username, setUser] = useState("");
  const [password, setPass] = useState("");
  const [error, setError] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [selectedAvatarIndex, setSelectedAvatarIndex] = useState(0);
  const [availableAvatars, setAvailableAvatars] = useState<
    { id: string; name: string; imageUrl: string }[]
  >([]);
  const [authSuccess, setAuthSuccess] = useState(false);
  const [pendingToken, setPendingToken] = useState("");

  useEffect(() => {
    async function fetchAvatars() {
      try {
        const base =
          process.env.NEXT_PUBLIC_API_URL ||
          `${window.location.protocol}//${window.location.hostname}:3000`;
        const res = await fetch(`${base}/api/v1/avatar`);
        if (res.ok) {
          const data = await res.json();
          setAvailableAvatars(data.avatars || []);
        }
      } catch {}
    }
    fetchAvatars();
  }, []);

  async function callApi(path: string, body: Record<string, unknown>) {
    const base =
      process.env.NEXT_PUBLIC_API_URL ||
      `${window.location.protocol}//${window.location.hostname}:3000`;
    const res = await fetch(`${base}/api/v1/${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return res;
  }

  async function handleSignUp() {
    setError("");
    try {
      const selected = availableAvatars[selectedAvatarIndex];
      const body = {
        username,
        password,
        role: "User",
        ...(selected && { avatarId: selected.id }),
      };
      const res = await callApi("sign-up", body);
      if (res.status === 201) {
        const data = await res.json();
        setToken(data.token);
        setUserCtx(username);
        if (selected?.name) {
          const chosen = String(selected.name).toLowerCase();
          setAvatarCtx(chosen);
          network.setMyAvatarName(chosen);
        }
        setPendingToken(data.token);
        network.applyAuth(data.token, username);
        setAuthSuccess(true);
      } else if (res.status === 409) {
        await handleSignIn();
      } else {
        const errorData = await res.json();
        setError(errorData.message || "Failed to sign up");
      }
    } catch {
      setError("Network error");
    }
  }

  async function handleSignIn() {
    setError("");
    try {
      const res = await callApi("sign-in", { username, password });
      if (res.ok) {
        const data = await res.json();
        setToken(data.token);
        setUserCtx(username);
        setPendingToken(data.token);
        network.applyAuth(data.token, username);
        setAuthSuccess(true);
      } else {
        setError("Invalid credentials");
      }
    } catch {
      setError("Network error");
    }
  }

  // After successful auth, automatically join public lobby and enter arena
  useEffect(() => {
    if (!authSuccess || !pendingToken) return;
    let active = true;
    (async () => {
      try {
        // Launch the Phaser game scene like @client/
        type ScenePreloader = {
          launchGame?: () => boolean;
          isReady?: () => boolean;
          setPendingAvatarName?: (name: string) => void;
          network?: {
            setMyAvatarName?: (name: string) => void;
            applyAuth?: (token: string, username?: string) => void;
            joinOrCreatePublic?: () => Promise<void>;
          };
        };
        type WindowGame = { scene?: { keys?: Record<string, ScenePreloader> } };
        const game = (window as unknown as { game?: WindowGame }).game;
        const preloader = game?.scene?.keys?.preloader;
        // Ensure the shared Phaser side receives the chosen avatar
        if (preloader && typeof preloader.setPendingAvatarName === "function") {
          preloader.setPendingAvatarName(avatarName || "adam");
        }
        // Launch game FIRST so event listeners are registered
        if (preloader && typeof preloader.launchGame === "function") {
          preloader.launchGame();
        }
        // Apply auth and join using the shared Phaser Network instance so movement sync works
        if (preloader?.network) {
          preloader.network.applyAuth?.(pendingToken, username);
          await preloader.network.joinOrCreatePublic?.();
        } else {
          await network.joinOrCreatePublic();
        }
        if (active) setLoggedIn(true);
      } catch {
        // ignore, user can retry
      }
    })();
    return () => {
      active = false;
    };
  }, [authSuccess, pendingToken, network, setLoggedIn, avatarName, username]);

  const displayAvatars =
    availableAvatars.length > 0
      ? availableAvatars.map((a) => ({
          ...a,
          name: (a.name || "").toLowerCase(),
        }))
      : defaultAvatars.map((name, index) => ({
          id: `default-${index}`,
          name,
          imageUrl: "",
        }));

  return (
    <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#222639] rounded-2xl px-6 py-6 md:px-[60px] md:py-[36px] shadow-[0_0_5px_#0000006f] flex flex-col gap-4 w-[90vw] max-w-[560px] max-h-[80vh] overflow-y-auto">
      {!authSuccess ? (
        <>
          <h2 className="text-[#eee] m-0">
            {isSignUp ? "Create Account" : "Sign in to continue"}
          </h2>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid w-full items-center gap-1.5">
            <Label htmlFor="username" className="text-white">
              Username
            </Label>
            <Input
              id="username"
              autoFocus
              className="bg-secondary text-secondary-foreground"
              onInput={(e) => setUser((e.target as HTMLInputElement).value)}
            />
          </div>

          <div className="grid w-full items-center gap-1.5">
            <Label htmlFor="password" className="text-white">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              className="bg-secondary text-secondary-foreground"
              onInput={(e) => setPass((e.target as HTMLInputElement).value)}
            />
          </div>

          {isSignUp && !authSuccess && (
            <div className="flex flex-col gap-4 items-center my-5 w-full">
              <p className={subtitleClass}>Select your avatar</p>
              <div className="flex items-center gap-3">
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label="previous avatar"
                  onClick={() =>
                    setSelectedAvatarIndex((prev) =>
                      prev === 0 ? displayAvatars.length - 1 : prev - 1,
                    )
                  }
                  disabled={displayAvatars.length <= 1}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <div className="w-40 h-[220px] rounded-lg bg-[#dbdbe0] flex justify-center items-center overflow-hidden">
                  <span className="text-[#222] text-xl capitalize">
                    {displayAvatars[selectedAvatarIndex]?.name || "Avatar"}
                  </span>
                </div>
                <Button
                  variant="secondary"
                  size="icon"
                  aria-label="next avatar"
                  onClick={() =>
                    setSelectedAvatarIndex((prev) =>
                      prev === displayAvatars.length - 1 ? 0 : prev + 1,
                    )
                  }
                  disabled={displayAvatars.length <= 1}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
              <p className={subtitleClass}>
                {displayAvatars[selectedAvatarIndex]?.name || "Unknown"}
              </p>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 w-full">
                {displayAvatars.map((a, idx) => {
                  const name = (a.name || "").toLowerCase();
                  const isSelected = idx === selectedAvatarIndex;
                  return (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => setSelectedAvatarIndex(idx)}
                      className={`h-20 rounded-lg bg-[#2b2f45] flex items-center justify-center overflow-hidden border ${isSelected ? "border-[#1ea2df] ring-2 ring-[#1ea2df]" : "border-transparent"} hover:border-[#1ea2df]`}
                      aria-label={`Select avatar ${name || idx}`}
                    >
                      <span className="text-[#eee] text-sm capitalize">
                        {name || "avatar"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div
            style={{
              display: "flex",
              gap: 12,
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <Button
              variant="link"
              className="text-secondary-foreground"
              onClick={() => setIsSignUp(!isSignUp)}
              style={{ fontSize: "12px", padding: 0 }}
            >
              {isSignUp ? "Already have an account?" : "Don't have an account?"}
            </Button>
            <div style={{ display: "flex", gap: 8 }}>
              {!isSignUp && (
                <Button
                  variant="outline"
                  onClick={handleSignIn}
                  className="border-secondary text-secondary hover:bg-secondary/10"
                >
                  Sign In
                </Button>
              )}
              {isSignUp && (
                <Button variant="secondary" onClick={handleSignUp}>
                  Sign Up
                </Button>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <h2 className="text-[#eee] m-0">You are signed in</h2>
          <p className="text-[#c2c2c2]">Click below to enter the arena.</p>
          <div className="flex gap-3 justify-end">
            <Button
              variant="secondary"
              onClick={() => {
                // no-op: simulated ready
                setLoggedIn(true);
              }}
            >
              Enter Arena
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

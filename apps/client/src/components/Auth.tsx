"use client";
import React, { useEffect, useState } from "react";
import TextField from "@mui/material/TextField";
import Button from "@mui/material/Button";
import Alert from "@mui/material/Alert";
import IconButton from "@mui/material/IconButton";
import ArrowBackIosIcon from "@mui/icons-material/ArrowBackIos";
import ArrowForwardIosIcon from "@mui/icons-material/ArrowForwardIos";
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
        type SceneBootstrap = {
          launchGame?: () => void;
          setPendingAvatarName?: (name: string) => void;
        } & {
          network?: {
            setMyAvatarName?: (name: string) => void;
            applyAuth?: (token: string, username?: string) => void;
            joinOrCreatePublic?: () => Promise<void>;
          };
        };
        type WindowGame = { scene?: { keys?: Record<string, SceneBootstrap> } };
        const game = (window as unknown as { game?: WindowGame }).game;
        const bootstrap = game?.scene?.keys?.bootstrap;
        // Ensure the shared Phaser side receives the chosen avatar
        if (bootstrap && typeof bootstrap.setPendingAvatarName === "function") {
          bootstrap.setPendingAvatarName(avatarName || "adam");
        }
        // Launch game FIRST so event listeners are registered
        if (bootstrap && typeof bootstrap.launchGame === "function") {
          bootstrap.launchGame();
        }
        // Apply auth and join using the shared Phaser Network instance so movement sync works
        if (bootstrap?.network) {
          bootstrap.network.applyAuth?.(pendingToken, username);
          await bootstrap.network.joinOrCreatePublic?.();
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
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            autoFocus
            fullWidth
            label="Username"
            variant="outlined"
            color="secondary"
            onInput={(e) => setUser((e.target as HTMLInputElement).value)}
          />
          <TextField
            fullWidth
            type="password"
            label="Password"
            variant="outlined"
            color="secondary"
            onInput={(e) => setPass((e.target as HTMLInputElement).value)}
          />

          {isSignUp && !authSuccess && (
            <div className="flex flex-col gap-4 items-center my-5 w-full">
              <p className={subtitleClass}>Select your avatar</p>
              <div className="flex items-center gap-3">
                <IconButton
                  color="secondary"
                  aria-label="previous avatar"
                  onClick={() =>
                    setSelectedAvatarIndex((prev) =>
                      prev === 0 ? displayAvatars.length - 1 : prev - 1,
                    )
                  }
                  disabled={displayAvatars.length <= 1}
                >
                  <ArrowBackIosIcon />
                </IconButton>
                <div className="w-40 h-[220px] rounded-lg bg-[#dbdbe0] flex justify-center items-center overflow-hidden">
                  <span className="text-[#222] text-xl capitalize">
                    {displayAvatars[selectedAvatarIndex]?.name || "Avatar"}
                  </span>
                </div>
                <IconButton
                  color="secondary"
                  aria-label="next avatar"
                  onClick={() =>
                    setSelectedAvatarIndex((prev) =>
                      prev === displayAvatars.length - 1 ? 0 : prev + 1,
                    )
                  }
                  disabled={displayAvatars.length <= 1}
                >
                  <ArrowForwardIosIcon />
                </IconButton>
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
              variant="text"
              color="secondary"
              onClick={() => setIsSignUp(!isSignUp)}
              style={{ fontSize: "12px" }}
            >
              {isSignUp ? "Already have an account?" : "Don't have an account?"}
            </Button>
            <div style={{ display: "flex", gap: 8 }}>
              {!isSignUp && (
                <Button
                  variant="outlined"
                  color="secondary"
                  onClick={handleSignIn}
                >
                  Sign In
                </Button>
              )}
              {isSignUp && (
                <Button
                  variant="contained"
                  color="secondary"
                  onClick={handleSignUp}
                >
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
              variant="contained"
              color="secondary"
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

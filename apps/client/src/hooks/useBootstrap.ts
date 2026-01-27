"use client";
import { useEffect } from "react";
import ensurePhaser from "../phaser/PhaserGame";
import { useAppState } from "../providers/AppStateProvider";

export default function useBootstrap() {
  const { setLobbyJoined } = useAppState();
  useEffect(() => {
    ensurePhaser();
    // Simulate lobby connection without colyseus.js
    const timer = setTimeout(() => setLobbyJoined(true), 300);
    return () => clearTimeout(timer);
  }, [setLobbyJoined]);
  return null;
}

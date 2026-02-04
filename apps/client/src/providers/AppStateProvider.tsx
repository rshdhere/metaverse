"use client";
import React, { createContext, useContext, useMemo, useState } from "react";

type AppState = {
  loggedIn: boolean;
  setLoggedIn: (v: boolean) => void;
  computerDialogOpen: boolean;
  setComputerDialogOpen: (v: boolean) => void;
  roomJoined: boolean;
  setRoomJoined: (v: boolean) => void;
  lobbyJoined: boolean;
  setLobbyJoined: (v: boolean) => void;
  token: string;
  setToken: (v: string) => void;
  username: string;
  setUsername: (v: string) => void;
  avatarName: string;
  setAvatarName: (v: string) => void;
};

const AppStateContext = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: React.ReactNode }) {
  const [loggedIn, setLoggedIn] = useState(false);
  const [computerDialogOpen, setComputerDialogOpen] = useState(false);
  const [roomJoined, setRoomJoined] = useState(false);
  const [lobbyJoined, setLobbyJoined] = useState(false);
  const [token, setToken] = useState("");
  const [username, setUsername] = useState("");
  const [avatarName, setAvatarName] = useState("ron");

  const value = useMemo(
    () => ({
      loggedIn,
      setLoggedIn,
      computerDialogOpen,
      setComputerDialogOpen,
      roomJoined,
      setRoomJoined,
      lobbyJoined,
      setLobbyJoined,
      token,
      setToken,
      username,
      setUsername,
      avatarName,
      setAvatarName,
    }),
    [
      loggedIn,
      computerDialogOpen,
      roomJoined,
      lobbyJoined,
      token,
      username,
      avatarName,
    ],
  );

  return (
    <AppStateContext.Provider value={value}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used within AppStateProvider");
  return ctx;
}

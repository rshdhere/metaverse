"use client";
import React from "react";
import RoomSelectionDialog from "./components/RoomSelectionDialog";
import Auth from "./components/Auth";
import ComputerDialog from "./components/ComputerDialog";
import MobileVirtualJoystick from "./components/MobileVirtualJoystick";
import { useAppState } from "./providers/AppStateProvider";

export default function App() {
  const { loggedIn, computerDialogOpen, roomJoined } = useAppState();

  let ui: React.ReactNode;
  if (loggedIn) {
    ui = computerDialogOpen ? <ComputerDialog /> : <MobileVirtualJoystick />;
  } else if (roomJoined) {
    ui = <Auth />;
  } else {
    ui = <RoomSelectionDialog />;
  }

  const overlayClass = loggedIn
    ? "absolute top-0 left-0 h-full w-full z-0 pointer-events-none"
    : "absolute top-0 left-0 h-full w-full z-20";

  return <div className={overlayClass}>{ui}</div>;
}

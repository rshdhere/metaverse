"use client";
import React, { useState } from "react";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import LinearProgress from "@mui/material/LinearProgress";
import Alert from "@mui/material/Alert";
import Snackbar from "@mui/material/Snackbar";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useAppState } from "../providers/AppStateProvider";
import dynamic from "next/dynamic";
import { useMemo } from "react";
import { getTrpcClient } from "@/lib/trpc";
import TextField from "@mui/material/TextField";

const ProgressBar = LinearProgress;

export default function RoomSelectionDialog() {
  const [showCustomRoom, setShowCustomRoom] = useState(false);
  const [showCreateRoomForm, setShowCreateRoomForm] = useState(false);
  const [showSnackbar, setShowSnackbar] = useState(false);
  const { lobbyJoined, setRoomJoined } = useAppState();

  const handleConnect = async () => {
    if (!lobbyJoined) {
      setShowSnackbar(true);
      return;
    }
    // Redirect to Auth form flow
    setRoomJoined(true);
  };

  return (
    <>
      <Snackbar
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        open={showSnackbar}
        autoHideDuration={3000}
        onClose={() => setShowSnackbar(false)}
      >
        <Alert
          severity="error"
          variant="outlined"
          sx={{ background: "#fdeded", color: "#7d4747" }}
        >
          Trying to connect to server, please try again!
        </Alert>
      </Snackbar>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-[60px] items-center w-[90vw] max-w-[840px]">
        <div className="bg-[#222639] rounded-2xl px-6 py-6 md:px-[60px] md:py-[36px] shadow-[0_0_5px_#0000006f] w-full">
          {showCreateRoomForm ? (
            <div className="relative flex flex-col gap-5 items-center justify-center">
              <div className="grid w-full">
                <IconButton
                  className="back-button justify-self-start self-center"
                  onClick={() => setShowCreateRoomForm(false)}
                >
                  <ArrowBackIcon />
                </IconButton>
                <h1 className="text-2xl text-[#eee] text-center">
                  Create Custom Room
                </h1>
              </div>
              {/* Placeholder for CreateRoomForm */}
              <div className="text-[#c2c2c2]">Coming soon</div>
            </div>
          ) : showCustomRoom ? (
            <div className="relative flex flex-col gap-5 items-center justify-center">
              <div className="grid w-full">
                <IconButton
                  className="back-button justify-self-start self-center"
                  onClick={() => setShowCustomRoom(false)}
                >
                  <ArrowBackIcon />
                </IconButton>
                <h1 className="text-2xl text-[#eee] text-center">
                  Custom Rooms
                  <Tooltip
                    title="We update the results in realtime, no refresh needed!"
                    placement="top"
                  >
                    <IconButton>
                      <HelpOutlineIcon className="tip text-lg" />
                    </IconButton>
                  </Tooltip>
                </h1>
              </div>
              {/* Minimal CreateRoomForm */}
              {showCreateRoomForm ? (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.currentTarget as HTMLFormElement;
                    const name =
                      (form.elements.namedItem("name") as HTMLInputElement)
                        ?.value || "";
                    try {
                      await getTrpcClient().space.create.mutate({
                        name: name || "My Room",
                        dimensions: "50x50",
                      });
                    } catch (err) {
                      console.error(err);
                    }
                  }}
                  className="flex flex-col gap-3 w-80"
                >
                  <TextField
                    name="name"
                    label="Room name"
                    variant="outlined"
                    color="secondary"
                    size="small"
                  />
                  <Button type="submit" variant="contained" color="secondary">
                    Create
                  </Button>
                </form>
              ) : (
                <div className="text-[#c2c2c2]">Custom rooms</div>
              )}
              <Button
                variant="contained"
                color="secondary"
                onClick={() => setShowCreateRoomForm(true)}
              >
                Create new room
              </Button>
            </div>
          ) : (
            <>
              <h1 className="text-2xl text-[#eee] text-center">
                Welcome to SkyOffice
              </h1>
              <div className="flex flex-col gap-5 my-5 items-center justify-center">
                <Button
                  variant="contained"
                  color="secondary"
                  onClick={handleConnect}
                >
                  Connect to public lobby
                </Button>
                <Button
                  variant="outlined"
                  color="secondary"
                  onClick={() =>
                    lobbyJoined
                      ? setShowCustomRoom(true)
                      : setShowSnackbar(true)
                  }
                >
                  Create/find custom rooms
                </Button>
              </div>
            </>
          )}
        </div>
        {!lobbyJoined && (
          <div className="flex flex-col items-center">
            <h3 className="text-[#33ac96]"> Connecting to server...</h3>
            <ProgressBar color="secondary" sx={{ width: 360 }} />
          </div>
        )}
      </div>
    </>
  );
}

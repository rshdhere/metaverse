"use client";
import React, { useEffect, useState } from "react";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import LinearProgress from "@mui/material/LinearProgress";
import Alert from "@mui/material/Alert";
import Snackbar from "@mui/material/Snackbar";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import { useRouter } from "next/navigation";
import { useAppState } from "../../../src/providers/AppStateProvider";
import Network from "../../../src/services/Network";
import {
  getStoredCredentials,
  removeAuthCookie,
} from "../../../src/utils/auth";

const ProgressBar = LinearProgress;

export default function SpacePage() {
  const router = useRouter();
  const {
    token,
    username,
    avatarName,
    setLoggedIn,
    setToken,
    setUsername,
    setAvatarName,
  } = useAppState();
  const [showCustomRoom, setShowCustomRoom] = useState(false);
  const [showCreateRoomForm, setShowCreateRoomForm] = useState(false);
  const [showSnackbar, setShowSnackbar] = useState(false);
  const [lobbyJoined, setLobbyJoined] = useState(false);
  const [network] = useState<Network>(() => new Network());
  const [loading, setLoading] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);

  // Check authentication and restore state if needed
  useEffect(() => {
    if (!token) {
      const credentials = getStoredCredentials();
      if (credentials) {
        setToken(credentials.token);
        setUsername(credentials.username);
        setAvatarName(credentials.avatarName);
        network.applyAuth(credentials.token, credentials.username);
        network.setMyAvatarName(credentials.avatarName);
        setAuthChecked(true);
      } else {
        // Only redirect if no credentials found
        setAuthChecked(true);
        router.push("/login");
      }
    } else {
      // Token exists in state, ensure network is configured
      if (username) {
        network.applyAuth(token, username);
        if (avatarName) {
          network.setMyAvatarName(avatarName);
        }
      }
      setAuthChecked(true);
    }
  }, [
    token,
    username,
    avatarName,
    router,
    network,
    setToken,
    setUsername,
    setAvatarName,
  ]);

  // Simulate lobby connection
  useEffect(() => {
    const timer = setTimeout(() => setLobbyJoined(true), 500);
    return () => clearTimeout(timer);
  }, []);

  const handleJoinPublicLobby = async () => {
    if (!lobbyJoined) {
      setShowSnackbar(true);
      return;
    }

    // Just redirect to arena - the arena page will handle joining and launching the game
    router.push("/arena");
  };

  const handleCreateRoom = async () => {
    if (!lobbyJoined) {
      setShowSnackbar(true);
      return;
    }
    setShowCustomRoom(true);
  };

  // Show loading state while checking authentication
  if (!authChecked || (!token && !username)) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-[#1a1d2e] to-[#2d3250]">
        <div className="flex flex-col items-center">
          <h3 className="text-[#33ac96] mb-4">Checking authentication...</h3>
          <ProgressBar color="secondary" sx={{ width: 360 }} />
        </div>
      </div>
    );
  }

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

      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-[#1a1d2e] to-[#2d3250]">
        <div className="flex flex-col gap-[60px] items-center w-[90vw] max-w-[840px]">
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
                <div className="text-[#c2c2c2]">Custom rooms</div>
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
                <h1 className="text-2xl text-[#eee] text-center mb-2">
                  Welcome to SkyOffice
                </h1>
                {username && (
                  <p className="text-[#c2c2c2] text-center mb-4">
                    Hello, {username}!
                  </p>
                )}
                <div className="flex flex-col gap-5 my-5 items-center justify-center">
                  <Button
                    variant="contained"
                    color="secondary"
                    onClick={handleJoinPublicLobby}
                    disabled={loading || !lobbyJoined}
                  >
                    {loading ? "Joining..." : "Join Public Lobby"}
                  </Button>
                  <Button
                    variant="outlined"
                    color="secondary"
                    onClick={handleCreateRoom}
                    disabled={!lobbyJoined}
                  >
                    Create/Find Custom Rooms
                  </Button>
                  <Button
                    variant="text"
                    color="secondary"
                    onClick={() => {
                      removeAuthCookie();
                      setToken("");
                      setUsername("");
                      setAvatarName("adam");
                      router.push("/login");
                    }}
                    style={{ fontSize: "12px" }}
                  >
                    Sign Out
                  </Button>
                </div>
              </>
            )}
          </div>
          {!lobbyJoined && (
            <div className="flex flex-col items-center">
              <h3 className="text-[#33ac96]">Connecting to server...</h3>
              <ProgressBar color="secondary" sx={{ width: 360 }} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

"use client";
import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "sonner";
import { CircleHelp, ArrowLeft, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useAppState } from "../../../src/providers/AppStateProvider";
import Network from "../../../src/services/Network";
import {
  getStoredCredentials,
  removeAuthCookie,
} from "../../../src/utils/auth";
import { cn } from "@/lib/utils";

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
      toast.error("Trying to connect to server, please try again!");
      return;
    }

    // Just redirect to arena - the arena page will handle joining and launching the game
    router.push("/arena");
  };

  const handleCreateRoom = async () => {
    if (!lobbyJoined) {
      toast.error("Trying to connect to server, please try again!");
      return;
    }
    setShowCustomRoom(true);
  };

  // Show loading state while checking authentication
  if (!authChecked || (!token && !username)) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-[#1a1d2e] to-[#2d3250]">
        <div className="flex flex-col items-center gap-4">
          <h3 className="text-[#33ac96]">Checking authentication...</h3>
          <Loader2 className="h-8 w-8 animate-spin text-secondary" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-[#1a1d2e] to-[#2d3250]">
        <div className="flex flex-col gap-[60px] items-center w-[90vw] max-w-[840px]">
          <div className="bg-[#222639] rounded-2xl px-6 py-6 md:px-[60px] md:py-[36px] shadow-[0_0_5px_#0000006f] w-full">
            {showCreateRoomForm ? (
              <div className="relative flex flex-col gap-5 items-center justify-center">
                <div className="grid w-full">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="justify-self-start self-center"
                    onClick={() => setShowCreateRoomForm(false)}
                  >
                    <ArrowLeft className="h-6 w-6" />
                  </Button>
                  <h1 className="text-2xl text-[#eee] text-center">
                    Create Custom Room
                  </h1>
                </div>
                <div className="text-[#c2c2c2]">Coming soon</div>
              </div>
            ) : showCustomRoom ? (
              <div className="relative flex flex-col gap-5 items-center justify-center">
                <div className="grid w-full">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="justify-self-start self-center"
                    onClick={() => setShowCustomRoom(false)}
                  >
                    <ArrowLeft className="h-6 w-6" />
                  </Button>
                  <h1 className="text-2xl text-[#eee] text-center flex items-center justify-center gap-2">
                    Custom Rooms
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-auto p-0"
                          >
                            <CircleHelp className="h-5 w-5 text-muted-foreground" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>
                            We update the results in realtime, no refresh
                            needed!
                          </p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </h1>
                </div>
                <div className="text-[#c2c2c2]">Custom rooms</div>
                <Button
                  variant="secondary"
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
                    variant="secondary"
                    size="lg"
                    onClick={handleJoinPublicLobby}
                    disabled={loading || !lobbyJoined}
                    className="w-full max-w-xs"
                  >
                    {loading ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Joining...
                      </>
                    ) : (
                      "Join Public Lobby"
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="lg"
                    onClick={handleCreateRoom}
                    disabled={!lobbyJoined}
                    className="w-full max-w-xs border-secondary text-secondary hover:bg-secondary/10"
                  >
                    Create/Find Custom Rooms
                  </Button>
                  <Button
                    variant="link"
                    onClick={() => {
                      removeAuthCookie();
                      setToken("");
                      setUsername("");
                      setAvatarName("adam");
                      router.push("/login");
                    }}
                    className="text-secondary-foreground text-xs"
                  >
                    Sign Out
                  </Button>
                </div>
              </>
            )}
          </div>
          {!lobbyJoined && (
            <div className="flex flex-col items-center gap-2">
              <h3 className="text-[#33ac96]">Connecting to server...</h3>
              <Loader2 className="h-8 w-8 animate-spin text-secondary" />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

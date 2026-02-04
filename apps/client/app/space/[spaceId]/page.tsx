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
import { CircleHelp, ArrowLeft } from "lucide-react";
import { Loader } from "@/components/ui/loader";
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
      <div className="fixed inset-0 flex items-center justify-center bg-black">
        <div className="flex flex-col items-center gap-4">
          <h3 className="text-white">Checking authentication...</h3>
          <Loader size="lg" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="fixed inset-0 flex items-center justify-center bg-black p-4">
        <div className="flex flex-col gap-[60px] items-center w-[90vw] max-w-[840px]">
          <div className="bg-black border border-white/20 rounded-2xl px-6 py-6 md:px-[60px] md:py-[36px] shadow-2xl w-full">
            {showCreateRoomForm ? (
              <div className="relative flex flex-col gap-5 items-center justify-center">
                <div className="grid w-full">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="justify-self-start self-center text-white hover:bg-zinc-800"
                    onClick={() => setShowCreateRoomForm(false)}
                  >
                    <ArrowLeft className="h-6 w-6" />
                  </Button>
                  <h1 className="text-2xl text-white text-center font-bold">
                    Create Custom Room
                  </h1>
                </div>
                <div className="text-gray-400">Coming soon</div>
              </div>
            ) : showCustomRoom ? (
              <div className="relative flex flex-col gap-5 items-center justify-center">
                <div className="grid w-full">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="justify-self-start self-center text-white hover:bg-zinc-800"
                    onClick={() => setShowCustomRoom(false)}
                  >
                    <ArrowLeft className="h-6 w-6" />
                  </Button>
                  <h1 className="text-2xl text-white text-center flex items-center justify-center gap-2 font-bold">
                    Custom Rooms
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-auto p-0"
                          >
                            <CircleHelp className="h-5 w-5 text-gray-400" />
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
                <div className="text-gray-400">Custom rooms</div>
                <Button
                  variant="outline"
                  className="bg-white hover:bg-gray-200 text-black border-none cursor-pointer"
                  onClick={() => setShowCreateRoomForm(true)}
                >
                  Create new room
                </Button>
              </div>
            ) : (
              <>
                <h1 className="text-2xl text-white text-center mb-2 font-bold">
                  let's explore our new virtual-office
                </h1>
                {username && (
                  <p className="text-gray-400 text-center mb-4">
                    Hello, {username}!
                  </p>
                )}
                <div className="flex flex-col gap-5 my-5 items-center justify-center">
                  <Button
                    size="lg"
                    onClick={handleJoinPublicLobby}
                    disabled={loading || !lobbyJoined}
                    className="w-full max-w-xs bg-white hover:bg-gray-200 text-black cursor-pointer transition-all"
                  >
                    {loading ? (
                      <>
                        <Loader size="sm" className="mr-2" />
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
                    className="w-full max-w-xs bg-zinc-900 border-2 border-zinc-700 text-white hover:border-white hover:bg-zinc-700 hover:text-white cursor-pointer transition-all duration-200"
                  >
                    Create/Find Custom Rooms
                  </Button>
                  <Button
                    variant="link"
                    onClick={() => {
                      removeAuthCookie();
                      setToken("");
                      setUsername("");
                      setAvatarName("ron");
                      router.push("/login");
                    }}
                    className="text-gray-500 hover:text-white text-xs cursor-pointer"
                  >
                    Sign Out
                  </Button>
                </div>
              </>
            )}
          </div>
          {!lobbyJoined && (
            <div className="flex flex-col items-center gap-2">
              <h3 className="text-white">Connecting to server...</h3>
              <Loader size="lg" />
            </div>
          )}
        </div>
      </div>
    </>
  );
}

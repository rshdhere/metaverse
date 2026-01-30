"use client";
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { CircleHelp, ArrowLeft, Loader2 } from "lucide-react";
import { useAppState } from "../providers/AppStateProvider";
import { getTrpcClient } from "@/lib/trpc";

export default function RoomSelectionDialog() {
  const [showCustomRoom, setShowCustomRoom] = useState(false);
  const [showCreateRoomForm, setShowCreateRoomForm] = useState(false);
  const { lobbyJoined, setRoomJoined } = useAppState();

  const handleConnect = async () => {
    if (!lobbyJoined) {
      toast.error("Trying to connect to server, please try again!");
      return;
    }
    // Redirect to Auth form flow
    setRoomJoined(true);
  };

  return (
    <>
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-[60px] items-center w-[90vw] max-w-[840px]">
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
              {/* Placeholder for CreateRoomForm */}
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
                          We update the results in realtime, no refresh needed!
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </h1>
              </div>
              {/* Minimal CreateRoomForm */}
              {showCreateRoomForm ? (
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.currentTarget as HTMLFormElement;
                    const nameInput = form.elements.namedItem(
                      "name",
                    ) as HTMLInputElement;
                    const name = nameInput?.value || "";
                    try {
                      await getTrpcClient().space.create.mutate({
                        name: name || "My Room",
                        dimensions: "50x50",
                      });
                      toast.success("Room created!");
                    } catch (err) {
                      console.error(err);
                      toast.error("Failed to create room");
                    }
                  }}
                  className="flex flex-col gap-3 w-80"
                >
                  <div className="grid w-full max-w-sm items-center gap-1.5">
                    <Label htmlFor="room-name" className="text-white">
                      Room name
                    </Label>
                    <Input
                      id="room-name"
                      name="name"
                      placeholder="Room name"
                      className="bg-secondary text-secondary-foreground"
                    />
                  </div>
                  <Button type="submit" variant="secondary">
                    Create
                  </Button>
                </form>
              ) : (
                <div className="text-[#c2c2c2]">Custom rooms</div>
              )}
              <Button
                variant="secondary"
                onClick={() => setShowCreateRoomForm(true)}
              >
                Create new room
              </Button>
            </div>
          ) : (
            <>
              <h1 className="text-2xl text-[#eee] text-center">
                Welcome to metaverse
              </h1>
              <div className="flex flex-col gap-5 my-5 items-center justify-center">
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={handleConnect}
                  className="w-full max-w-xs"
                >
                  Connect to public lobby
                </Button>
                <Button
                  variant="outline"
                  size="lg"
                  className="w-full max-w-xs border-secondary text-secondary hover:bg-secondary/10"
                  onClick={() =>
                    lobbyJoined
                      ? setShowCustomRoom(true)
                      : toast.error("Please wait for connection...")
                  }
                >
                  Create/find custom rooms
                </Button>
              </div>
            </>
          )}
        </div>
        {!lobbyJoined && (
          <div className="flex flex-col items-center gap-2">
            <h3 className="text-[#33ac96]"> Connecting to server...</h3>
            <Loader2 className="h-8 w-8 animate-spin text-secondary" />
          </div>
        )}
      </div>
    </>
  );
}

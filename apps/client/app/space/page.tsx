"use client";
import React from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function SpacesCatalogPage() {
  const router = useRouter();

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black p-4">
      <Card className="w-full max-w-2xl bg-black border border-white/20 shadow-2xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold text-white">
            Choose a Space
          </CardTitle>
          <CardDescription className="text-gray-400">
            Select a virtual space to enter
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* 100xlabs Space */}
          <Button
            variant="ghost"
            className="w-full h-auto p-0 overflow-hidden bg-zinc-900 hover:bg-zinc-800 border-2 border-zinc-700 hover:border-white/50 rounded-xl cursor-pointer transition-all duration-200 hover:-translate-y-1"
            onClick={() => router.push("/space/100xlabs")}
          >
            <div className="flex w-full items-center">
              <div className="w-32 h-20 flex-shrink-0 bg-black rounded-l-xl overflow-hidden">
                <video
                  src="/assets/VID-20251001-WA00021.mp4"
                  className="w-full h-full object-cover"
                  autoPlay
                  muted
                  loop
                  playsInline
                />
              </div>
              <div className="flex-1 p-4 text-left">
                <div className="text-white font-semibold">100xlabs</div>
                <div className="text-gray-400 text-sm">Click to enter</div>
              </div>
            </div>
          </Button>

          {/* Haven Studios Space */}
          <Button
            variant="ghost"
            className="w-full h-auto p-0 overflow-hidden bg-zinc-900 hover:bg-zinc-800 border-2 border-zinc-700 hover:border-white/50 rounded-xl cursor-pointer transition-all duration-200 hover:-translate-y-1"
            onClick={() => alert("Under construction")}
          >
            <div className="flex w-full items-center">
              <div className="w-32 h-20 flex-shrink-0 bg-black rounded-l-xl overflow-hidden">
                <img
                  src="/assets/construction.gif"
                  alt="Haven Studios under construction"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex-1 p-4 text-left">
                <div className="text-white font-semibold">Haven Studios</div>
                <div className="text-gray-400 text-sm">Under construction</div>
              </div>
            </div>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

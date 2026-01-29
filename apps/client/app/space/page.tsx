"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import Beams from "@/components/Beams";
import { Loader } from "@/components/ui/loader";

export default function SpacesCatalogPage() {
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gray-950">
      {/* Loader - shown while background is loading */}
      <div
        className={`absolute inset-0 z-20 flex items-center justify-center bg-gray-950 transition-opacity duration-500 ${
          isReady ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
      >
        <Loader size="lg" />
      </div>

      {/* Background */}
      <div
        className={`absolute inset-0 z-0 h-full w-full transition-opacity duration-500 ${
          isReady ? "opacity-100" : "opacity-0"
        }`}
      >
        <Beams
          beamWidth={3}
          beamHeight={30}
          beamNumber={20}
          lightColor="#ffffff"
          speed={2}
          noiseIntensity={1.75}
          scale={0.2}
          rotation={30}
          onReady={() => setIsReady(true)}
        />
      </div>

      {/* Content */}
      <div
        className={`relative z-10 w-[92vw] max-w-[1280px] transition-opacity duration-500 ${
          isReady ? "opacity-100" : "opacity-0"
        }`}
      >
        <h1 className="text-2xl text-white mb-6">Spaces</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <button
            className="group relative rounded-xl overflow-hidden shadow-[0_0_5px_#0000006f] bg-[#222639]/80 backdrop-blur-sm border border-white/10 cursor-pointer"
            onClick={() => router.push("/space/100xlabs")}
            aria-label="Open 100xlabs space"
          >
            <div className="aspect-video w-full bg-black">
              <video
                src="/assets/VID-20251001-WA00021.mp4"
                className="w-full h-full object-cover"
                autoPlay
                muted
                loop
                playsInline
              />
            </div>
            <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-[#000000a6] to-transparent">
              <div className="text-left">
                <div className="text-white font-semibold">100xlabs</div>
                <div className="text-[#c2c2c2] text-xs">Click to enter</div>
              </div>
            </div>
          </button>
          <button
            className="group relative rounded-xl overflow-hidden shadow-[0_0_5px_#0000006f] bg-[#222639]/80 backdrop-blur-sm border border-white/10 cursor-pointer"
            onClick={() => alert("Under construction")}
            aria-label="Haven Studios (under construction)"
          >
            <div className="aspect-video w-full bg-black">
              <img
                src="/assets/construction.gif"
                alt="Haven Studios under construction"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-[#000000a6] to-transparent">
              <div className="text-left">
                <div className="text-white font-semibold">Haven Studios</div>
                <div className="text-[#c2c2c2] text-xs">Under construction</div>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

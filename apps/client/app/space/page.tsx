"use client";
import React from "react";
import { useRouter } from "next/navigation";

export default function SpacesCatalogPage() {
  const router = useRouter();
  return (
    <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-[#1a1d2e] to-[#2d3250]">
      <div className="w-[92vw] max-w-[1280px]">
        <h1 className="text-2xl text-[#eee] mb-6">Spaces</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <button
            className="group relative rounded-xl overflow-hidden shadow-[0_0_5px_#0000006f] bg-[#222639] border border-[#30344a] cursor-pointer"
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
            className="group relative rounded-xl overflow-hidden shadow-[0_0_5px_#0000006f] bg-[#222639] border border-[#30344a] cursor-pointer"
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

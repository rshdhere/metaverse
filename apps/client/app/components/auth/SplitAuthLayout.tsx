"use client";

import { ReactNode, useState, useEffect } from "react";
import Beams from "@/components/Beams";

const QUOTES = [
  {
    text: "The metaverse is not just a place, it's a moment in time when our digital lives become more important to us than our physical lives.",
    author: "Unknown Future",
  },
  {
    text: "Building the future of collaboration, one pixel at a time.",
    author: "Metaverse Team",
  },
  {
    text: "Connect, collaborate, and create in a world without boundaries.",
    author: "Metaverse Vision",
  },
];

const QUOTE_ROTATION_INTERVAL = 2 * 60 * 1000; // 2 minutes in milliseconds

function getQuoteIndex(): number {
  // Calculate quote index based on current time (every 2 minutes)
  return Math.floor(Date.now() / QUOTE_ROTATION_INTERVAL) % QUOTES.length;
}

export default function SplitAuthLayout({ children }: { children: ReactNode }) {
  const [quoteIndex, setQuoteIndex] = useState(getQuoteIndex);

  useEffect(() => {
    // Update quote every 2 minutes
    const intervalId = setInterval(() => {
      setQuoteIndex(getQuoteIndex());
    }, QUOTE_ROTATION_INTERVAL);

    return () => clearInterval(intervalId);
  }, []);

  const currentQuote = QUOTES[quoteIndex];

  return (
    <div className="flex min-h-screen w-full">
      {/* Left Side - Visuals */}
      <div className="hidden w-1/2 relative bg-gray-950 lg:flex flex-col items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          <Beams
            beamWidth={3}
            beamHeight={30}
            beamNumber={20}
            lightColor="#ffffff"
            speed={2}
            noiseIntensity={1.75}
            scale={0.2}
            rotation={30}
          />
        </div>
        <div className="relative z-10 px-12 text-center">
          <blockquote className="space-y-2">
            <p className="text-2xl font-medium leading-relaxed text-white">
              &ldquo;{currentQuote.text}&rdquo;
            </p>
            <footer className="text-sm text-gray-400">
              &mdash; {currentQuote.author}
            </footer>
          </blockquote>
        </div>
      </div>

      {/* Right Side - Form */}
      <div className="flex w-full items-center justify-center bg-white dark:bg-black lg:w-1/2">
        <div className="w-full max-w-sm px-6 py-12 lg:px-8">{children}</div>
      </div>
    </div>
  );
}

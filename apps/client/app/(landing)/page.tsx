"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { logout } from "@/lib/auth";

import Beams from "@/components/Beams";
import { Button } from "@/components/ui/button";
import { Loader } from "@/components/ui/loader";

export default function Home() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    setIsLoggedIn(!!token);
  }, []);

  const handleLogout = () => {
    logout("/login", false); // Manual logout, no toast needed
  };

  const handleBeamsReady = () => {
    setIsReady(true);
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center bg-gray-950 text-white overflow-hidden">
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
          onReady={handleBeamsReady}
        />
      </div>

      {/* Content */}
      <div
        className={`relative z-10 flex flex-col items-center gap-8 p-4 max-w-7xl mx-auto text-center transition-opacity duration-500 ${
          isReady ? "opacity-100" : "opacity-0"
        }`}
      >
        <h1 className="text-4xl md:text-6xl lg:text-7xl tracking-tight bg-gradient-to-br from-white to-gray-400 bg-clip-text text-transparent font-instrument-serif leading-[1.1]">
          Your workspace, reimagined
          <br className="hidden md:block" />
          in the{" "}
          <span className="relative inline-block bg-gradient-to-br from-white to-gray-400 bg-clip-text text-transparent">
            metaverse
            <span
              className="absolute bottom-0 left-0 h-[3px] bg-gradient-to-r from-white to-gray-400"
              style={{
                animation: isReady
                  ? "underline-slide 1s ease-out forwards"
                  : "none",
              }}
            />
          </span>
        </h1>
        <style jsx>{`
          @keyframes underline-slide {
            from {
              width: 0%;
            }
            to {
              width: 100%;
            }
          }
        `}</style>
        <p className="max-w-xl text-lg text-gray-400">
          A virtual office for modern remote teams to collaborate
        </p>

        {isLoggedIn ? (
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm text-gray-400">You are logged in</p>
            <div className="flex gap-4">
              <Button asChild size="lg" className="rounded-lg">
                <Link href="/arena">Join Arena</Link>
              </Button>
              <Button
                asChild
                variant="outline"
                size="lg"
                className="rounded-lg border-white/10 bg-white/5 text-white hover:bg-white/10 hover:text-white border-transparent"
              >
                <Link href="/space">View Spaces</Link>
              </Button>
            </div>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-white transition-colors underline decoration-dotted underline-offset-4 cursor-pointer"
            >
              Log out
            </button>
          </div>
        ) : (
          <div className="flex gap-4">
            <Button
              asChild
              variant="secondary"
              size="lg"
              className="rounded-lg"
            >
              <Link href="/login">Log in</Link>
            </Button>
            <Button asChild size="lg" className="rounded-lg">
              <Link href="/signup">Get Started</Link>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

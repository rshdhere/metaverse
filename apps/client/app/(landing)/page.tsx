"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { logout } from "@/lib/auth";

import Beams from "@/components/Beams";

export default function Home() {
  const router = useRouter();
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem("token");
    setIsLoggedIn(!!token);
  }, []);

  const handleLogout = () => {
    logout("/login", false); // Manual logout, no toast needed
  };

  return (
    <div className="relative flex min-h-screen w-full flex-col items-center justify-center bg-gray-950 text-white overflow-hidden">
      <div className="absolute inset-0 z-0 h-full w-full">
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
      <div className="relative z-10 flex flex-col items-center gap-8 p-4 max-w-7xl mx-auto text-center">
        <h1 className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight bg-gradient-to-br from-white to-gray-400 bg-clip-text text-transparent font-instrument-serif leading-[1.1]">
          Your workspace, reimagined
          <br className="hidden md:block" />
          in the metaverse.
        </h1>
        <p className="max-w-xl text-lg text-gray-400">
          A virtual office for modern remote teams to collaborate, connect, and
          build culture.
        </p>

        {isLoggedIn ? (
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm text-gray-400">You are logged in</p>
            <div className="flex gap-4">
              <Link
                href="/arena"
                className="rounded-lg bg-white px-8 py-3 text-sm font-bold text-black shadow-[0_0_20px_rgba(255,255,255,0.2)] transition-transform hover:scale-105 hover:shadow-[0_0_30px_rgba(255,255,255,0.3)]"
              >
                Join Arena
              </Link>
              <Link
                href="/space"
                className="rounded-lg border border-white/10 bg-white/5 px-8 py-3 text-sm font-medium text-white hover:bg-white/10 transition-all"
              >
                View Spaces
              </Link>
            </div>
            <button
              onClick={handleLogout}
              className="text-sm text-gray-500 hover:text-white transition-colors underline decoration-dotted underline-offset-4"
            >
              Log out
            </button>
          </div>
        ) : (
          <div className="flex gap-4">
            <Link
              href="/login"
              className="rounded-lg border border-gray-800 bg-gray-950/50 px-8 py-3 text-sm font-medium text-gray-300 hover:bg-gray-900 hover:text-white hover:border-gray-700 transition-all"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-white px-8 py-3 text-sm font-bold text-black shadow-[0_0_20px_rgba(255,255,255,0.2)] transition-transform hover:scale-105 hover:shadow-[0_0_30px_rgba(255,255,255,0.3)]"
            >
              Sign up
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

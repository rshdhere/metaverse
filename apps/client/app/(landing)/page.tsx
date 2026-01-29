"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { logout } from "@/lib/auth";
import PixelSnow from "@/components/ui/PixelSnow";

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
      <div className="absolute inset-0 z-0 pointer-events-none">
        <PixelSnow
          flakeSize={0.02}
          speed={1.5}
          density={0.4}
          color="#33ac96" // Matching the green accent
        />
      </div>
      <div className="relative z-10 flex flex-col items-center gap-6 p-4">
        <h1 className="text-4xl font-bold tracking-tight text-[#33ac96]">
          Welcome to SkyOffice
        </h1>

        {isLoggedIn ? (
          <div className="flex flex-col items-center gap-4">
            <p className="text-sm text-gray-400">You are logged in</p>
            <div className="flex gap-4">
              <Link
                href="/arena"
                className="rounded-lg bg-[#33ac96] px-6 py-3 text-sm font-bold text-gray-900 shadow-[0_0_20px_rgba(51,172,150,0.4)] transition-transform hover:scale-105 hover:shadow-[0_0_30px_rgba(51,172,150,0.6)]"
              >
                Join Arena
              </Link>
              <Link
                href="/space"
                className="rounded-lg border border-[#33ac96]/30 bg-[#33ac96]/10 px-6 py-3 text-sm font-medium text-[#33ac96] hover:bg-[#33ac96]/20 transition-all"
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
              className="rounded-lg border border-gray-700 bg-gray-800/50 px-6 py-3 text-sm font-medium hover:bg-gray-800 hover:border-gray-600 transition-all"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="rounded-lg bg-[#33ac96] px-6 py-3 text-sm font-bold text-gray-900 shadow-[0_0_20px_rgba(51,172,150,0.4)] transition-transform hover:scale-105 hover:shadow-[0_0_30px_rgba(51,172,150,0.6)]"
            >
              Sign up
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

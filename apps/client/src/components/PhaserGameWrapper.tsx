"use client";
import { useEffect } from "react";
import dynamic from "next/dynamic";

const PhaserBootstrap = dynamic(
  () =>
    import("../phaser/PhaserGame").then((mod) => ({
      default: function PhaserBootstrap() {
        useEffect(() => {
          mod.default();
          return () => {
            mod.destroyPhaserGame?.();
          };
        }, []);
        return null;
      },
    })),
  { ssr: false },
);

export default function PhaserGameWrapper() {
  return <PhaserBootstrap />;
}

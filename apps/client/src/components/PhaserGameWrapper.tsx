"use client";
import { useEffect } from "react";
import dynamic from "next/dynamic";

const PhaserInit = dynamic(
  () =>
    import("../phaser/PhaserGame").then((mod) => ({
      default: function PhaserInit() {
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
  return <PhaserInit />;
}

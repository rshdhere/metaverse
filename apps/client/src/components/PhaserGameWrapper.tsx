"use client";
import dynamic from "next/dynamic";

const PhaserBootstrap = dynamic(
  () =>
    import("../phaser/PhaserGame").then((mod) => ({
      default: function PhaserBootstrap() {
        mod.default();
        return null;
      },
    })),
  { ssr: false },
);

export default function PhaserGameWrapper() {
  return <PhaserBootstrap />;
}

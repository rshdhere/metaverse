import React from "react";
import Providers from "../../src/providers/Providers";

export default function SpaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <Providers>{children}</Providers>;
}

import type { Metadata } from "next";
import { LandingPageShell } from "@/app/components/landing-page-shell";

export const metadata: Metadata = {
  title: "Jumpserve",
  description: "Landing page for Jumpserve's emulation run explorer and aggregate graph tools.",
};

export default function Home() {
  return <LandingPageShell />;
}

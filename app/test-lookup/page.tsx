import type { Metadata } from "next";
import { TestLookupHome } from "@/app/components/test-lookup-home";

export const metadata: Metadata = {
  title: "Test Lookup",
  description: "Browse parent runs, upload animated assets, and inspect emulation results.",
};

export default function TestLookupPage() {
  return <TestLookupHome />;
}

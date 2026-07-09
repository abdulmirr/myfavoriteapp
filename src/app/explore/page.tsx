import type { Metadata } from "next";
import Explore from "@/components/Explore";

export const metadata: Metadata = {
  title: "Explore",
  description: "People worth following, and what they’re saving.",
};

export default function ExplorePage() {
  return <Explore />;
}

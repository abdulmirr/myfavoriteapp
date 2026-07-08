import type { Metadata } from "next";
import Friends from "@/components/Friends";

// signed-in directory — nothing here for crawlers
export const metadata: Metadata = {
  title: "Friends",
  robots: { index: false },
};

// Auth lives client-side (localStorage), so this is a thin client shell —
// same pattern as the root feed.
export default function FriendsPage() {
  return <Friends />;
}

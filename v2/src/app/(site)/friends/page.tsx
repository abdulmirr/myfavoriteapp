import type { Metadata } from "next";
import FriendsView from "@/components/friends/FriendsView";

export const metadata: Metadata = {
  title: "Friends",
  description: "What the people you follow are into — their favorites, their lists, and who's noticing you.",
  robots: { index: false },
};

/** Personal by nature: the shell is static, everything inside loads for the viewer. */
export default function FriendsPage() {
  return <FriendsView />;
}

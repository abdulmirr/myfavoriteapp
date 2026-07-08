import type { Metadata } from "next";
import FriendsPage from "@/components/FriendsPage";

// signed-in directory — nothing here for crawlers
export const metadata: Metadata = {
  title: "Friends",
  robots: { index: false },
};

export default function Page() {
  return <FriendsPage />;
}

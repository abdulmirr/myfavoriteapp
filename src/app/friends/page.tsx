import { redirect } from "next/navigation";

// Friends lives as a tab on Home now — old links land there
export default function FriendsPage() {
  redirect("/");
}

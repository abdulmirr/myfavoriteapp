import Home from "@/components/Home";

// The root is the home feed (For You / Following) for signed-in users.
// Auth lives client-side (localStorage), so this is a client shell; visitors
// without a session get the landing page.
export default function HomePage() {
  return <Home />;
}

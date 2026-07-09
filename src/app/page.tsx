import { Suspense } from "react";
import Home from "@/components/Home";

// The root is the home feed (For You / Following / Explore) for signed-in
// users. Auth lives client-side (localStorage), so this is a client shell;
// visitors without a session get the landing page. Home reads the active feed
// from the URL (?feed=…) via useSearchParams, so it rides in a Suspense island.
//
// force-dynamic matters: statically prerendered routes serve a cached tree on
// param-only client navigations, so useSearchParams consumers inside the page
// lag one click behind — tabs appeared stuck on the previous feed.
export const dynamic = "force-dynamic";

export default function HomePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-white" />}>
      <Home />
    </Suspense>
  );
}

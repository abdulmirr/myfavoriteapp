"use client";

import { useEffect, useState } from "react";
import type { Profile } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import AppShell from "./AppShell";
import FriendsView from "./Friends";

/**
 * The /friends route — FriendsView (a directory of the people you follow, plus
 * discovery) wrapped in the shell, reached from the rail. The same view also
 * renders as a tab inside Home; this page is its addressable home so the rail
 * link and a shared URL both land somewhere real.
 */
export default function FriendsPage() {
  const [viewer, setViewer] = useState<Profile | null>(null);
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const db = supabase();
    db.auth.getSession().then(({ data }) => setUserId(data.session?.user?.id ?? null));
    const { data: sub } = db.auth.onAuthStateChange((_e, session) => {
      setUserId(session?.user?.id ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) {
      setViewer(null);
      return;
    }
    supabase()
      .from("profiles")
      .select("id, user_id, username, display_name, bio, avatar_url, socials")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data }) => setViewer((data as Profile) ?? null));
  }, [userId]);

  return (
    <AppShell viewer={viewer} signedIn={!!userId}>
      <div
        className={`bg-white transition-opacity duration-700 ease-out ${
          mounted ? "opacity-100" : "opacity-0"
        }`}
      >
        <main className="mx-auto max-w-4xl px-5 pb-24 pt-6 sm:px-8">
          {viewer && <FriendsView viewer={viewer} />}
        </main>
      </div>
    </AppShell>
  );
}

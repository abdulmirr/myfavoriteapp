"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import type { Profile } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import AppShell from "./AppShell";

/**
 * The one place the nav shell lives — mounted in the root layout, above every
 * page. Because a layout doesn't remount as you navigate between routes, the
 * rail (and the viewer avatar it shows) stays perfectly still; only the page
 * content inside <main> swaps. This is what stops the "profile disappears and
 * reappears" flash the per-page shells caused.
 *
 * It loads the signed-in viewer once and exposes `setCollapsed` so a page can
 * ask the shell to slide its chrome away (Library's freeform view).
 */
/** what the top bar should say about the profile page it's sitting over */
export type ProfileBar = { handle: string; own: boolean } | null;

type ShellCtx = {
  viewer: Profile | null;
  signedIn: boolean;
  setCollapsed: (v: boolean) => void;
  /** profile pages tell the bar whose wall this is (own → shelf tabs, theirs → @handle) */
  setProfileBar: (v: ProfileBar) => void;
};

const Ctx = createContext<ShellCtx>({
  viewer: null,
  signedIn: false,
  setCollapsed: () => {},
  setProfileBar: () => {},
});

export const useShell = () => useContext(Ctx);

// signed-in-only surfaces stay chrome-free; the rest get the shell (signed-out
// visitors still get the minimal rail on /explore and profile pages)
const CHROMELESS = ["/welcome", "/signin", "/auth", "/privacy", "/terms"];

export default function ShellProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [userId, setUserId] = useState<string | null | undefined>(undefined);
  const [viewer, setViewer] = useState<Profile | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [profileBar, setProfileBar] = useState<ProfileBar>(null);

  // load the viewer once; this component persists across navigation, so the
  // avatar resolves a single time for the whole session
  useEffect(() => {
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

  const setCollapsedCb = useCallback((v: boolean) => setCollapsed(v), []);
  const setProfileBarCb = useCallback((v: ProfileBar) => setProfileBar(v), []);

  const signedIn = !!userId;
  const chromeless =
    CHROMELESS.some((p) => pathname === p || pathname.startsWith(p + "/")) ||
    // the signed-out landing (/ before auth) stays full-bleed
    (pathname === "/" && !signedIn);

  const ctx: ShellCtx = {
    viewer,
    signedIn,
    setCollapsed: setCollapsedCb,
    setProfileBar: setProfileBarCb,
  };

  if (chromeless) {
    return <Ctx.Provider value={ctx}>{children}</Ctx.Provider>;
  }

  // focused tasks keep only the way home — no add/bell/avatar noise
  const minimal = pathname.startsWith("/add");

  return (
    <Ctx.Provider value={ctx}>
      <AppShell
        viewer={viewer}
        signedIn={signedIn}
        collapsed={collapsed}
        minimal={minimal}
        profileBar={profileBar}
      >
        {children}
      </AppShell>
    </Ctx.Provider>
  );
}

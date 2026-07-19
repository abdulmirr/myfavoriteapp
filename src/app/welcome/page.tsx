"use client";

import Star from "@/components/Star";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import type { Profile } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { useSystemTheme } from "@/lib/use-system-theme";
import { PROFILE_COLS } from "@/lib/social";
import { EASE_SNAP } from "@/components/onboarding/bits";
import ClaimStep from "@/components/onboarding/ClaimStep";
import PicksStep from "@/components/onboarding/PicksStep";
import ImportStep from "@/components/onboarding/ImportStep";
import PeopleStep from "@/components/onboarding/PeopleStep";
import RevealStep from "@/components/onboarding/RevealStep";

/**
 * First-run onboarding — five beats, ~90 seconds, every one skippable:
 * claim your page → first favorites (thoughts nudged, optional) → import → people →
 * reveal. Home routes un-onboarded owners here; the reveal (or "skip for
 * now") stamps profile_private.onboarded_at so it never shows again.
 */

const BEATS = 5;

export default function WelcomePage() {
  useSystemTheme();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [beat, setBeat] = useState(1);
  const [skipState, setSkipState] = useState<"idle" | "busy" | "error">("idle");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const db = supabase();
      const { data } = await db.auth.getSession();
      const session = data.session;
      if (!session) {
        router.replace("/signin");
        return;
      }
      // the claim trigger runs on email confirm — brief retry covers the race
      let prof: Profile | null = null;
      for (let i = 0; i < 8 && !cancelled; i++) {
        const { data: p } = await db
          .from("profiles")
          .select(PROFILE_COLS)
          .eq("user_id", session.user.id)
          .maybeSingle();
        if (p) {
          prof = p as Profile;
          break;
        }
        await new Promise((r) => setTimeout(r, 600));
      }
      if (cancelled) return;
      if (!prof) {
        router.replace("/");
        return;
      }
      const { data: priv, error: privErr } = await db
        .from("profile_private")
        .select("onboarded_at")
        .eq("profile_id", prof.id)
        .maybeSingle();
      // on a failed read, assume onboarded — never trap someone in the flow
      if (privErr || priv?.onboarded_at) {
        router.replace("/");
        return;
      }
      setProfile(prof);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const skipForNow = async () => {
    if (!profile || skipState === "busy") return;
    setSkipState("busy");
    const { error } = await supabase()
      .from("profile_private")
      .upsert(
        { profile_id: profile.id, onboarded_at: new Date().toISOString() },
        { onConflict: "profile_id" }
      );
    if (error) {
      // navigating anyway would bounce straight back here (Home routes
      // un-onboarded owners to /welcome) — surface it instead
      setSkipState("error");
      return;
    }
    router.replace("/");
  };

  // session/profile still resolving: blank, like Home's unknown state
  if (!profile) {
    return <div className="min-h-screen bg-white" />;
  }

  return (
    <div className="flex h-screen flex-col bg-white">
      <header className="flex shrink-0 items-center justify-between px-5 pt-6 md:px-8 md:pt-8">
        {/* the mark, same corner as every page shell — no link mid-onboarding */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <Star className="h-6 w-6 text-zinc-900" />
        <div className="flex items-center gap-5">
          <span className="text-[10px] uppercase tracking-[0.08em] text-zinc-400">
            0{beat} / 0{BEATS}
          </span>
          {beat < BEATS && (
            <button
              onClick={skipForNow}
              disabled={skipState === "busy"}
              className="cursor-pointer text-[10px] uppercase tracking-[0.08em] text-zinc-400 transition-colors hover:text-zinc-900 disabled:cursor-wait"
            >
              {skipState === "error" ? "Couldn't save — try again" : "Skip for now"}
            </button>
          )}
        </div>
      </header>

      <main className="flex-1 overflow-y-auto overscroll-contain px-5 sm:px-8">
        <AnimatePresence mode="wait">
          <motion.div
            key={beat}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4, ease: EASE_SNAP }}
            className={
              beat === 2
                ? "flex min-h-full flex-col pt-10 sm:pt-14"
                : "flex min-h-full items-center justify-center py-16"
            }
          >
            {beat === 1 && (
              <ClaimStep
                profile={profile}
                onDone={(updated) => {
                  setProfile(updated);
                  setBeat(2);
                }}
              />
            )}
            {beat === 2 && <PicksStep profile={profile} onNext={() => setBeat(3)} />}
            {beat === 3 && <ImportStep profileId={profile.id} onNext={() => setBeat(4)} />}
            {beat === 4 && <PeopleStep viewer={profile} onNext={() => setBeat(5)} />}
            {beat === 5 && <RevealStep profile={profile} />}
          </motion.div>
        </AnimatePresence>
      </main>
    </div>
  );
}

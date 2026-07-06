"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Profile } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { playUi } from "@/lib/sfx";
import { RevealWords, Rise } from "./bits";

const SWAPS = 10;
const SWAP_MS = 200;

/**
 * Beat 5 — the reveal. Marks the profile onboarded, cycles the user's own
 * fresh artwork (IntroOverlay's clip-path + swap mechanics), then declares
 * the page live and walks them in.
 */
export default function RevealStep({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [images, setImages] = useState<string[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [cycled, setCycled] = useState(false);

  // stamp onboarded + gather their artwork; this beat doubles as the library
  // intro, so mark it seen to keep IntroOverlay from firing again on arrival
  useEffect(() => {
    const db = supabase();
    const stamp = () =>
      db.from("profile_private").upsert(
        { profile_id: profile.id, onboarded_at: new Date().toISOString() },
        { onConflict: "profile_id" }
      );
    // if the stamp fails silently, the next visit to / restarts onboarding
    // from beat 1 — retry once before giving up
    stamp().then(({ error }) => {
      if (error) setTimeout(() => stamp().then(() => {}), 1500);
    });
    try {
      sessionStorage.setItem("intro-seen", "1");
    } catch {}
    db.from("items")
      .select("image_url")
      .eq("profile_id", profile.id)
      .order("created_at", { ascending: false })
      .limit(12)
      .then(({ data }) => {
        setImages(((data ?? []).map((r) => r.image_url).filter(Boolean) as string[]) ?? []);
      });
  }, [profile.id]);

  // the artwork cycle — skipped entirely when there's nothing to show
  useEffect(() => {
    if (images === null) return;
    if (images.length < 3) {
      setCycled(true);
      return;
    }
    // warm the covers before flashing them at 200ms/frame
    for (const src of images.slice(0, SWAPS)) {
      const img = new Image();
      img.src = src;
    }
    requestAnimationFrame(() => requestAnimationFrame(() => setRevealed(true)));
    let i = 0;
    const cycle = setInterval(() => {
      i += 1;
      if (i >= SWAPS) {
        clearInterval(cycle);
        setCycled(true);
        return;
      }
      setIdx(i % images.length);
    }, SWAP_MS);
    return () => clearInterval(cycle);
  }, [images]);

  // one quiet rising chord as "Your page is live." lands — the flow's only
  // celebratory cue, so the moment stays special
  useEffect(() => {
    if (cycled) playUi("reveal");
  }, [cycled]);

  return (
    <div className="mx-auto flex w-full max-w-sm flex-col items-center text-center">
      {images !== null && images.length >= 3 && (
        <div
          className="mb-10 flex items-center justify-center"
          style={{
            width: "min(46vw, 200px)",
            height: "min(46vw, 200px)",
            clipPath: revealed ? "inset(0 0 0 0)" : "inset(100% 0 0 0)",
            transition: "clip-path 280ms cubic-bezier(0.2, 0, 0, 1)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[cycled ? 0 : idx]}
            alt=""
            className="max-h-full max-w-full object-contain"
          />
        </div>
      )}

      {cycled && (
        <>
          <h1 className="text-2xl font-semibold leading-snug tracking-tight text-zinc-900 sm:text-3xl">
            <RevealWords text="Your page is live." delay={0.05} />
          </h1>
          <Rise delay={0.3}>
            <p className="mt-3 text-xs text-zinc-400">myfavoriteapp.com/{profile.username}</p>
          </Rise>
          <Rise delay={0.45}>
            <p className="mt-6 text-xs leading-relaxed text-zinc-400">
              Add more anytime with the Favorite button in your sidebar.
              <br />
              Your feed and weekly picks live on Home.
            </p>
          </Rise>
          <Rise delay={0.6}>
            <button
              onClick={() => router.replace(`/${profile.username}`)}
              className="mt-8 h-9 cursor-pointer bg-zinc-900 px-4 text-xs font-medium text-white transition-colors hover:bg-zinc-700"
            >
              Enter your library →
            </button>
          </Rise>
        </>
      )}
    </div>
  );
}

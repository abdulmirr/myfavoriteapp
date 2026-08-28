"use client";

import Star from "@/components/Star";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { PROFILE_COLS } from "@/lib/social";
import type { Profile } from "@/lib/types";

/**
 * Your monthly recap — the story-card ritual. Twelve share moments a year:
 * each month with 3+ favorites renders a card (via /api/recap) built from
 * real numbers only. December's card closes out the year.
 */

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const monthLabel = (m: string) => {
  const [y, mo] = m.split("-");
  return `${MONTHS[Number(mo) - 1]} ${y}`;
};

export default function RecapPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  // months that have any saves, newest first, with counts
  const [months, setMonths] = useState<{ key: string; count: number }[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [imgState, setImgState] = useState<"loading" | "ready" | "failed">("loading");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const db = supabase();
    db.auth.getSession().then(async ({ data }) => {
      const session = data.session;
      if (!session) {
        router.replace("/signin?next=/recap");
        return;
      }
      const { data: p } = await db
        .from("profiles")
        .select(PROFILE_COLS)
        .eq("user_id", session.user.id)
        .maybeSingle<Profile>();
      if (!p) {
        setLoading(false);
        return;
      }
      setProfile(p);
      const { data: rows } = await db
        .from("items")
        .select("created_at")
        .eq("profile_id", p.id);
      const byMonth = new Map<string, number>();
      for (const r of rows ?? []) {
        const key = (r.created_at as string).slice(0, 7);
        byMonth.set(key, (byMonth.get(key) ?? 0) + 1);
      }
      const list = [...byMonth.entries()]
        .map(([key, count]) => ({ key, count }))
        .sort((a, b) => (a.key < b.key ? 1 : -1));
      setMonths(list);
      // default to the newest month that has a card; else the newest month
      const first = list.find((m) => m.count >= 3) ?? list[0];
      if (first) setSelected(first.key);
      setLoading(false);
    });
  }, [router]);

  const current = useMemo(
    () => months.find((m) => m.key === selected),
    [months, selected]
  );
  const unlocked = (current?.count ?? 0) >= 3;
  const cardUrl =
    profile && selected ? `/api/recap?u=${profile.username}&m=${selected}` : "";

  // switching months restarts the render state — done in the click handler
  // (not an effect) per the repo's no-sync-setState-in-effects rule
  const pickMonth = (key: string) => {
    if (key === selected) return;
    setSelected(key);
    setImgState("loading");
  };

  const copyLink = async () => {
    if (!cardUrl) return;
    await navigator.clipboard.writeText(`${window.location.origin}${cardUrl}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <nav className="flex items-center px-5 pt-6 md:px-8 md:pt-8">
        <Link href="/" aria-label="Home" className="w-fit transition-opacity hover:opacity-70">
          <Star className="h-6 w-6 text-[#f7a71e]" />
        </Link>
      </nav>

      <main className="flex flex-1 flex-col items-center px-5 py-14">
        {loading ? (
          <p className="pt-12 text-xs text-zinc-400">Loading…</p>
        ) : !profile ? (
          <p className="pt-12 text-xs text-zinc-400">No profile found for this account.</p>
        ) : !months.length ? (
          <div className="flex flex-col items-center gap-2 pt-12 text-center">
            <p className="text-xs text-zinc-400">
              Recaps are drawn from what you favorite — nothing saved yet.
            </p>
            <Link
              href={`/${profile.username}`}
              className="text-xs text-zinc-900 underline underline-offset-4 hover:text-zinc-500"
            >
              Start your library →
            </Link>
          </div>
        ) : (
          <>
            <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-400">Recap</p>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
              {selected ? monthLabel(selected) : ""}
            </h1>

            {/* month picker — newest first, quiet text buttons */}
            <div className="mt-3 flex max-w-full flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4">
              {months.slice(0, 12).map((m) => (
                <button
                  key={m.key}
                  onClick={() => pickMonth(m.key)}
                  className={`cursor-pointer text-xs transition-colors ${
                    m.key === selected
                      ? "text-zinc-900"
                      : "text-zinc-400 hover:text-zinc-900"
                  }`}
                >
                  {monthLabel(m.key)}
                </button>
              ))}
            </div>

            {unlocked ? (
              <>
                <div className="mt-10 w-full max-w-[320px] sm:max-w-[360px]">
                  <div className="relative aspect-[9/16] w-full bg-zinc-50 shadow-[0_12px_48px_rgba(0,0,0,0.14)]">
                    {imgState === "loading" && (
                      <p className="absolute inset-0 flex items-center justify-center text-xs text-zinc-400 [animation:smart-search-wave_1.6s_ease-in-out_infinite]">
                        Rendering your month…
                      </p>
                    )}
                    {imgState === "failed" ? (
                      <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-xs text-zinc-400">
                        Couldn’t render this month’s card — try again in a minute.
                      </p>
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={cardUrl}
                        alt={`Your ${monthLabel(selected)} on Favorite`}
                        className={`h-full w-full object-cover transition-opacity duration-300 ${
                          imgState === "ready" ? "opacity-100" : "opacity-0"
                        }`}
                        onLoad={() => setImgState("ready")}
                        onError={() => setImgState("failed")}
                      />
                    )}
                  </div>
                </div>

                <div className="mt-8 flex items-center gap-6 text-xs">
                  <a
                    href={cardUrl}
                    download={`favorites-${profile.username}-${selected}.png`}
                    className="text-zinc-900 underline underline-offset-4 transition-colors hover:text-zinc-500"
                  >
                    Download ↓
                  </a>
                  <button
                    onClick={copyLink}
                    className="cursor-pointer text-zinc-400 transition-colors hover:text-zinc-900"
                  >
                    {copied ? "Copied ✓" : "Copy link"}
                  </button>
                  <Link
                    href={`/${profile.username}`}
                    className="text-zinc-400 transition-colors hover:text-zinc-900"
                  >
                    Your library →
                  </Link>
                </div>
              </>
            ) : (
              <p className="mt-12 max-w-xs text-center text-xs leading-relaxed text-zinc-400">
                {current?.count ?? 0} favorite{(current?.count ?? 0) === 1 ? "" : "s"} in{" "}
                {monthLabel(selected)} — the card unlocks at 3, when there’s a month worth
                showing.
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
}

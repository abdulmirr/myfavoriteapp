"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import type { CommunityPick } from "@/lib/data";
import type { DailyPick, Work } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { useOwned } from "@/lib/use-owned";
import { useViewer, viewer } from "@/lib/viewer";
import { titleKey } from "@/lib/work";
import { TypedLine, TypedTitle } from "../Typewriter";
import NewsletterCTA from "./NewsletterCTA";
import PickCard, { PickSkeleton } from "./PickCard";
import { toast } from "../ui/Toast";
import { cn, inlineLink, pageSubtitle, pageTitle } from "../ui/styles";

type AiState =
  | { state: "idle" }
  | { state: "loading"; picks: DailyPick[] }
  | { state: "ready"; picks: DailyPick[] }
  | { state: "gated" }
  | { state: "error" };

const TOTAL = 5;
const noop = () => () => {};

function localDay(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const cacheKey = (pid: string) => `fav2:picks:${pid}:${localDay()}`;

function pickWork(p: DailyPick): Work {
  return {
    media_type: p.media_type,
    title: p.title,
    creator: p.creator,
    image_url: p.image_url,
    view_url: p.view_url,
    year: p.year || null,
    canonical_id: p.canonical_id,
  };
}

function communityWork(c: CommunityPick): Work & { item_id: string } {
  const it = c.item;
  return {
    media_type: it.media_type,
    title: it.title,
    creator: it.creator,
    image_url: it.image_url,
    view_url: it.view_url,
    year: it.metadata?.year != null ? String(it.metadata.year) : null,
    canonical_id: it.canonical_id,
    metadata: it.metadata,
    item_id: it.id,
    // favoriting a community pick credits the person it came from
    source_item_id: it.id,
    source_profile_id: it.profile_id,
  };
}

function CommunityCard({ c, priority }: { c: CommunityPick; priority?: boolean }) {
  return (
    <PickCard
      work={communityWork(c)}
      tab={
        <>
          “{c.item.description.trim()}”{" "}
          <span className="font-normal text-gray-500 dark:text-neutral-400">— @{c.by.username}</span>
        </>
      }
      by={c.by}
      count={c.count}
      priority={priority}
    />
  );
}

/**
 * Home — antislop's daily page. Visitors get five favorites from the
 * community (real people's thoughts as the notes); members get one AI pick
 * per category they've unlocked, topped up to five from the community.
 */
export default function HomeView({ community }: { community: CommunityPick[] }) {
  const v = useViewer();
  const router = useRouter();
  const pid = v.profile?.id ?? null;
  // a member who never finished onboarding starts there (known only once the
  // fresh profile lands — a cached snapshot never redirects)
  const setup = v.status === "signed-in" && !v.stale && !!v.profile && !v.onboarded;
  const [ai, setAi] = useState<AiState>({ state: "idle" });

  // today's set for this member: painted from the local cache on the first
  // render that knows who they are, then confirmed by the server below
  const wantPicks = v.status === "signed-in" && !!pid && v.onboarded;
  const [aiFor, setAiFor] = useState<string | null>(null);
  if (wantPicks && pid && aiFor !== pid) {
    setAiFor(pid);
    let cached: DailyPick[] | null = null;
    try {
      const raw = localStorage.getItem(cacheKey(pid));
      cached = raw ? (JSON.parse(raw) as DailyPick[]) : null;
    } catch {}
    setAi(cached ? { state: "ready", picks: cached } : { state: "loading", picks: [] });
  }

  // what's already theirs when Home opens is never offered back as a pick
  const isOwned = useOwned();

  useEffect(() => {
    if (setup) router.replace("/welcome");
  }, [setup, router]);

  useEffect(() => {
    if (!wantPicks || !pid) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fail = () => live && setAi((s) => (s.state === "ready" ? s : { state: "error" }));
    const run = async (attempt: number) => {
      const { data } = await supabase().auth.getSession();
      const token = data.session?.access_token;
      if (!token || !live) return;
      try {
        const res = await fetch("/api/picks", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "x-tz-offset": String(new Date().getTimezoneOffset()) },
        });
        if (!live) return;
        if (res.status === 202) {
          // someone else (another tab) is choosing today's set — check back
          if (attempt < 4) timer = setTimeout(() => void run(attempt + 1), 5000);
          else fail();
          return;
        }
        const json = (await res.json()) as { picks?: DailyPick[]; gated?: boolean };
        if (!res.ok) throw new Error(String(res.status));
        if (!live) return;
        if (json.gated) {
          setAi({ state: "gated" });
          try {
            localStorage.removeItem(cacheKey(pid));
          } catch {}
          return;
        }
        const picks = json.picks ?? [];
        setAi({ state: "ready", picks });
        try {
          localStorage.setItem(cacheKey(pid), JSON.stringify(picks));
        } catch {}
      } catch {
        fail();
      }
    };
    void run(0);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [wantPicks, pid]);

  const pass = (p: DailyPick) => {
    const me = viewer().profile;
    if (!me) return;
    setAi((s) => {
      if (s.state !== "ready") return s;
      const picks = s.picks.filter((x) => x !== p);
      try {
        localStorage.setItem(cacheKey(me.id), JSON.stringify(picks));
      } catch {}
      return { state: "ready", picks };
    });
    toast("Got it — we won't suggest that again.");
    supabase()
      .from("rec_dismissals")
      .upsert(
        { profile_id: me.id, media_type: p.media_type, title: p.title, creator: p.creator },
        { onConflict: "profile_id,media_type,title", ignoreDuplicates: true }
      )
      .then(({ error }) => error && console.error("pass not saved:", error.message));
  };

  // greeting — typed once the viewer is known (antislop types after auth too).
  // The clock is read on the client only: a prerendered page must never bake
  // in the build day's weekday.
  const weekday = useSyncExternalStore(
    noop,
    () => new Date().toLocaleDateString("en-US", { weekday: "long" }),
    () => ""
  );
  const dow = useSyncExternalStore(noop, () => new Date().getDay(), () => -1);
  const first =
    v.profile?.display_name?.trim().split(/\s+/)[0] || (v.status === "signed-in" ? v.profile?.username : "") || "friend";
  const title = `Happy ${weekday}, ${first}!`;
  const member = v.status === "signed-in";
  const subtitle = !member
    ? "Here are today's favorites from the community..."
    : dow === 6
      ? "Here's something for your weekend..."
      : dow === 0
        ? "Here are today's picks — take your time..."
        : "Here are today's picks, chosen for you...";
  const [titleDone, setTitleDone] = useState(false);
  const ready = v.status !== "unknown" && weekday !== "";

  // the five cards
  const aiPicks = (ai.state === "ready" || ai.state === "loading" ? ai.picks : []).filter((p) => !isOwned(pickWork(p)));
  const taken = new Set(aiPicks.map((p) => titleKey(p.media_type, p.title)));
  // the community's ranked backups cover whatever's already on their wall
  const fill = community
    .filter((c) => !taken.has(titleKey(c.item.media_type, c.item.title)) && !isOwned(communityWork(c)))
    .slice(0, Math.max(0, TOTAL - aiPicks.length));

  const memberList =
    ai.state === "loading" && !ai.picks.length ? (
      <>
        <p className="-mt-2 text-center text-sm text-gray-500 dark:text-neutral-400">
          Choosing today&apos;s picks from your favorites — the first set takes a minute…
        </p>
        <PickSkeleton />
        <PickSkeleton />
      </>
    ) : (
      <>
        {ai.state === "gated" && (
          <p className="-mt-2 text-center text-sm text-gray-500 dark:text-neutral-400">
            Favorite 3 albums, books or films and tomorrow&apos;s picks are chosen from your taste.
          </p>
        )}
        {aiPicks.map((p, i) => (
          <PickCard
            key={`ai:${p.media_type}:${p.title}`}
            work={pickWork(p)}
            tab={p.hook}
            reason={p.reason}
            onPass={() => pass(p)}
            priority={i < 2}
          />
        ))}
        {fill.map((c) => (
          <CommunityCard key={`c:${c.item.id}`} c={c} />
        ))}
      </>
    );

  const visitorList = community.slice(0, TOTAL).map((c, i) => <CommunityCard key={c.item.id} c={c} priority={i < 2} />);
  const count = member ? aiPicks.length + fill.length : Math.min(TOTAL, community.length);
  const numberWord = ["No", "One", "Two", "Three", "Four", "Five"][count] ?? String(count);

  return (
    <div className="min-h-screen px-4 pt-14 pb-12 sm:px-6 sm:pt-20 lg:px-8">
      <div className="mx-auto max-w-xl">
        <div className="mb-16 text-center sm:mb-20">
          <TypedTitle text={title} start={ready} className={pageTitle} onDone={() => setTitleDone(true)} />
          <TypedLine text={subtitle} start={titleDone} className={cn("mt-3", pageSubtitle)} />
        </div>

        <div className="flex flex-col gap-5 sm:gap-6">
          {v.status === "unknown" ? (
            <>
              <div className="signed-out-only flex flex-col gap-5 sm:gap-6">{visitorList}</div>
              <div className="signed-in-only flex flex-col gap-5 sm:gap-6">
                <PickSkeleton />
                <PickSkeleton />
              </div>
            </>
          ) : member ? (
            memberList
          ) : (
            visitorList
          )}
        </div>

        <p className="mt-16 text-center text-base leading-relaxed tracking-tight text-gray-500 sm:mt-20 sm:text-lg dark:text-neutral-400">
          {member ? (
            <>
              That&apos;s it. {numberWord} picks, chosen for you.
              <br />
              Here today, gone tomorrow.
            </>
          ) : (
            <>
              That&apos;s it. {numberWord} favorites from people with taste.
              <br />
              Here today, gone tomorrow.
            </>
          )}
        </p>
        <NewsletterCTA />
        {v.status === "signed-out" && (
          <p className="mt-8 text-center text-sm text-gray-500 dark:text-neutral-400">
            Want picks chosen from your own taste?{" "}
            <Link href="/signin" className={inlineLink}>
              Make your page
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}

"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import type { MediaType, Profile, SearchResult, Work } from "@/lib/types";
import { authHeaders, supabase } from "@/lib/supabase";
import { useLiveSearch } from "@/lib/use-live-search";
import { STARTER_SECTIONS, type StarterPick } from "@/lib/starter-picks";
import { favorite, isFavorited, unfavorite, useViewer, viewer } from "@/lib/viewer";
import { metaLine, typeLabel, workKeys } from "@/lib/work";
import { thumbCover } from "@/lib/img";
import { playUi } from "@/lib/sfx";
import Framed from "../profile/Framed";
import Star from "../ui/Star";
import { toast } from "../ui/Toast";
import { card, cn, field, primaryButton, quietButton } from "../ui/styles";
import BeatHeader from "./BeatHeader";

const ThoughtDialog = dynamic(() => import("../ThoughtDialog"));

/** the search type that can find a canonical match for each medium (mirrors the import engine) */
const SEARCH_TYPE: Partial<Record<MediaType, string>> = {
  book: "book",
  movie: "movie",
  tv: "movie",
  music: "music",
  podcast: "podcast",
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

type TrayItem = { id: string | null; keys: string[]; title: string; art: string | null };

const wallWork = (p: StarterPick): Work => ({
  media_type: p.media_type,
  title: p.title,
  creator: p.creator,
  image_url: p.src,
  view_url: p.view_url ?? null,
  canonical_id: null,
});

const searchWork = (r: SearchResult): Work => ({
  media_type: r.media_type,
  title: r.title,
  creator: r.creator,
  image_url: r.image_url,
  view_url: r.view_url,
  year: r.year || null,
  canonical_id: r.canonical_id,
});

/**
 * Beat 2 — first favorites. A wall of well-known covers in their frames,
 * plus search for anything else. One tap favorites (tap again to take it
 * back); the tray at the bottom assembles the page as it grows and offers
 * a thought on the latest pick — nudged, never required.
 */
export default function PicksStep({ profile, onNext }: { profile: Profile; onNext: () => void }) {
  const v = useViewer();
  const [tray, setTray] = useState<TrayItem[]>([]);
  // the newest pick this visit — the tray offers a thought on it
  const [last, setLast] = useState<{ id: string; title: string; keys: string[] } | null>(null);
  const [thoughtFor, setThoughtFor] = useState<{ id: string; title: string } | null>(null);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const busy = useRef(new Set<string>());

  // what's already on the wall (a reload, an earlier visit) starts the tray
  useEffect(() => {
    let stale = false;
    supabase()
      .from("items")
      .select("id, media_type, title, canonical_id, image_url")
      .eq("profile_id", profile.id)
      .order("sort_order", { ascending: true })
      .limit(60)
      .then(({ data }) => {
        if (stale || !data) return;
        type Row = Pick<Work, "media_type" | "title" | "canonical_id" | "image_url"> & { id: string };
        const seeded: TrayItem[] = (data as Row[]).map((r) => ({
          id: r.id,
          keys: workKeys(r),
          title: r.title,
          art: r.image_url,
        }));
        setTray((cur) => [...seeded.filter((s) => !cur.some((c) => c.id === s.id)), ...cur]);
      });
    return () => {
      stale = true;
    };
  }, [profile.id]);

  const { results, searching } = useLiveSearch<SearchResult[]>(
    query,
    async (q, signal) => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&type=all`, {
        headers: await authHeaders(),
        signal,
      });
      if (!res.ok) throw new Error(String(res.status));
      return (((await res.json()) as { results?: SearchResult[] }).results ?? []) as SearchResult[];
    },
    { minLength: 2, scope: "welcome" }
  );

  /** wall picks carry local art — find the real record (id + hosted cover) after the fact */
  const enrich = async (id: string, work: Work) => {
    try {
      const res = await fetch(
        `/api/search?type=${SEARCH_TYPE[work.media_type]}&q=${encodeURIComponent(`${work.title} ${work.creator}`.trim())}`,
        { headers: await authHeaders() }
      );
      if (!res.ok) return;
      const hits = ((await res.json()) as { results?: SearchResult[] }).results ?? [];
      const t = norm(work.title);
      const hit = hits.find((h) => norm(h.title) === t) ?? hits.find((h) => norm(h.title).startsWith(t));
      if (!hit) return;
      const { error } = await supabase()
        .from("items")
        .update({
          image_url: hit.image_url ?? work.image_url,
          view_url: hit.view_url ?? work.view_url,
          canonical_id: hit.canonical_id ?? null,
          ...(hit.year ? { metadata: { year: hit.year } } : {}),
        })
        .eq("id", id);
      if (!error && hit.image_url) {
        setTray((cur) => cur.map((x) => (x.id === id ? { ...x, art: hit.image_url } : x)));
      }
    } catch {
      /* the local cover is a fine fallback */
    }
  };

  const toggle = async (work: Work) => {
    const keys = workKeys(work);
    const k = keys[0];
    if (busy.current.has(k)) return;
    busy.current.add(k);
    const hit = (x: TrayItem) => x.keys.some((key) => keys.includes(key));
    try {
      if (isFavorited(viewer(), work)) {
        await unfavorite(work);
        setTray((cur) => cur.filter((x) => !hit(x)));
        setLast((l) => (l && l.keys.some((key) => keys.includes(key)) ? null : l));
      } else {
        playUi("confirm");
        setTray((cur) => [...cur, { id: null, keys, title: work.title, art: work.image_url }]);
        try {
          const id = await favorite(work);
          setTray((cur) => cur.map((x) => (x.id === null && hit(x) ? { ...x, id } : x)));
          setLast({ id, title: work.title, keys });
          if (!work.canonical_id && SEARCH_TYPE[work.media_type]) void enrich(id, work);
        } catch (e) {
          setTray((cur) => cur.filter((x) => !(x.id === null && hit(x))));
          throw e;
        }
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't save — try again.");
    } finally {
      busy.current.delete(k);
    }
  };

  const count = tray.length;
  const headline =
    count === 0
      ? "Tap a cover, or search for anything"
      : `${count} favorite${count === 1 ? "" : "s"}`;
  const hint =
    count === 0 ? "Four is a good start." : count < 4 ? "A page starts at four." : "This is starting to look like you.";
  const showResults = open && query.trim().length >= 2;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col">
      <BeatHeader
        title="What do you love?"
        sub="Tap the things that made you. Add a line on why when you can — it's what your friends will read."
      />

      <div className="relative mx-auto mt-6 w-full max-w-xl">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-500 dark:text-neutral-400" />
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => e.key === "Escape" && setOpen(false)}
          placeholder="Search albums, books, films, shows, podcasts…"
          aria-label="Search"
          className={cn(field, "pl-9")}
        />
        {showResults && (
          <div className={cn(card, "pop-in absolute inset-x-0 top-full z-40 mt-2 max-h-80 overflow-y-auto p-1.5")}>
            {results === null || (searching && !results.length) ? (
              <p className="px-3 py-2.5 text-sm text-gray-500 dark:text-neutral-400">Searching…</p>
            ) : !results.length ? (
              <p className="px-3 py-2.5 text-sm text-gray-500 dark:text-neutral-400">Nothing found — try another spelling.</p>
            ) : (
              <ul>
                {results.map((r, i) => {
                  const w = searchWork(r);
                  const on = isFavorited(v, w);
                  return (
                    <li key={`${r.media_type}-${r.source_id}-${i}`}>
                      <button
                        type="button"
                        // keep focus in the field so the list stays open between picks
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => void toggle(w)}
                        aria-pressed={on}
                        className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-gray-100 dark:hover:bg-neutral-700/60"
                      >
                        <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gray-100 dark:bg-neutral-700">
                          {r.image_url && (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={r.thumb_url ?? thumbCover(r.image_url, 100)}
                              alt=""
                              loading="lazy"
                              className="max-h-full max-w-full object-contain"
                            />
                          )}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-gray-900 dark:text-neutral-100">
                            {r.title}
                          </span>
                          <span className="block truncate text-xs text-gray-500 dark:text-neutral-400">
                            {[typeLabel(w), metaLine(w)].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                        {on ? (
                          <Star className="star-pop size-5 shrink-0 text-star" />
                        ) : (
                          <span className="shrink-0 text-xs font-semibold text-gray-500 dark:text-neutral-400">Add</span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-4">
        {STARTER_SECTIONS.map((section, si) => (
          <section key={section.label} className={cn(card, "p-4 sm:p-6")}>
            <h2 className="text-sm font-semibold tracking-tight text-gray-900 dark:text-neutral-100">{section.label}</h2>
            <div className="mt-3 grid grid-cols-4 gap-x-3 gap-y-4 sm:mt-4 sm:grid-cols-6 sm:gap-x-5">
              {section.picks.map((p, pi) => {
                const w = wallWork(p);
                const on = isFavorited(v, w);
                return (
                  <button
                    key={p.src}
                    type="button"
                    onClick={() => void toggle(w)}
                    aria-pressed={on}
                    aria-label={on ? `${p.title} — on your page` : `Favorite ${p.title}`}
                    title={`${p.title} — ${p.creator}`}
                    className="group relative cursor-pointer rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:focus-visible:ring-neutral-400"
                  >
                    <span className={cn("block transition-opacity duration-200", on && "opacity-45")}>
                      <Framed
                        item={{ id: p.src, media_type: p.media_type, title: p.title, image_url: p.src, view_url: p.view_url ?? null }}
                        eager={si === 0 && pi < 8}
                        sizes="(max-width: 639px) 22vw, 120px"
                      />
                    </span>
                    {on && (
                      <span className="star-pop absolute -top-1 -right-1 flex size-7 items-center justify-center rounded-full bg-white shadow-[0_2px_8px_rgba(0,0,0,0.15)] dark:bg-neutral-900">
                        <Star className="size-4.5 text-star" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* the page assembling — pinned to the bottom while the wall scrolls */}
      <div className="sticky bottom-3 z-30 mt-6 sm:bottom-5">
        <div className={cn(card, "flex items-center gap-3 p-2.5 pl-3 shadow-[0_8px_30px_rgba(0,0,0,0.12)]")}>
          {count > 0 && (
            <span className="flex shrink-0 -space-x-3">
              {tray.slice(-4).map((t) => (
                <span
                  key={t.id ?? t.keys[0]}
                  className="pop-in flex size-10 items-center justify-center overflow-hidden rounded-md bg-gray-200 ring-2 ring-white dark:bg-neutral-700 dark:ring-neutral-800"
                >
                  {t.art ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbCover(t.art, 100)} alt="" className="size-full object-cover" />
                  ) : (
                    <span className="text-xs font-semibold text-gray-500">{t.title.slice(0, 1)}</span>
                  )}
                </span>
              ))}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-gray-900 dark:text-neutral-100">{headline}</p>
            {last ? (
              <button
                type="button"
                onClick={() => setThoughtFor(last)}
                className="block max-w-full cursor-pointer truncate text-left text-xs text-gray-500 underline decoration-gray-300 underline-offset-2 hover:text-gray-900 dark:text-neutral-400 dark:decoration-neutral-600 dark:hover:text-neutral-100"
              >
                Why “{last.title}”? Add a thought
              </button>
            ) : (
              <p className="truncate text-xs text-gray-500 dark:text-neutral-400">{hint}</p>
            )}
          </div>
          {count === 0 ? (
            <button type="button" onClick={onNext} className={cn(quietButton, "h-9 shrink-0")}>
              Skip
            </button>
          ) : (
            <button type="button" onClick={onNext} className={cn(primaryButton, "h-9 shrink-0")}>
              Continue
            </button>
          )}
        </div>
      </div>

      {thoughtFor && (
        <ThoughtDialog
          itemId={thoughtFor.id}
          title={thoughtFor.title}
          open
          onOpenChange={(o) => !o && setThoughtFor(null)}
          onSaved={() => {
            setThoughtFor(null);
            setLast(null);
          }}
        />
      )}
    </div>
  );
}

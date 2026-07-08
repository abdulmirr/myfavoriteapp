"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { Item, Profile, SearchResult } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { playSfx, preloadSfx } from "@/lib/sfx";
import AddFavorite, { resultKey } from "@/components/AddFavorite";

/**
 * /add — the favorite palette as its own minimal page: type picker up top,
 * search or paste below, one save and you're back in your library. The panel
 * renders immediately; the viewer's profile and next sort slot resolve in the
 * background while they type.
 *
 * Bulk add: toggle top-right, pick as many results as you like (the count
 * follows along), then "Favorite all" opens a review pass for per-item
 * thoughts before everything saves at once.
 */
export default function AddPage() {
  const router = useRouter();
  const colRef = useRef<HTMLDivElement>(null);
  const [viewer, setViewer] = useState<Profile | null>(null);
  const [nextSort, setNextSort] = useState(1);

  const [bulk, setBulk] = useState(false);
  const [basket, setBasket] = useState<SearchResult[]>([]);
  const [reviewOpen, setReviewOpen] = useState(false);

  useEffect(() => preloadSfx(), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const db = supabase();
      const { data } = await db.auth.getSession();
      const userId = data.session?.user?.id;
      if (!userId) {
        router.replace("/signin");
        return;
      }
      // the claim trigger runs on email confirm — brief retry covers the race
      // (same shape as Home and /welcome); without it the page renders with a
      // permanently disabled Favorite button and no explanation
      let prof: Profile | null = null;
      for (let i = 0; i < 5 && !cancelled; i++) {
        const { data: p } = await db
          .from("profiles")
          .select("id, user_id, username, display_name, bio, avatar_url, socials")
          .eq("user_id", userId)
          .maybeSingle();
        if (p) {
          prof = p as Profile;
          break;
        }
        await new Promise((r) => setTimeout(r, 700));
      }
      if (cancelled) return;
      if (!prof) {
        router.replace("/");
        return;
      }
      const profile = prof;
      setViewer(profile);
      router.prefetch(`/${profile.username}`); // warm the way back home
      const { data: top } = await db
        .from("items")
        .select("sort_order")
        .eq("profile_id", profile.id)
        .order("sort_order", { ascending: false })
        .limit(1);
      if (!cancelled) setNextSort((top?.[0]?.sort_order ?? 0) + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  // "return" always means the library — deterministic and prefetched-fast,
  // regardless of how the page was reached
  const leave = useCallback(() => {
    router.push(viewer ? `/${viewer.username}` : "/");
  }, [router, viewer]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (reviewOpen) setReviewOpen(false);
      else leave();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [leave, reviewOpen]);

  const done = (item: Item) => {
    playSfx(item.media_type);
    router.push(viewer ? `/${viewer.username}` : "/");
  };

  const toggleBasket = useCallback((r: SearchResult) => {
    setBasket((prev) => {
      const key = resultKey(r);
      return prev.some((b) => resultKey(b) === key)
        ? prev.filter((b) => resultKey(b) !== key)
        : [...prev, r];
    });
  }, []);

  const selectedKeys = new Set(basket.map(resultKey));

  return (
    <div
      className="min-h-full bg-white"
      onClick={(e) => {
        if (reviewOpen) return; // the review pass has its own scrim
        // anywhere outside the content column (palette + header controls)
        // returns to your library
        if (colRef.current && !colRef.current.contains(e.target as Node)) leave();
      }}
    >
      {/* warm connections to the cover CDNs before the first search lands */}
      <link rel="preconnect" href="https://image.tmdb.org" />
      <link rel="preconnect" href="https://is1-ssl.mzstatic.com" />
      <link rel="preconnect" href="https://covers.openlibrary.org" />
      <link rel="dns-prefetch" href="https://is2-ssl.mzstatic.com" />
      <link rel="dns-prefetch" href="https://is3-ssl.mzstatic.com" />
      <link rel="dns-prefetch" href="https://is4-ssl.mzstatic.com" />
      <link rel="dns-prefetch" href="https://is5-ssl.mzstatic.com" />
      <div
        ref={colRef}
        className="mx-auto flex max-w-xl flex-col px-4 pt-[14vh] pb-16"
        style={{ zoom: 1.1 }}
      >
        <div className="mb-3 flex items-baseline justify-between">
          <h1 className="text-[10px] uppercase tracking-[0.08em] text-zinc-400">
            Add a favorite
          </h1>
          {!bulk ? (
            <button
              onClick={() => setBulk(true)}
              className="cursor-pointer text-[10px] uppercase tracking-[0.08em] text-zinc-400 transition-colors hover:text-zinc-900"
            >
              Bulk add
            </button>
          ) : (
            <div className="flex items-baseline gap-4">
              <span className="text-[10px] uppercase tracking-[0.08em] text-zinc-400">
                {basket.length} selected
              </span>
              <button
                onClick={() => basket.length && setReviewOpen(true)}
                disabled={!basket.length}
                className="cursor-pointer text-[10px] uppercase tracking-[0.08em] text-zinc-900 transition-colors disabled:cursor-default disabled:text-zinc-300"
              >
                Favorite all
              </button>
              <button
                onClick={() => {
                  setBulk(false);
                  setBasket([]);
                }}
                className="cursor-pointer text-[10px] uppercase tracking-[0.08em] text-zinc-400 transition-colors hover:text-zinc-900"
              >
                Cancel
              </button>
            </div>
          )}
        </div>
        <AddFavorite
          profileId={viewer?.id ?? null}
          nextSortOrder={nextSort}
          onAdded={done}
          bulkSelected={bulk ? selectedKeys : undefined}
          onBulkToggle={bulk ? toggleBasket : undefined}
        />
      </div>

      <div className="pointer-events-none fixed inset-x-0 bottom-6 text-center text-xs text-zinc-400">
        Click outside to return
      </div>

      {reviewOpen && viewer && (
        <BulkReview
          basket={basket}
          profileId={viewer.id}
          nextSortOrder={nextSort}
          onRemove={toggleBasket}
          onClose={() => setReviewOpen(false)}
          onSaved={(first) => {
            playSfx(first.media_type);
            router.push(`/${viewer.username}`);
          }}
        />
      )}
    </div>
  );
}

/** The bulk review pass — one thought per pick, then everything saves at once. */
function BulkReview({
  basket,
  profileId,
  nextSortOrder,
  onRemove,
  onClose,
  onSaved,
}: {
  basket: SearchResult[];
  profileId: string;
  nextSortOrder: number;
  onRemove: (r: SearchResult) => void;
  onClose: () => void;
  onSaved: (first: SearchResult) => void;
}) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // removing the last pick leaves nothing to review
  useEffect(() => {
    if (!basket.length) onClose();
  }, [basket.length, onClose]);

  const saveAll = async () => {
    if (saving || !basket.length) return;
    setSaving(true);
    setError("");
    const rows = basket.map((r, i) => ({
      profile_id: profileId,
      media_type: r.media_type,
      title: r.title,
      creator: r.creator,
      description: notes[resultKey(r)] ?? "",
      image_url: r.image_url,
      view_url: r.view_url,
      metadata: r.year ? { year: r.year } : {},
      canonical_id: r.canonical_id ?? null,
      sort_order: nextSortOrder + i,
    }));
    const { error: insErr } = await supabase().from("items").insert(rows);
    if (insErr) {
      setError(insErr.message);
      setSaving(false);
      return;
    }
    onSaved(basket[0]);
  };

  return (
    <div
      className="fixed inset-0 z-[70] overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-label="Review your picks"
    >
      <button
        aria-label="Back to picking"
        onClick={onClose}
        className="fixed inset-0 cursor-default bg-white/35 backdrop-blur-[2px]"
      />
      <div className="pointer-events-none relative flex min-h-full items-start justify-center px-4 pt-[12vh] pb-16">
        <div className="pointer-events-auto w-full max-w-xl border border-zinc-200 bg-white shadow-2xl">
          <div className="flex items-baseline justify-between border-b border-zinc-100 px-5 py-3">
            <span className="text-[10px] uppercase tracking-[0.08em] text-zinc-400">
              {basket.length} {basket.length === 1 ? "favorite" : "favorites"} · thoughts optional
            </span>
            <button
              onClick={onClose}
              className="cursor-pointer text-[10px] uppercase tracking-[0.08em] text-zinc-400 transition-colors hover:text-zinc-900"
            >
              Keep picking
            </button>
          </div>
          <ul className="max-h-[55vh] overflow-y-auto">
            {basket.map((r) => (
              <li key={resultKey(r)} className="flex gap-3 border-b border-zinc-100 px-5 py-4">
                <div className="flex h-16 w-12 shrink-0 items-center justify-center">
                  {r.image_url ? (
                    <img
                      src={r.thumb_url ?? r.image_url}
                      alt=""
                      decoding="async"
                      className="max-h-full max-w-full object-contain"
                    />
                  ) : (
                    <div className="h-full w-full bg-zinc-100" />
                  )}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-sm font-medium text-zinc-900">
                      {r.title}
                    </span>
                    <span className="truncate text-xs text-zinc-400">
                      {[r.creator, r.year].filter(Boolean).join(" · ")}
                    </span>
                    <button
                      onClick={() => onRemove(r)}
                      aria-label={`Remove ${r.title}`}
                      className="ml-auto shrink-0 cursor-pointer text-[10px] uppercase tracking-[0.08em] text-zinc-400 transition-colors hover:text-zinc-900"
                    >
                      Remove
                    </button>
                  </div>
                  <textarea
                    value={notes[resultKey(r)] ?? ""}
                    onChange={(e) =>
                      setNotes((prev) => ({ ...prev, [resultKey(r)]: e.target.value }))
                    }
                    rows={2}
                    placeholder="Your thoughts — why is this a favorite?"
                    className="resize-none border border-zinc-200 bg-white px-3 py-2 text-xs leading-relaxed text-zinc-900 placeholder:text-zinc-300 focus:border-zinc-400 focus:outline-none"
                  />
                </div>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2 p-5">
            <button
              onClick={saveAll}
              disabled={saving}
              className="flex h-9 cursor-pointer items-center gap-2 bg-zinc-900 px-4 text-xs font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-wait disabled:bg-zinc-400"
            >
              <img src="/favicon.svg" alt="" className="h-4.5 w-auto" />
              {saving ? "Saving..." : `Favorite all (${basket.length})`}
            </button>
            {error && <span className="text-[11px] text-red-500">{error}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

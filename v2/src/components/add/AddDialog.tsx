"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, BookOpen, CornerDownLeft, Film, ImagePlus, Link2, Loader2, Mic, Music, Search, Sparkles, X } from "lucide-react";
import type { ListItem, MediaType, SearchResult, Work } from "@/lib/types";
import { ADD_TYPES } from "@/lib/categories";
import { supabase, authHeaders } from "@/lib/supabase";
import { useLiveSearch } from "@/lib/use-live-search";
import { urlWorkKey } from "@/lib/url-key";
import { playUi } from "@/lib/sfx";
import { addToList, favorite, isFavorited, listsHolding, useViewer, viewer } from "@/lib/viewer";
import { metaLine, typeLabel } from "@/lib/work";
import Dialog from "../ui/Dialog";
import Star from "../ui/Star";
import { NaturalCover } from "../Cover";
import { RowCover } from "../WorkRow";
import { toast } from "../ui/Toast";
import { cn, field, fieldLabel, primaryButton, quietButton, textarea } from "../ui/styles";

const SaveDialog = dynamic(() => import("../SaveDialog"));

const CHIP: Record<string, { label: string; icon: typeof Music; noun: string; hint: string }> = {
  book: { label: "Books", icon: BookOpen, noun: "a book", hint: "Search by title or author" },
  movie: { label: "Film & TV", icon: Film, noun: "a film or show", hint: "Search films and shows" },
  music: { label: "Music", icon: Music, noun: "an album or song", hint: "Search albums, songs, artists" },
  podcast: { label: "Podcasts", icon: Mic, noun: "a podcast", hint: "Search podcasts" },
  article: { label: "Links", icon: Link2, noun: "a link", hint: "Paste a link — an essay, a video, anything" },
  other: { label: "Other", icon: Sparkles, noun: "anything else", hint: "" },
};

type Draft = Work & { file?: File };

function resultWork(r: SearchResult): Draft {
  return {
    media_type: r.media_type,
    title: r.title,
    creator: r.creator,
    image_url: r.image_url,
    view_url: r.view_url,
    year: r.year || null,
    canonical_id: r.canonical_id,
  };
}

/** "https://…", "www.…" or a bare "site.com/path" — something to fetch, not to search for. */
function asUrl(q: string): string | null {
  const t = q.trim();
  if (/\s/.test(t)) return null;
  if (/^https?:\/\/\S+\.\S+/i.test(t)) return t;
  if (/^www\.\S+\.\S+/i.test(t) || /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}\/\S*$/i.test(t)) return `https://${t}`;
  return null;
}

const isVideo = (url: string) => /^https?:\/\/([^/]+\.)?(youtube\.com|youtu\.be|vimeo\.com)\//i.test(url);

/** Upload a picked image to the viewer's media folder; returns its public URL. */
async function upload(file: File): Promise<string> {
  const me = viewer().profile!;
  const path = `${me.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
  const db = supabase();
  const { error } = await db.storage.from("media").upload(path, file);
  if (error) throw new Error(error.message);
  return db.storage.from("media").getPublicUrl(path).data.publicUrl;
}

/**
 * ＋ — put anything on Favorite. One field does it all: type to search the
 * catalogs (the chips pick which), or paste a link from anywhere. Ends in the
 * two verbs: ★ Favorite (with an optional thought) or 🔖 Save to a list, and
 * stays open so you can add a few in a row. Arrow keys and ↵ work throughout.
 *
 * Opened from one of your lists (`list`), it builds that list instead: one
 * button, "Add to list", with an optional note — playlist-making speed.
 */
export default function AddDialog({
  open,
  onOpenChange,
  list,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  list?: { id: string; title: string };
  onAdded?: (row: ListItem) => void;
}) {
  const v = useViewer();
  const [type, setType] = useState<MediaType>("book");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [thought, setThought] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState<Work | null>(null);
  const [manual, setManual] = useState({ title: "", creator: "", url: "" });
  const [manualFile, setManualFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const mode = ADD_TYPES.find((t) => t.type === type)?.mode ?? "search";
  const chip = CHIP[type] ?? CHIP.book;
  const pasted = mode !== "manual" ? asUrl(query) : null;

  const pickType = (t: MediaType) => {
    setType(t);
    setDraft(null);
    setThought("");
    setError("");
    setActive(0);
    // a pasted link stays put; a search starts over in the new catalog
    if (!asUrl(query)) setQuery("");
    inputRef.current?.focus();
  };

  useEffect(() => {
    if (!draft && mode !== "manual") inputRef.current?.focus();
  }, [type, draft, mode]);

  const { results, searching } = useLiveSearch<SearchResult[]>(
    mode === "search" && !draft && !pasted ? query : "",
    async (q, signal) => {
      const r = await fetch(`/api/search?type=${type}&q=${encodeURIComponent(q)}`, {
        headers: await authHeaders(),
        signal,
      });
      const d = await r.json();
      if (!r.ok) {
        setError("Search failed — try again in a moment.");
        throw new Error("search failed");
      }
      setError("");
      return (d.results ?? []) as SearchResult[];
    },
    { scope: `add:${type}` }
  );
  const hits = results ?? [];

  const resolveUrl = async (url: string) => {
    setBusy(true);
    setError("");
    try {
      const [r, key] = await Promise.all([
        fetch(`/api/og?url=${encodeURIComponent(url)}`, { headers: await authHeaders() }),
        urlWorkKey(url),
      ]);
      if (!r.ok) throw new Error();
      const d = await r.json();
      setDraft({
        media_type: isVideo(url) ? "video" : "article",
        title: d.title ?? url,
        creator: d.site ?? "",
        image_url: d.image ?? null,
        view_url: url,
        // the same address as anyone else's copy → the same work
        canonical_id: key,
      });
    } catch {
      setError("Couldn't read that link — check the address.");
    } finally {
      setBusy(false);
    }
  };

  /** finalize uploads, then hand back a plain Work */
  const materialize = async (d: Draft): Promise<Work> => {
    if (!d.file) return d;
    const url = await upload(d.file);
    const { file: _f, ...rest } = d;
    return { ...rest, image_url: url };
  };

  const reset = () => {
    setDraft(null);
    setQuery("");
    setThought("");
    setActive(0);
  };

  const doFavorite = async () => {
    if (!draft || busy) return;
    if (isFavorited(viewer(), draft)) return setError("That's already on your wall.");
    setBusy(true);
    setError("");
    try {
      const work = await materialize(draft);
      playUi("confirm");
      await favorite(work, thought);
      toast(`Added ${work.title} to your favorites`);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add it — try again.");
    } finally {
      setBusy(false);
    }
  };

  const doAdd = async () => {
    if (!draft || busy || !list) return;
    setBusy(true);
    setError("");
    try {
      const work = await materialize(draft);
      const row = await addToList(work, list.id, thought);
      playUi("confirm");
      onAdded?.(row);
      toast(`Added to ${list.title}`);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add it — try again.");
    } finally {
      setBusy(false);
    }
  };

  const doSave = async () => {
    if (!draft || busy) return;
    setBusy(true);
    setError("");
    try {
      setSaving(await materialize(draft));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't prepare it — try again.");
    } finally {
      setBusy(false);
    }
  };

  const onManual = async () => {
    if (!manual.title.trim()) return setError("Give it a name.");
    setError("");
    const link = manual.url.trim() ? (asUrl(manual.url) ?? manual.url.trim()) : null;
    setDraft({
      media_type: "other",
      title: manual.title.trim(),
      creator: manual.creator.trim(),
      image_url: manualFile ? URL.createObjectURL(manualFile) : null,
      view_url: link,
      canonical_id: link ? await urlWorkKey(link) : null,
      ...(manualFile ? { file: manualFile } : {}),
    });
  };

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      if (pasted) void resolveUrl(pasted);
      else if (hits[active]) setDraft(resultWork(hits[active]));
    } else if (e.key === "ArrowDown" && hits.length) {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, hits.length - 1));
    } else if (e.key === "ArrowUp" && hits.length) {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    }
  };

  const already = draft ? (list ? listsHolding(v, draft).has(list.id) : isFavorited(v, draft)) : false;
  const Icon = chip.icon;

  return (
    <>
      <Dialog
        open={open && !saving}
        onOpenChange={onOpenChange}
        title={list ? `Add to ‘${list.title.length > 40 ? `${list.title.slice(0, 38)}…` : list.title}’` : "Add something"}
        busy={busy}
        size="xl"
      >
        {draft ? (
          <div className="flex flex-col gap-5">
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="-mt-1 inline-flex w-fit cursor-pointer items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-neutral-400 dark:hover:text-neutral-100"
            >
              <ArrowLeft className="size-4" /> Back
            </button>
            <div className="flex items-center gap-5">
              <div className="w-28 shrink-0 overflow-hidden rounded-md shadow-[0_10px_30px_rgba(0,0,0,0.14)] sm:w-32">
                <NaturalCover work={draft} priority sizes="128px" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-gray-500 dark:text-neutral-400">{typeLabel(draft)}</p>
                <p className="mt-1 text-xl font-bold leading-tight tracking-tight break-words text-gray-950 dark:text-white">
                  {draft.title}
                </p>
                {metaLine(draft) && <p className="mt-1.5 text-sm text-gray-500 dark:text-neutral-400">{metaLine(draft)}</p>}
              </div>
            </div>
            {already ? (
              <p className="rounded-xl bg-gray-100 px-4 py-3 text-sm text-gray-600 dark:bg-neutral-700/50 dark:text-neutral-300">
                {list ? "Already in this list." : "Already on your wall."}
              </p>
            ) : (
              <textarea
                value={thought}
                onChange={(e) => setThought(e.target.value)}
                placeholder={list ? "A note, if you have one…" : "A thought, if you have one…"}
                maxLength={list ? 280 : 1000}
                aria-label={list ? "Note" : "Your thought"}
                className={cn(textarea, "min-h-24 rounded-xl px-4 py-3")}
              />
            )}
            {list ? (
              <button type="button" onClick={doAdd} disabled={busy || already} className={cn(primaryButton, "h-11")}>
                {busy ? "Adding…" : "Add to list"}
              </button>
            ) : (
              <div className="flex gap-2">
                <button type="button" onClick={doSave} disabled={busy} className={cn(quietButton, "h-11 flex-1")}>
                  Save to a list
                </button>
                <button type="button" onClick={doFavorite} disabled={busy || already} className={cn(primaryButton, "h-11 flex-1")}>
                  <Star className="size-4 text-star" /> {busy ? "Adding…" : "Favorite"}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col">
            {mode !== "manual" && (
              <div className="relative">
                <Search className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-gray-400 dark:text-neutral-500" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActive(0);
                  }}
                  onKeyDown={onKey}
                  placeholder={chip.hint}
                  aria-label={mode === "url" ? "Link" : "Search"}
                  role="combobox"
                  aria-expanded={hits.length > 0}
                  aria-controls="add-results"
                  aria-activedescendant={hits[active] ? `add-hit-${active}` : undefined}
                  autoComplete="off"
                  spellCheck={false}
                  inputMode={mode === "url" ? "url" : undefined}
                  className="h-12 w-full rounded-xl border border-transparent bg-gray-100 pr-11 pl-11 text-base text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-300 focus:bg-white dark:bg-neutral-700/60 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-neutral-600 dark:focus:bg-neutral-800"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      inputRef.current?.focus();
                    }}
                    aria-label="Clear"
                    className="absolute top-1/2 right-2.5 inline-flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-gray-400 hover:bg-gray-200 hover:text-gray-900 dark:hover:bg-neutral-600 dark:hover:text-neutral-100"
                  >
                    <X className="size-4" />
                  </button>
                )}
              </div>
            )}

            <div role="tablist" aria-label="What are you adding?" className={cn("flex flex-wrap gap-1", mode !== "manual" && "mt-3")}>
              {ADD_TYPES.map((t) => {
                const c = CHIP[t.type];
                if (!c) return null;
                const on = type === t.type;
                const I = c.icon;
                return (
                  <button
                    key={t.type}
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => pickType(t.type)}
                    className={cn(
                      "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-2.5 text-[13px] font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gray-900 dark:focus-visible:ring-neutral-400",
                      on
                        ? "bg-gray-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
                        : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-neutral-300 dark:hover:bg-neutral-700/60 dark:hover:text-white"
                    )}
                  >
                    <I className="size-3.5" strokeWidth={2.2} />
                    {c.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 min-h-[280px]">
              {mode === "manual" ? (
                <form
                  className="flex flex-col gap-4"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void onManual();
                  }}
                >
                  <label className="flex flex-col gap-1.5">
                    <span className={fieldLabel}>What is it?</span>
                    <input
                      value={manual.title}
                      onChange={(e) => setManual((m) => ({ ...m, title: e.target.value }))}
                      placeholder="A restaurant, a game, a place…"
                      autoFocus
                      className={cn(field, "h-11 rounded-xl px-4")}
                    />
                  </label>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="flex flex-col gap-1.5">
                      <span className={fieldLabel}>By (optional)</span>
                      <input
                        value={manual.creator}
                        onChange={(e) => setManual((m) => ({ ...m, creator: e.target.value }))}
                        placeholder="Who made it"
                        className={cn(field, "h-11 rounded-xl px-4")}
                      />
                    </label>
                    <label className="flex flex-col gap-1.5">
                      <span className={fieldLabel}>Link (optional)</span>
                      <input
                        value={manual.url}
                        onChange={(e) => setManual((m) => ({ ...m, url: e.target.value }))}
                        placeholder="https://…"
                        inputMode="url"
                        className={cn(field, "h-11 rounded-xl px-4")}
                      />
                    </label>
                  </div>
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => fileRef.current?.click()} className={cn(quietButton, "rounded-xl")}>
                      <ImagePlus className="size-4" /> {manualFile ? "Change image" : "Add an image"}
                    </button>
                    {manualFile && <span className="min-w-0 truncate text-xs text-gray-500">{manualFile.name}</span>}
                    <input
                      ref={fileRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => setManualFile(e.target.files?.[0] ?? null)}
                    />
                  </div>
                  <button type="submit" className={cn(primaryButton, "mt-1 h-11")}>
                    Next
                  </button>
                </form>
              ) : pasted ? (
                <button
                  type="button"
                  onClick={() => void resolveUrl(pasted)}
                  disabled={busy}
                  className="flex w-full cursor-pointer items-center gap-3.5 rounded-xl bg-gray-100 px-3 py-3 text-left transition-colors hover:bg-gray-200/70 disabled:cursor-wait dark:bg-neutral-700/50 dark:hover:bg-neutral-700"
                >
                  <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-gray-900 text-white dark:bg-neutral-100 dark:text-neutral-900">
                    {busy ? <Loader2 className="size-5 animate-spin" /> : <Link2 className="size-5" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-semibold text-gray-900 dark:text-neutral-100">
                      {busy ? "Reading the page…" : isVideo(pasted) ? "Add this video" : "Add this link"}
                    </span>
                    <span className="block truncate text-[13px] text-gray-500 dark:text-neutral-400">
                      {pasted.replace(/^https?:\/\/(www\.)?/i, "")}
                    </span>
                  </span>
                  <CornerDownLeft className="size-4 shrink-0 text-gray-400 max-sm:hidden" />
                </button>
              ) : mode === "url" ? (
                <Empty
                  icon={Link2}
                  title="Paste a link"
                  body="Essays, videos, sites — anything with an address. If someone already saved it, it's the same work."
                />
              ) : query.trim().length < 1 ? (
                <Empty icon={Icon} title={`Find ${chip.noun}`} body={`${chip.hint} — or paste a link to anything.`} />
              ) : results === null ? (
                <div className="flex flex-col gap-1" aria-busy>
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="flex items-center gap-3.5 px-2 py-1.5">
                      <span className="size-12 animate-pulse rounded-[4px] bg-gray-200 dark:bg-neutral-700" />
                      <span className="flex flex-1 flex-col gap-2">
                        <span className="h-3.5 w-1/2 animate-pulse rounded bg-gray-200 dark:bg-neutral-700" />
                        <span className="h-3 w-1/3 animate-pulse rounded bg-gray-200 dark:bg-neutral-700" />
                      </span>
                    </div>
                  ))}
                </div>
              ) : hits.length === 0 ? (
                searching ? null : (
                  <Empty icon={Search} title={`Nothing for “${query.trim()}”`} body="Try the author or artist — or paste a link instead." />
                )
              ) : (
                <ul
                  id="add-results"
                  role="listbox"
                  aria-label="Results"
                  className={cn("-mx-2 flex max-h-[min(46dvh,400px)] flex-col overflow-y-auto transition-opacity", searching && "opacity-60")}
                >
                  {hits.map((r, i) => {
                    const work = resultWork(r);
                    return (
                      <li key={`${r.media_type}:${r.source_id}`} id={`add-hit-${i}`} role="option" aria-selected={i === active}>
                        <button
                          type="button"
                          onClick={() => setDraft(work)}
                          onMouseMove={() => i !== active && setActive(i)}
                          className={cn(
                            "flex w-full cursor-pointer items-center gap-3.5 rounded-xl px-2 py-1.5 text-left outline-none",
                            i === active && "bg-gray-100 dark:bg-neutral-700/60"
                          )}
                        >
                          <RowCover work={{ ...work, image_url: r.thumb_url ?? r.image_url }} small />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[15px] font-semibold text-gray-900 dark:text-neutral-100">{r.title}</span>
                            <span className="block truncate text-[13px] text-gray-500 dark:text-neutral-400">
                              {[r.creator, r.year, typeLabel({ media_type: r.media_type, canonical_id: r.canonical_id })]
                                .filter(Boolean)
                                .join(" · ")}
                            </span>
                          </span>
                          {isFavorited(v, work) && <Star className="size-4 shrink-0 text-star" />}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            {mode !== "manual" && (
              <p className="mt-3 hidden items-center gap-3 text-xs text-gray-400 sm:flex dark:text-neutral-500">
                <span>
                  <kbd className="font-sans">↑↓</kbd> to move
                </span>
                <span>
                  <kbd className="font-sans">↵</kbd> to choose
                </span>
                <span>
                  <kbd className="font-sans">esc</kbd> to close
                </span>
              </p>
            )}
          </div>
        )}
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </Dialog>
      {saving && (
        <SaveDialog
          work={saving}
          open={!!saving}
          onOpenChange={(o) => {
            if (o) return;
            setSaving(null);
            reset();
          }}
        />
      )}
    </>
  );
}

/** The quiet middle of the dialog before there's anything to show. */
function Empty({ icon: Icon, title, body }: { icon: typeof Music; title: string; body: string }) {
  return (
    <div className="flex h-[280px] flex-col items-center justify-center text-center">
      <span className="flex size-12 items-center justify-center rounded-2xl bg-gray-100 text-gray-500 dark:bg-neutral-700/60 dark:text-neutral-300">
        <Icon className="size-5" />
      </span>
      <p className="mt-4 text-[15px] font-semibold text-gray-900 dark:text-neutral-100">{title}</p>
      <p className="mt-1 max-w-xs text-sm leading-relaxed text-gray-500 dark:text-neutral-400">{body}</p>
    </div>
  );
}

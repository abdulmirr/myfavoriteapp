"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ImagePlus, Link2, Search } from "lucide-react";
import type { MediaType, SearchResult, Work } from "@/lib/types";
import { ADD_TYPES } from "@/lib/categories";
import { supabase, authHeaders } from "@/lib/supabase";
import { useLiveSearch } from "@/lib/use-live-search";
import { thumbCover } from "@/lib/img";
import { playUi } from "@/lib/sfx";
import { favorite, isFavorited, useViewer, viewer } from "@/lib/viewer";
import { metaLine, typeLabel } from "@/lib/work";
import Dialog from "../ui/Dialog";
import Star from "../ui/Star";
import { NaturalCover } from "../Cover";
import { toast } from "../ui/Toast";
import { cn, field, pill, pillActive, pillIdle, primaryButton, quietButton, textarea } from "../ui/styles";

const SaveDialog = dynamic(() => import("../SaveDialog"));

const LABEL: Record<string, string> = {
  book: "Book",
  movie: "Film & TV",
  music: "Music",
  podcast: "Podcast",
  video: "Video",
  article: "Link",
  photo: "Photo",
  other: "Other",
};

const PLACEHOLDER: Record<string, string> = {
  book: "Search books…",
  movie: "Search films and shows…",
  music: "Search albums and songs…",
  podcast: "Search podcasts…",
  video: "Paste a YouTube or Vimeo link",
  article: "Paste a link — an essay, a site, anything",
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

/** Upload a picked photo/image to the viewer's media folder; returns its public URL. */
async function upload(file: File): Promise<string> {
  const me = viewer().profile!;
  const path = `${me.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
  const db = supabase();
  const { error } = await db.storage.from("media").upload(path, file);
  if (error) throw new Error(error.message);
  return db.storage.from("media").getPublicUrl(path).data.publicUrl;
}

/**
 * ＋ — put anything on Favorite: search the catalogs, paste a link, upload a
 * photo, or type it in. Ends in the two verbs: ★ Favorite (with an optional
 * thought) or 🔖 Save to a list. Stays open so you can add a few in a row.
 */
export default function AddDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const v = useViewer();
  const [type, setType] = useState<MediaType>("book");
  const [query, setQuery] = useState("");
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

  const pickType = (t: MediaType) => {
    setType(t);
    setQuery("");
    setDraft(null);
    setThought("");
    setError("");
  };

  useEffect(() => {
    if (!draft) inputRef.current?.focus();
  }, [type, draft]);

  const { results, searching } = useLiveSearch<SearchResult[]>(
    mode === "search" && !draft ? query : "",
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

  const resolveUrl = async () => {
    const url = query.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) return setError("Paste a full link starting with http.");
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`/api/og?url=${encodeURIComponent(url)}`, { headers: await authHeaders() });
      if (!r.ok) throw new Error();
      const d = await r.json();
      setDraft({
        media_type: type,
        title: d.title ?? url,
        creator: d.site ?? "",
        image_url: d.image ?? null,
        view_url: url,
        canonical_id: null,
      });
    } catch {
      setError("Couldn't read that link — check the URL.");
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
      setDraft(null);
      setQuery("");
      setThought("");
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

  const onManual = () => {
    if (!manual.title.trim()) return setError("Give it a name.");
    setError("");
    setDraft({
      media_type: "other",
      title: manual.title.trim(),
      creator: manual.creator.trim(),
      image_url: manualFile ? URL.createObjectURL(manualFile) : null,
      view_url: manual.url.trim() || null,
      canonical_id: null,
      ...(manualFile ? { file: manualFile } : {}),
    });
  };

  const already = draft ? isFavorited(v, draft) : false;

  return (
    <>
      <Dialog open={open && !saving} onOpenChange={onOpenChange} title="Add something" busy={busy} className="max-w-lg">
        <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5">
          {ADD_TYPES.map((t) => (
            <button
              key={t.type}
              type="button"
              onClick={() => pickType(t.type)}
              className={cn(pill, "px-2.5 py-1 text-[13px]", type === t.type ? pillActive : pillIdle)}
            >
              {LABEL[t.type] ?? t.label}
            </button>
          ))}
        </div>

        {draft ? (
          <div className="flex flex-col gap-4">
            <button
              type="button"
              onClick={() => setDraft(null)}
              className="inline-flex w-fit cursor-pointer items-center gap-1 text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-neutral-400 dark:hover:text-neutral-100"
            >
              <ArrowLeft className="size-4" /> Back
            </button>
            <div className="flex gap-4">
              <div className="w-28 shrink-0">
                <NaturalCover work={draft} priority sizes="112px" />
              </div>
              <div className="min-w-0 pt-1">
                <p className="text-xs font-semibold text-gray-500 dark:text-neutral-400">{typeLabel(draft)}</p>
                <p className="mt-0.5 text-lg font-semibold leading-snug tracking-tight text-gray-900 dark:text-neutral-100">
                  {draft.title}
                </p>
                {metaLine(draft) && <p className="mt-1 text-sm text-gray-500 dark:text-neutral-400">{metaLine(draft)}</p>}
              </div>
            </div>
            {already ? (
              <p className="rounded-lg bg-gray-100 px-3 py-2.5 text-sm text-gray-600 dark:bg-neutral-700/50 dark:text-neutral-300">
                Already on your wall.
              </p>
            ) : (
              <textarea
                value={thought}
                onChange={(e) => setThought(e.target.value)}
                placeholder="A thought, if you have one…"
                maxLength={1000}
                aria-label="Your thought"
                className={cn(textarea, "min-h-20")}
              />
            )}
            <div className="flex gap-2">
              <button type="button" onClick={doSave} disabled={busy} className={cn(quietButton, "flex-1")}>
                Save to a list
              </button>
              <button type="button" onClick={doFavorite} disabled={busy || already} className={cn(primaryButton, "flex-1")}>
                <Star className="size-4 text-star" /> {busy ? "Adding…" : "Favorite"}
              </button>
            </div>
          </div>
        ) : mode === "search" ? (
          <div className="flex flex-col gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={PLACEHOLDER[type] ?? "Search…"}
                aria-label="Search"
                className={cn(field, "pl-9")}
              />
            </div>
            <div className={cn("-mx-2 flex max-h-[46dvh] flex-col overflow-y-auto", searching && "opacity-60")}>
              {(results ?? []).map((r) => (
                <button
                  key={`${r.media_type}:${r.source_id}`}
                  type="button"
                  onClick={() => setDraft(resultWork(r))}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-gray-100 dark:hover:bg-neutral-700/60"
                >
                  <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-gray-200 dark:bg-neutral-700">
                    {(r.thumb_url || r.image_url) && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.thumb_url ?? thumbCover(r.image_url!, 100)}
                        alt=""
                        loading="lazy"
                        className="max-h-full max-w-full object-contain"
                      />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-gray-900 dark:text-neutral-100">{r.title}</span>
                    <span className="block truncate text-xs text-gray-500 dark:text-neutral-400">
                      {[r.creator, r.year, typeLabel({ media_type: r.media_type, canonical_id: r.canonical_id })]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </button>
              ))}
              {results && results.length === 0 && query.trim().length > 1 && !searching && (
                <p className="px-2 py-6 text-center text-sm text-gray-500 dark:text-neutral-400">No matches.</p>
              )}
            </div>
          </div>
        ) : mode === "url" ? (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void resolveUrl();
            }}
          >
            <div className="relative flex-1">
              <Link2 className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-gray-400" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={PLACEHOLDER[type]}
                aria-label="Link"
                inputMode="url"
                className={cn(field, "pl-9")}
              />
            </div>
            <button type="submit" disabled={busy || !query.trim()} className={primaryButton}>
              {busy ? "…" : "Next"}
            </button>
          </form>
        ) : mode === "upload" ? (
          <div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex h-40 w-full cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 text-sm font-medium text-gray-500 transition-colors hover:border-gray-400 hover:text-gray-900 dark:border-neutral-600 dark:text-neutral-400 dark:hover:text-neutral-100"
            >
              <ImagePlus className="size-6" />
              Choose a photo
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > 5 * 1024 * 1024) return setError("Photos must be under 5MB.");
                setDraft({
                  media_type: "photo",
                  title: f.name.replace(/\.[^.]+$/, ""),
                  creator: "",
                  image_url: URL.createObjectURL(f),
                  view_url: null,
                  canonical_id: null,
                  file: f,
                });
              }}
            />
          </div>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              onManual();
            }}
          >
            <input
              ref={inputRef}
              value={manual.title}
              onChange={(e) => setManual((m) => ({ ...m, title: e.target.value }))}
              placeholder="What is it? A restaurant, a game, a place…"
              aria-label="Name"
              className={field}
            />
            <input
              value={manual.creator}
              onChange={(e) => setManual((m) => ({ ...m, creator: e.target.value }))}
              placeholder="By (optional)"
              aria-label="By"
              className={field}
            />
            <input
              value={manual.url}
              onChange={(e) => setManual((m) => ({ ...m, url: e.target.value }))}
              placeholder="Link (optional)"
              aria-label="Link"
              inputMode="url"
              className={field}
            />
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => fileRef.current?.click()} className={cn(quietButton, "h-9")}>
                <ImagePlus className="size-4" /> {manualFile ? "Change image" : "Image (optional)"}
              </button>
              {manualFile && <span className="truncate text-xs text-gray-500">{manualFile.name}</span>}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => setManualFile(e.target.files?.[0] ?? null)}
              />
            </div>
            <button type="submit" className={primaryButton}>
              Next
            </button>
          </form>
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
            setDraft(null);
            setQuery("");
          }}
        />
      )}
    </>
  );
}

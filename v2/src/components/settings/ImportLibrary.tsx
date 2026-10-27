"use client";

import { useEffect, useRef, useState } from "react";
import { IMPORT_CAP, parseImportFile, pullImportRows, runImport, type ImportRow, type ImportSource } from "@/lib/import";
import { refreshViewer, revalidate } from "@/lib/viewer";
import { cn, field, primaryButton, quietButton } from "../ui/styles";

const SOURCES: { key: ImportSource; placeholder: string }[] = [
  { key: "goodreads", placeholder: "Goodreads profile URL" },
  { key: "letterboxd", placeholder: "Letterboxd username" },
  { key: "lastfm", placeholder: "Last.fm username" },
];

/**
 * Bring a library over — Goodreads/Letterboxd 4★+, Spotify/Last.fm top albums.
 * The engine lives in lib/import.ts (shared with onboarding); you pick what
 * makes the wall.
 */
export default function ImportLibrary({ profileId, spotify = true }: { profileId: string; spotify?: boolean }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [source, setSource] = useState<ImportSource | null>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [finished, setFinished] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [pulling, setPulling] = useState<ImportSource | null>(null);
  const cancelled = useRef(false);

  // the Spotify OAuth round trip hands its albums back through sessionStorage
  useEffect(() => {
    let payload: string | null = null;
    let oauthError: string | null = null;
    try {
      payload = sessionStorage.getItem("fav:spotify-import");
      oauthError = sessionStorage.getItem("fav:spotify-error");
      sessionStorage.removeItem("fav:spotify-import");
      sessionStorage.removeItem("fav:spotify-error");
    } catch {
      return;
    }
    if (!payload && !oauthError) return;
    let parsed: ImportRow[] | null = null;
    if (payload) {
      try {
        parsed = JSON.parse(payload) as ImportRow[];
      } catch {
        oauthError = "Couldn't read what Spotify sent back — try connecting again.";
      }
    }
    queueMicrotask(() => {
      if (parsed?.length) {
        setRows(parsed);
        setSource("spotify");
      } else if (oauthError) setError(oauthError);
    });
  }, []);

  const pull = async (service: ImportSource) => {
    const id = (inputs[service] ?? "").trim();
    if (!id || pulling) return;
    setPulling(service);
    setError("");
    setFinished(null);
    try {
      setRows(await pullImportRows(service, id));
      setSource(service);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't reach that profile.");
    } finally {
      setPulling(null);
    }
  };

  const doImport = async () => {
    if (!rows || !source) return;
    cancelled.current = false;
    const res = await runImport(
      profileId,
      rows,
      source,
      (done, total) => setProgress({ done, total }),
      () => cancelled.current
    );
    setProgress(null);
    if (res.error) return setError(res.error);
    const notes = [`Imported ${res.done} favorite${res.done === 1 ? "" : "s"}`];
    if (res.skipped > 0) notes.push(`${res.skipped} already on your wall`);
    if (res.remaining > 0) notes.push(`${res.remaining} left — run it again for the rest`);
    setFinished(notes.join(" · "));
    setRows(null);
    void refreshViewer();
    revalidate([`profile:${profileId}`, "feed"]);
  };

  const selected = rows?.filter((r) => r.checked).length ?? 0;
  const hasStars = rows?.some((r) => r.rating > 0) ?? false;

  if (progress) {
    return (
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-gray-600 dark:text-neutral-300">
          Importing {progress.done}/{progress.total}…
        </p>
        <button type="button" onClick={() => (cancelled.current = true)} className={cn(quietButton, "h-9")}>
          Stop
        </button>
      </div>
    );
  }

  if (rows) {
    const smallBtn = "cursor-pointer rounded-md px-2 py-1 text-xs font-semibold text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:hover:bg-neutral-700";
    return (
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600 dark:text-neutral-300">
            {selected} of {rows.length} selected
          </p>
          <div className="flex gap-1">
            {hasStars && (
              <button type="button" className={smallBtn} onClick={() => setRows(rows.map((r) => ({ ...r, checked: r.rating >= 4 })))}>
                4★+
              </button>
            )}
            <button type="button" className={smallBtn} onClick={() => setRows(rows.map((r) => ({ ...r, checked: true })))}>
              All
            </button>
            <button type="button" className={smallBtn} onClick={() => setRows(rows.map((r) => ({ ...r, checked: false })))}>
              None
            </button>
          </div>
        </div>
        <ul className="max-h-72 overflow-y-auto rounded-lg border border-gray-200 dark:border-neutral-700">
          {rows.map((r, i) => (
            <li key={i}>
              <label className="flex cursor-pointer items-center gap-2.5 px-3 py-2 transition-colors hover:bg-gray-50 dark:hover:bg-neutral-700/40">
                <input
                  type="checkbox"
                  checked={r.checked}
                  onChange={() => setRows(rows.map((x, j) => (j === i ? { ...x, checked: !x.checked } : x)))}
                  className="size-4 accent-gray-900 dark:accent-neutral-100"
                />
                <span className="min-w-0 flex-1 truncate text-sm text-gray-900 dark:text-neutral-100">
                  {r.title}
                  {r.creator && <span className="text-gray-500 dark:text-neutral-400"> — {r.creator}</span>}
                </span>
                {r.rating > 0 && <span className="shrink-0 text-xs text-gray-500">{r.rating}★</span>}
              </label>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <button type="button" onClick={() => setRows(null)} className={cn(quietButton, "flex-1")}>
            Cancel
          </button>
          <button type="button" onClick={doImport} disabled={!selected} className={cn(primaryButton, "flex-1")}>
            Import {selected || ""} favorite{selected === 1 ? "" : "s"}
          </button>
        </div>
        {selected > IMPORT_CAP && <p className="text-xs text-gray-500">Imports run {IMPORT_CAP} at a time.</p>}
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {SOURCES.map((s) => (
        <form
          key={s.key}
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void pull(s.key);
          }}
        >
          <input
            value={inputs[s.key] ?? ""}
            onChange={(e) => setInputs((m) => ({ ...m, [s.key]: e.target.value }))}
            placeholder={s.placeholder}
            aria-label={s.placeholder}
            className={cn(field, "min-w-0 flex-1")}
          />
          <button type="submit" disabled={!(inputs[s.key] ?? "").trim() || !!pulling} className={cn(quietButton, "w-24")}>
            {pulling === s.key ? "Pulling…" : "Pull"}
          </button>
        </form>
      ))}
      {spotify && (
        <>
          {/* a full navigation on purpose: the route answers with Spotify's OAuth redirect */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/api/import/spotify" className={cn(quietButton, "w-fit")}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.5 17.3a.75.75 0 0 1-1.03.25c-2.82-1.72-6.37-2.11-10.55-1.16a.75.75 0 1 1-.33-1.46c4.57-1.05 8.5-.6 11.66 1.34.35.22.46.68.25 1.03zm1.47-3.27a.94.94 0 0 1-1.29.31c-3.23-1.98-8.15-2.56-11.97-1.4a.94.94 0 1 1-.55-1.8c4.37-1.32 9.8-.68 13.5 1.6.44.27.58.85.31 1.29zm.13-3.41C15.24 8.32 8.94 8.11 5.25 9.23a1.13 1.13 0 1 1-.65-2.16c4.24-1.28 11.28-1.03 15.72 1.6a1.13 1.13 0 0 1-1.22 1.95z" />
            </svg>
            Connect Spotify
          </a>
          <p className="text-xs leading-relaxed text-gray-500 dark:text-neutral-400">
            Spotify keeps new apps invite-only for now — if it refuses, Last.fm pulls the same albums for anyone.
          </p>
        </>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="w-fit cursor-pointer text-xs font-medium text-gray-500 underline underline-offset-2 hover:text-gray-900 dark:text-neutral-400 dark:hover:text-neutral-100"
        >
          or upload an export file (.csv / .zip)
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.zip"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            setError("");
            setFinished(null);
            try {
              const parsed = await parseImportFile(f);
              setRows(parsed.rows);
              setSource(parsed.source);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Couldn't read that file.");
            }
          }}
        />
        {finished && <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">{finished}</span>}
      </div>
      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    </div>
  );
}

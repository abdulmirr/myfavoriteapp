"use client";

import { useEffect, useRef, useState } from "react";
import {
  IMPORT_CAP,
  parseImportFile,
  pullImportRows,
  runImport,
  type ImportRow,
  type ImportSource,
} from "@/lib/import";

/**
 * Import a library from Goodreads (CSV export) or Letterboxd (export ZIP).
 * The parsing/enrichment/insert engine lives in lib/import.ts (shared with
 * onboarding); this component is the settings-page chrome around it.
 */

export default function ImportLibrary({ profileId }: { profileId: string }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [source, setSource] = useState<ImportSource | null>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [finished, setFinished] = useState<number | null>(null);
  const cancelled = useRef(false);

  // paste-a-profile pull — the primary path (no export file needed)
  const [grInput, setGrInput] = useState("");
  const [lbInput, setLbInput] = useState("");
  const [fmInput, setFmInput] = useState("");
  const [pulling, setPulling] = useState<ImportSource | null>(null);

  // the Spotify OAuth round trip lands its albums (or a human error message)
  // in sessionStorage on the way back to this page
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
    const rowsIn = parsed;
    const errIn = oauthError;
    queueMicrotask(() => {
      if (rowsIn?.length) {
        setRows(rowsIn);
        setSource("spotify");
      } else if (errIn) {
        setError(errIn);
      }
    });
  }, []);

  const pull = async (service: ImportSource, id: string) => {
    if (!id.trim() || pulling) return;
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

  const pick = async (f: File) => {
    setError("");
    setFinished(null);
    try {
      const parsed = await parseImportFile(f);
      setRows(parsed.rows);
      setSource(parsed.source);
    } catch (e) {
      setRows(null);
      setError(e instanceof Error ? e.message : "Couldn't read that file.");
    }
  };

  const [importNote, setImportNote] = useState("");

  const doImport = async () => {
    if (!rows || !source) return;
    cancelled.current = false;
    setImportNote("");
    const { done, skipped, remaining, error: err } = await runImport(
      profileId,
      rows,
      source,
      (done, total) => setProgress({ done, total }),
      () => cancelled.current
    );
    if (err) {
      // keep the reviewed selection so a retry doesn't mean re-pulling and
      // re-checking everything; already-imported rows will be skipped
      setError(err);
      setProgress(null);
      return;
    }
    const notes: string[] = [];
    if (skipped > 0) notes.push(`${skipped} already in your library`);
    if (remaining > 0) notes.push(`${remaining} left — run the import again for the rest`);
    setImportNote(notes.join(" · "));
    setProgress(null);
    setFinished(done);
    setRows(null);
  };

  const selectedCount = rows?.filter((r) => r.checked).length ?? 0;
  // rank-based sources (Spotify, Last.fm) have no stars — the 4★+ shortcut
  // would just wipe the selection there
  const hasStars = rows?.some((r) => r.rating > 0) ?? false;

  return (
    <div className="mt-10 border-t border-zinc-100 pt-6">
      <h2 className="text-[10px] uppercase tracking-[0.08em] text-zinc-400">Import</h2>
      <p className="mt-2 text-xs leading-relaxed text-zinc-400">
        Bring your history with you — Goodreads and Letterboxd pull in your 4★+ books
        and films, Spotify and Last.fm your most-loved albums. You pick what makes the
        wall.
      </p>

      {progress ? (
        <div className="mt-3">
          <p className="text-xs text-zinc-500">
            Importing {progress.done}/{progress.total}…
          </p>
          <button
            onClick={() => (cancelled.current = true)}
            className="mt-2 cursor-pointer text-[11px] text-zinc-400 transition-colors hover:text-zinc-900"
          >
            Stop
          </button>
        </div>
      ) : rows ? (
        <div className="mt-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-zinc-500">
              {selectedCount} of {rows.length} selected
            </p>
            <div className="flex gap-3 text-[11px]">
              {hasStars && (
                <button
                  onClick={() => setRows(rows.map((r) => ({ ...r, checked: r.rating >= 4 })))}
                  className="cursor-pointer text-zinc-400 transition-colors hover:text-zinc-900"
                >
                  4★+
                </button>
              )}
              <button
                onClick={() => setRows(rows.map((r) => ({ ...r, checked: true })))}
                className="cursor-pointer text-zinc-400 transition-colors hover:text-zinc-900"
              >
                All
              </button>
              <button
                onClick={() => setRows(rows.map((r) => ({ ...r, checked: false })))}
                className="cursor-pointer text-zinc-400 transition-colors hover:text-zinc-900"
              >
                None
              </button>
            </div>
          </div>
          <ul className="mt-2 max-h-64 overflow-y-auto border border-zinc-100">
            {rows.map((r, i) => (
              <li key={i}>
                <label className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 transition-colors hover:bg-zinc-50">
                  <input
                    type="checkbox"
                    checked={r.checked}
                    onChange={() =>
                      setRows(rows.map((x, j) => (j === i ? { ...x, checked: !x.checked } : x)))
                    }
                    className="accent-zinc-900"
                  />
                  <span className="min-w-0 flex-1 truncate text-xs text-zinc-900">
                    {r.title}
                    {r.creator && <span className="text-zinc-400"> — {r.creator}</span>}
                  </span>
                  {r.rating > 0 && (
                    <span className="shrink-0 text-[10px] text-zinc-400">{r.rating}★</span>
                  )}
                </label>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={doImport}
              disabled={!selectedCount}
              className="h-9 cursor-pointer bg-zinc-900 px-4 text-xs font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-default disabled:bg-zinc-400"
            >
              Import {selectedCount || ""} favorite{selectedCount === 1 ? "" : "s"}
            </button>
            <button
              onClick={() => setRows(null)}
              className="cursor-pointer text-xs text-zinc-400 transition-colors hover:text-zinc-900"
            >
              Cancel
            </button>
          </div>
          {selectedCount > IMPORT_CAP && (
            <p className="mt-2 text-[11px] text-zinc-400">
              Imports run {IMPORT_CAP} at a time.
            </p>
          )}
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <div className="flex gap-2">
            <input
              value={grInput}
              onChange={(e) => setGrInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && pull("goodreads", grInput)}
              placeholder="Goodreads profile URL"
              className="min-w-0 flex-1 border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 placeholder:text-zinc-300 focus:border-zinc-400 focus:outline-none"
            />
            <button
              onClick={() => pull("goodreads", grInput)}
              disabled={!grInput.trim() || !!pulling}
              className="shrink-0 cursor-pointer text-xs text-zinc-500 transition-colors hover:text-zinc-900 disabled:cursor-default disabled:text-zinc-300"
            >
              {pulling === "goodreads" ? "Pulling…" : "Pull →"}
            </button>
          </div>
          <div className="flex gap-2">
            <input
              value={lbInput}
              onChange={(e) => setLbInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && pull("letterboxd", lbInput)}
              placeholder="Letterboxd username"
              className="min-w-0 flex-1 border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 placeholder:text-zinc-300 focus:border-zinc-400 focus:outline-none"
            />
            <button
              onClick={() => pull("letterboxd", lbInput)}
              disabled={!lbInput.trim() || !!pulling}
              className="shrink-0 cursor-pointer text-xs text-zinc-500 transition-colors hover:text-zinc-900 disabled:cursor-default disabled:text-zinc-300"
            >
              {pulling === "letterboxd" ? "Pulling…" : "Pull →"}
            </button>
          </div>
          <div className="flex gap-2">
            <input
              value={fmInput}
              onChange={(e) => setFmInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && pull("lastfm", fmInput)}
              placeholder="Last.fm username"
              className="min-w-0 flex-1 border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 placeholder:text-zinc-300 focus:border-zinc-400 focus:outline-none"
            />
            <button
              onClick={() => pull("lastfm", fmInput)}
              disabled={!fmInput.trim() || !!pulling}
              className="shrink-0 cursor-pointer text-xs text-zinc-500 transition-colors hover:text-zinc-900 disabled:cursor-default disabled:text-zinc-300"
            >
              {pulling === "lastfm" ? "Pulling…" : "Pull →"}
            </button>
          </div>
          <a
            href="/api/import/spotify"
            className="flex h-9 w-fit items-center gap-2 border border-zinc-200 px-3 text-xs text-zinc-500 transition-colors hover:border-zinc-400 hover:text-zinc-900"
          >
            {/* spotify mark, monochrome */}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.5 17.3a.75.75 0 0 1-1.03.25c-2.82-1.72-6.37-2.11-10.55-1.16a.75.75 0 1 1-.33-1.46c4.57-1.05 8.5-.6 11.66 1.34.35.22.46.68.25 1.03zm1.47-3.27a.94.94 0 0 1-1.29.31c-3.23-1.98-8.15-2.56-11.97-1.4a.94.94 0 1 1-.55-1.8c4.37-1.32 9.8-.68 13.5 1.6.44.27.58.85.31 1.29zm.13-3.41C15.24 8.32 8.94 8.11 5.25 9.23a1.13 1.13 0 1 1-.65-2.16c4.24-1.28 11.28-1.03 15.72 1.6a1.13 1.13 0 0 1-1.22 1.95z" />
            </svg>
            Connect Spotify — pull your albums →
          </a>
          <p className="-mt-1 text-[11px] leading-relaxed text-zinc-400">
            Spotify keeps new apps invite-only for now — if the connection is refused,
            Last.fm above pulls the same albums for anyone.
          </p>
          <div className="flex items-center gap-3">
            <button
              onClick={() => fileRef.current?.click()}
              className="w-fit cursor-pointer text-[11px] text-zinc-400 transition-colors hover:text-zinc-900"
            >
              or upload an export file (.csv / .zip) →
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.zip"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) pick(f);
                e.target.value = "";
              }}
            />
            {finished !== null && (
              <span className="save-appear text-[11px] text-emerald-600">
                Imported {finished} favorite{finished === 1 ? "" : "s"}
                {importNote && <span className="text-zinc-400"> · {importNote}</span>}
              </span>
            )}
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-[11px] text-red-500">{error}</p>}
    </div>
  );
}

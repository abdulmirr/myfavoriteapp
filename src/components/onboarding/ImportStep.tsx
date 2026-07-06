"use client";

import { useRef, useState } from "react";
import {
  IMPORT_CAP,
  parseImportFile,
  pullImportRows,
  runImport,
  type ImportRow,
  type ImportSource,
} from "@/lib/import";
import { RevealWords, Rise } from "./bits";

/**
 * Beat 3 — bring your history. Paste a public Goodreads or Letterboxd profile
 * (or upload an export file) and your 4★+ ratings pull in as favorites,
 * reviews kept as thoughts. Entirely skippable.
 */
export default function ImportStep({
  profileId,
  onNext,
}: {
  profileId: string;
  onNext: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [source, setSource] = useState<ImportSource | null>(null);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [finished, setFinished] = useState<number | null>(null);
  const [importNote, setImportNote] = useState("");
  const [grInput, setGrInput] = useState("");
  const [lbInput, setLbInput] = useState("");
  const [pulling, setPulling] = useState<ImportSource | null>(null);
  const cancelled = useRef(false);

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

  return (
    <div className="mx-auto w-full max-w-sm">
      <h1 className="text-2xl font-semibold leading-snug tracking-tight text-zinc-900 sm:text-3xl">
        <RevealWords text="Already keep lists?" delay={0.1} />
      </h1>
      <Rise delay={0.35}>
        <p className="mt-2 text-xs leading-relaxed text-zinc-400">
          Point at your public Goodreads or Letterboxd profile and your books and films
          pull in automatically — 4★+ pre-selected. Favorites, not logs. Letterboxd pulls
          your ~120 most recent films; for full history, upload the export ZIP.
        </p>
      </Rise>

      <Rise delay={0.5} className="mt-8">
        {progress ? (
          <div>
            <p className="text-xs text-zinc-500">
              Importing {progress.done}/{progress.total}…
            </p>
            <div className="mt-3 h-px w-full bg-zinc-100">
              <div
                className="h-px bg-zinc-900 transition-all duration-300"
                style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }}
              />
            </div>
            <button
              onClick={() => (cancelled.current = true)}
              className="mt-3 cursor-pointer text-[11px] text-zinc-400 transition-colors hover:text-zinc-900"
            >
              Stop
            </button>
          </div>
        ) : rows ? (
          <div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-zinc-500">
                {selectedCount} of {rows.length} selected
              </p>
              <div className="flex gap-3 text-[11px]">
                <button
                  onClick={() => setRows(rows.map((r) => ({ ...r, checked: r.rating >= 4 })))}
                  className="cursor-pointer text-zinc-400 transition-colors hover:text-zinc-900"
                >
                  4★+
                </button>
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
            <ul className="mt-2 max-h-56 overflow-y-auto border border-zinc-100">
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
          <div className="flex flex-col gap-2">
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
              <p className="save-appear text-[11px] text-emerald-600">
                Imported {finished} favorite{finished === 1 ? "" : "s"} ✓
                {importNote && <span className="text-zinc-400"> · {importNote}</span>}
              </p>
            )}
          </div>
        )}
        {error && <p className="mt-2 text-[11px] text-red-500">{error}</p>}
      </Rise>

      {!progress && !rows && (
        <Rise delay={0.6} className="mt-10 flex items-center gap-4">
          <button
            onClick={onNext}
            className="h-9 cursor-pointer bg-zinc-900 px-4 text-xs font-medium text-white transition-colors hover:bg-zinc-700"
          >
            Continue
          </button>
          {finished === null && (
            <button
              onClick={onNext}
              className="cursor-pointer text-xs text-zinc-400 transition-colors hover:text-zinc-900"
            >
              Skip
            </button>
          )}
        </Rise>
      )}
    </div>
  );
}

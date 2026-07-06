import type { MediaType, SearchResult } from "./types";
import { supabase, authHeaders } from "./supabase";

/**
 * The Goodreads/Letterboxd import engine, shared by the settings panel
 * (ImportLibrary) and the onboarding flow. On brand, imports favorites, not
 * logs: rows come back pre-checked only at 4★+. Each selected row is enriched
 * through /api/search for artwork + canonical id.
 */

export type ImportSource = "goodreads" | "letterboxd";

export type ImportRow = {
  media_type: MediaType;
  title: string;
  creator: string;
  year: string;
  rating: number; // 0–5
  review: string;
  checked: boolean;
};

/** Imports run this many rows at a time. */
export const IMPORT_CAP = 200;

/** Tiny RFC-4180-ish CSV parser (quotes, embedded commas/newlines). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else inQuotes = false;
      } else cell += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function fromGoodreads(text: string): ImportRow[] {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const iTitle = col("title");
  const iAuthor = col("author");
  const iRating = col("my rating");
  const iShelf = col("exclusive shelf");
  const iReview = col("my review");
  const iPub = col("original publication year");
  if (iTitle < 0) return [];
  return rows
    .slice(1)
    .filter((r) => iShelf < 0 || r[iShelf] === "read")
    .map((r) => {
      const rating = iRating >= 0 ? Number(r[iRating]) || 0 : 0;
      return {
        media_type: "book" as MediaType,
        // Goodreads appends series info in parens — keep the clean title
        title: (r[iTitle] ?? "").replace(/\s*\(.*?#\d+.*?\)\s*$/, "").trim(),
        creator: (iAuthor >= 0 ? r[iAuthor] : "").trim(),
        year: iPub >= 0 ? (r[iPub] ?? "").trim() : "",
        rating,
        review: (iReview >= 0 ? r[iReview] : "").trim(),
        checked: rating >= 4,
      };
    })
    .filter((r) => r.title);
}

function fromLetterboxd(text: string): ImportRow[] {
  const rows = parseCsv(text);
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const iName = header.indexOf("name");
  const iYear = header.indexOf("year");
  const iRating = header.indexOf("rating");
  if (iName < 0) return [];
  return rows
    .slice(1)
    .map((r) => {
      const rating = iRating >= 0 ? Number(r[iRating]) || 0 : 0;
      return {
        media_type: "movie" as MediaType,
        title: (r[iName] ?? "").trim(),
        creator: "",
        year: iYear >= 0 ? (r[iYear] ?? "").trim() : "",
        rating,
        review: "",
        checked: rating >= 4,
      };
    })
    .filter((r) => r.title);
}

/** Pull a public profile through /api/import. Throws with a human message. */
export async function pullImportRows(
  service: ImportSource,
  id: string
): Promise<ImportRow[]> {
  const res = await fetch(
    `/api/import?service=${service}&id=${encodeURIComponent(id.trim())}`,
    { headers: await authHeaders() }
  );
  // a platform-level failure (gateway timeout page) isn't JSON — keep the
  // human-message contract instead of surfacing a raw SyntaxError
  const json = (await res
    .json()
    .catch(() => ({}))) as { rows?: Omit<ImportRow, "checked">[]; error?: string };
  if (!res.ok || !json.rows) throw new Error(json.error ?? "Couldn't pull that profile — try again.");
  return json.rows.map((r) => ({ ...r, checked: r.rating >= 4 }));
}

/** Read an export file (Goodreads CSV or Letterboxd ZIP). Throws with a human message. */
export async function parseImportFile(
  f: File
): Promise<{ rows: ImportRow[]; source: ImportSource }> {
  if (/\.zip$/i.test(f.name)) {
    // fflate only matters when someone actually hands us a ZIP — load it then
    const { unzipSync, strFromU8 } = await import("fflate");
    const files = unzipSync(new Uint8Array(await f.arrayBuffer()));
    const entry =
      Object.keys(files).find((n) => /(^|\/)ratings\.csv$/i.test(n)) ??
      Object.keys(files).find((n) => /(^|\/)watched\.csv$/i.test(n));
    if (!entry) throw new Error("No ratings.csv in that ZIP — is it a Letterboxd export?");
    return { rows: fromLetterboxd(strFromU8(files[entry])), source: "letterboxd" };
  }
  const text = await f.text();
  const source: ImportSource = /letterboxd/i.test(f.name) ? "letterboxd" : "goodreads";
  const rows = source === "letterboxd" ? fromLetterboxd(text) : fromGoodreads(text);
  if (!rows.length) throw new Error("Couldn't read any rows — is that a Goodreads export?");
  return { rows, source };
}

async function enrich(row: ImportRow): Promise<Partial<SearchResult>> {
  try {
    const type = row.media_type === "book" ? "book" : "movie";
    const res = await fetch(
      `/api/search?type=${type}&q=${encodeURIComponent(`${row.title} ${row.creator}`.trim())}`,
      { headers: await authHeaders() }
    );
    if (!res.ok) return {};
    const { results } = (await res.json()) as { results: SearchResult[] };
    if (!results?.length) return {};
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
    const exact = results.find(
      (r) =>
        norm(r.title) === norm(row.title) &&
        (!row.year || !r.year || String(r.year) === String(row.year))
    );
    return exact ?? results[0];
  } catch {
    return {};
  }
}

/**
 * Insert the checked rows (up to IMPORT_CAP), enriching each through
 * /api/search. Rows already in the library are skipped (re-runs and
 * abandoned-onboarding returns must not duplicate), progress is reported,
 * and a cancel flag is honored between rows. `remaining` counts checked
 * rows beyond the cap so callers can say "run again for the rest".
 */
export async function runImport(
  profileId: string,
  rows: ImportRow[],
  source: ImportSource,
  onProgress: (done: number, total: number) => void,
  isCancelled: () => boolean
): Promise<{ done: number; skipped: number; remaining: number; error: string | null }> {
  const checked = rows.filter((r) => r.checked);
  const selected = checked.slice(0, IMPORT_CAP);
  const remaining = checked.length - selected.length;
  if (!selected.length) return { done: 0, skipped: 0, remaining, error: null };
  onProgress(0, selected.length);
  const db = supabase();
  const [{ data: top }, { data: existing }] = await Promise.all([
    db
      .from("items")
      .select("sort_order")
      .eq("profile_id", profileId)
      .order("sort_order", { ascending: false })
      .limit(1),
    db.from("items").select("media_type, title").eq("profile_id", profileId),
  ]);
  const have = new Set(
    (existing ?? []).map((i) => `${i.media_type}|${i.title.trim().toLowerCase()}`)
  );
  let order = (top?.[0]?.sort_order ?? -1) + 1;
  let done = 0;
  let skipped = 0;
  for (const row of selected) {
    if (isCancelled()) break;
    if (have.has(`${row.media_type}|${row.title.trim().toLowerCase()}`)) {
      skipped++;
      onProgress(done + skipped, selected.length);
      continue;
    }
    const hit = await enrich(row);
    // the DB stores the ENRICHED title/type, so re-runs must also dedupe on
    // the post-enrichment key ("Chernobyl" imported as movie, stored as tv)
    const enrichedKey = `${hit.media_type ?? row.media_type}|${(hit.title ?? row.title).trim().toLowerCase()}`;
    if (have.has(enrichedKey)) {
      skipped++;
      onProgress(done + skipped, selected.length);
      continue;
    }
    const { error } = await db.from("items").insert({
      profile_id: profileId,
      media_type: hit.media_type ?? row.media_type,
      title: hit.title ?? row.title,
      creator: hit.creator || row.creator,
      description: row.review,
      image_url: hit.image_url ?? null,
      view_url: hit.view_url ?? null,
      metadata: { ...(hit.year || row.year ? { year: hit.year || row.year } : {}), imported: source },
      canonical_id: hit.canonical_id ?? null,
      sort_order: order++,
    });
    if (error) return { done, skipped, remaining, error: error.message };
    have.add(`${row.media_type}|${row.title.trim().toLowerCase()}`);
    have.add(enrichedKey);
    done++;
    onProgress(done + skipped, selected.length);
  }
  return { done, skipped, remaining, error: null };
}

import Star from "@/components/Star";
import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import type { Item, Profile } from "@/lib/types";

/**
 * The "who else loves this" page — one canonical work, everyone who counts it
 * a favorite, and what they said about it. Every item is a doorway into the
 * libraries of people with proven overlapping taste; it's also the long-tail
 * search surface (a page per work, addressed by canonical id).
 *
 * Canonical ids contain colons and sometimes slashes (ol:/works/…), hence the
 * catch-all segment reassembled with "/".
 */

// ISR, not force-dynamic: the sitemap fans crawlers out to thousands of these
// pages hourly — an hour of staleness beats a cold DB render per crawl hit
export const revalidate = 3600;

type Props = { params: Promise<{ id: string[] }> };

type Row = Item & { profile: Pick<Profile, "id" | "username" | "display_name" | "avatar_url"> };

const getRows = cache(async (canonical: string) => {
  const { data } = await supabaseServer()
    .from("items")
    .select(
      "id, profile_id, media_type, title, creator, description, image_url, view_url, metadata, canonical_id, created_at, profile:profiles!items_profile_id_fkey(id, username, display_name, avatar_url)"
    )
    .eq("canonical_id", canonical)
    .order("created_at", { ascending: true })
    .limit(60);
  // one-to-one embeds type as arrays — normalize both shapes
  return ((data ?? []) as unknown[]).map((r) => {
    const row = r as Omit<Row, "profile"> & { profile: Row["profile"] | Row["profile"][] };
    return { ...row, profile: Array.isArray(row.profile) ? row.profile[0] : row.profile } as Row;
  }).filter((r) => r.profile);
});

const canonicalFrom = async (params: Props["params"]) =>
  decodeURIComponent((await params).id.join("/"));

const TYPE_LABEL: Record<string, string> = {
  book: "Book", movie: "Film", tv: "TV show", music: "Album",
  podcast: "Podcast", video: "Video", article: "Link", photo: "Photo", other: "",
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const canonical = await canonicalFrom(params);
  const rows = await getRows(canonical);
  if (!rows.length) return {};
  const it = rows.find((r) => r.image_url) ?? rows[0];
  const title = `${it.title}${it.creator ? ` by ${it.creator}` : ""}`;
  const description = `A favorite of ${rows.length} ${rows.length === 1 ? "person" : "people"} on Favorites.`;
  return {
    title,
    description,
    openGraph: {
      title,
      description,
      ...(it.image_url ? { images: [it.image_url] } : {}),
    },
    twitter: it.image_url ? { card: "summary", images: [it.image_url] } : undefined,
  };
}

export default async function ItemPage({ params }: Props) {
  const canonical = await canonicalFrom(params);
  const rows = await getRows(canonical);
  if (!rows.length) notFound();

  const it = rows.find((r) => r.image_url) ?? rows[0];
  const year = (it.metadata as { year?: string | number })?.year;

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <nav className="flex items-center px-5 pt-6 md:px-8 md:pt-8">
        <Link href="/" aria-label="Home" className="w-fit transition-opacity hover:opacity-70">
          <Star className="h-6 w-6 text-[#f7a71e]" />
        </Link>
      </nav>

      <main className="mx-auto w-full max-w-xl flex-1 px-5 py-14">
        <div className="flex items-start gap-6">
          <div className="w-28 shrink-0 overflow-hidden bg-zinc-100 shadow-[0_8px_32px_rgba(0,0,0,0.14)] sm:w-36">
            {it.image_url && (
              <img src={it.image_url} alt={it.title} className="w-full object-cover" />
            )}
          </div>
          <div className="min-w-0 pt-1">
            {TYPE_LABEL[it.media_type] && (
              <p className="text-[10px] uppercase tracking-[0.12em] text-zinc-400">
                {TYPE_LABEL[it.media_type]}
              </p>
            )}
            <h1 className="mt-1.5 text-xl font-semibold leading-snug tracking-tight text-zinc-900">
              {it.title}
            </h1>
            {it.creator && <p className="mt-1 text-sm text-zinc-500">{it.creator}</p>}
            {year && <p className="mt-0.5 text-xs text-zinc-400">{year}</p>}
            {it.view_url && (
              <a
                href={it.view_url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-block text-[10px] uppercase tracking-[0.08em] text-zinc-400 underline-offset-4 transition-colors hover:text-zinc-900 hover:underline"
              >
                View
              </a>
            )}
          </div>
        </div>

        <h2 className="mt-12 text-[10px] uppercase tracking-[0.08em] text-zinc-400">
          A favorite of {rows.length} {rows.length === 1 ? "person" : "people"}
        </h2>
        <div className="mt-5 flex flex-col gap-6">
          {rows.map((r) => (
            <div key={r.id} className="flex items-start gap-3">
              <Link
                href={`/${r.profile.username}`}
                className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden bg-zinc-100 transition-opacity hover:opacity-70"
              >
                {r.profile.avatar_url ? (
                  <img src={r.profile.avatar_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-[10px] font-semibold text-zinc-300">
                    {(r.profile.display_name || r.profile.username).slice(0, 1)}
                  </span>
                )}
              </Link>
              <div className="min-w-0">
                <p className="text-xs">
                  <Link
                    href={`/${r.profile.username}?item=${r.id}`}
                    className="font-medium text-zinc-900 underline-offset-4 hover:underline"
                  >
                    {r.profile.display_name || `@${r.profile.username}`}
                  </Link>{" "}
                  <Link
                    href={`/${r.profile.username}`}
                    className="text-zinc-400 transition-colors hover:text-zinc-900"
                  >
                    @{r.profile.username}
                  </Link>
                </p>
                {r.description && (
                  <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-zinc-500">
                    {r.description}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>

        <p className="mt-14 text-xs text-zinc-400">
          Favorites is where taste lives —{" "}
          <Link
            href="/signin"
            className="text-zinc-900 underline underline-offset-4 hover:text-zinc-500"
          >
            start your library
          </Link>
          .
        </p>
      </main>
    </div>
  );
}

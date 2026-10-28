import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { getPopularWorkKeys, getWork, type WorkPageData } from "@/lib/data";
import { itemHref, metaLine, typeLabel } from "@/lib/work";
import { NaturalCover } from "@/components/Cover";
import FavoriteButton from "@/components/FavoriteButton";
import SaveButton from "@/components/SaveButton";
import ListCover from "@/components/ListCover";
import CoverGlow from "@/components/CoverGlow";
import Avatar from "@/components/ui/Avatar";
import { ShareLinkButton } from "@/components/profile/ProfileActions";
import { FavoritedBy, FavoritedList, YourEntry } from "@/components/item/ItemExtras";
import { cn, primaryButton } from "@/components/ui/styles";

type Params = { params: Promise<{ id: string[] }> };

/** canonical ids carry colons and slashes ("ol:/works/OL1W") — segments rejoin */
function keyOf(id: string[]): string {
  return id.map(decodeURIComponent).join("/");
}

export async function generateStaticParams() {
  const keys = await getPopularWorkKeys();
  const params = keys.map((k) => ({ id: k.split("/") }));
  return params.length ? params : [{ id: ["_"] }];
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const data = await getWork(keyOf(id));
  if (!data || data.canonicalRedirect) return { title: "Favorite" };
  const { work } = data;
  const title = `${work.title}${work.creator ? ` by ${work.creator}` : ""}`;
  const description =
    work.fav_count > 0
      ? `Favorited by ${work.fav_count} ${work.fav_count === 1 ? "person" : "people"} on Favorite.`
      : `Saved on Favorite.`;
  return {
    title,
    description,
    openGraph: { title, description, ...(work.image_url ? { images: [work.image_url] } : {}) },
    twitter: work.image_url ? { card: "summary", images: [work.image_url] } : undefined,
  };
}

/** "Listen on Apple Music" — names the place the link actually goes. */
function sourceLabel(url: string, type: string): string {
  let host = "";
  try {
    host = new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "Open";
  }
  const listen = type === "music" || type === "podcast";
  if (/apple\.com|itunes/.test(host)) return listen ? "Listen on Apple Music" : "Open on Apple Books";
  if (/spotify/.test(host)) return "Listen on Spotify";
  if (/deezer/.test(host)) return "Listen on Deezer";
  if (/youtube|youtu\.be/.test(host)) return "Watch on YouTube";
  if (/themoviedb/.test(host)) return "View on TMDB";
  if (/openlibrary/.test(host)) return "View on Open Library";
  if (/goodreads/.test(host)) return "View on Goodreads";
  if (/wikipedia/.test(host)) return "Read on Wikipedia";
  return `Open ${host}`;
}

async function Work({ params }: Params) {
  const { id } = await params;
  const key = keyOf(id);
  const data: WorkPageData | null = await getWork(key);
  if (!data) notFound();
  if (data.canonicalRedirect) redirect(itemHref({ canonical_id: data.canonicalRedirect }) ?? "/feed");
  const { work, favorites, lists } = data;
  const meta = metaLine(work);
  const path = itemHref(work) ?? `/item/${key}`;

  return (
    <>
      <CoverGlow covers={work.image_url ? [work.image_url] : []} />
      <div className="relative mx-auto max-w-5xl px-4 pt-6 sm:px-6 sm:pt-12">
        <div className="md:grid md:grid-cols-[260px_minmax(0,1fr)] md:gap-10 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-16">
          {/* the work: what it is, and what you can do with it */}
          <section className="flex flex-col items-center text-center md:items-start md:text-left">
            <div className="w-48 sm:w-56 md:w-full">
              <div className="overflow-hidden rounded-md shadow-[0_18px_50px_rgba(0,0,0,0.18)]">
                <NaturalCover work={work} priority sizes="(max-width: 767px) 224px, 300px" />
              </div>
            </div>
            <p className="mt-6 text-xs font-semibold text-gray-600 dark:text-neutral-300">{typeLabel(work)}</p>
            <h1 className="mt-1 text-[28px] font-bold leading-[1.1] tracking-[-0.03em] break-words text-gray-950 sm:text-[32px] dark:text-white">
              {work.title}
            </h1>
            {meta && <p className="mt-2 text-[15px] text-gray-600 dark:text-neutral-300">{meta}</p>}
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2 md:justify-start">
              {work.view_url && (
                <a
                  href={work.view_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(primaryButton, "h-9 px-4")}
                >
                  {sourceLabel(work.view_url, work.media_type)} <ArrowUpRight className="size-4" />
                </a>
              )}
              <div className="flex items-center gap-1">
                <FavoriteButton work={work} />
                <SaveButton work={work} />
                <ShareLinkButton icon path={path} />
              </div>
            </div>
          </section>

          {/* the people: who loves it, what they said, where it's kept */}
          <div className="mt-12 md:mt-0">
            {favorites.length > 0 ? (
              <section aria-labelledby="favorited-by">
                <h2 id="favorited-by" className="text-sm font-semibold tracking-tight text-gray-900 dark:text-neutral-100">
                  Favorited by {favorites.length} {favorites.length === 1 ? "person" : "people"}
                </h2>
                <div className="mt-1 divide-y divide-gray-200 dark:divide-neutral-800">
                  <YourEntry work={work} />
                  <Suspense fallback={<FavoritedList favorites={favorites} />}>
                    <FavoritedBy favorites={favorites} />
                  </Suspense>
                </div>
              </section>
            ) : (
              <section>
                <h2 className="text-sm font-semibold tracking-tight text-gray-900 dark:text-neutral-100">Favorited by</h2>
                <div className="mt-1 divide-y divide-gray-200 dark:divide-neutral-800">
                  <YourEntry work={work} />
                  <p className="py-4 text-[15px] text-gray-500 dark:text-neutral-400">
                    No one yet — tap ★ if it&apos;s one of yours.
                  </p>
                </div>
              </section>
            )}

            {lists.length > 0 && (
              <section aria-labelledby="in-lists" className="mt-10">
                <h2 id="in-lists" className="text-sm font-semibold tracking-tight text-gray-900 dark:text-neutral-100">
                  In {lists.length} {lists.length === 1 ? "list" : "lists"}
                </h2>
                <ul className="-mx-2 mt-2 flex flex-col">
                  {lists.map((l) => (
                    <li key={l.id}>
                      <Link
                        href={`/${l.owner.username}/lists/${l.slug}`}
                        className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-gray-900/[0.04] dark:hover:bg-white/[0.04]"
                      >
                        <ListCover covers={work.image_url ? [work.image_url] : []} small />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-semibold text-gray-900 dark:text-neutral-100">{l.title}</span>
                          <span className="flex items-center gap-1.5 text-[13px] text-gray-500 dark:text-neutral-400">
                            <Avatar p={l.owner} className="size-4" /> {l.owner.display_name || `@${l.owner.username}`}
                          </span>
                          {l.note?.trim() && (
                            <span className="mt-1 block truncate text-[13px] text-gray-600 dark:text-neutral-300">“{l.note.trim()}”</span>
                          )}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

export default function ItemPage({ params }: Params) {
  return (
    <main className="relative pb-20">
      <Suspense
        fallback={
          <div className="mx-auto max-w-5xl px-4 pt-6 sm:px-6 sm:pt-12" aria-busy>
            <div className="md:grid md:grid-cols-[260px_minmax(0,1fr)] md:gap-10 lg:grid-cols-[300px_minmax(0,1fr)] lg:gap-16">
              <div className="flex flex-col items-center gap-3 md:items-start">
                <span className="aspect-square w-48 animate-pulse rounded-md bg-gray-200 sm:w-56 md:w-full dark:bg-neutral-800" />
                <span className="mt-3 h-3 w-14 animate-pulse rounded bg-gray-200 dark:bg-neutral-800" />
                <span className="h-7 w-3/4 animate-pulse rounded bg-gray-200 dark:bg-neutral-800" />
                <span className="h-4 w-1/2 animate-pulse rounded bg-gray-200 dark:bg-neutral-800" />
              </div>
              <div className="mt-12 flex flex-col gap-4 md:mt-0">
                <span className="h-4 w-40 animate-pulse rounded bg-gray-200 dark:bg-neutral-800" />
                <span className="h-16 w-full animate-pulse rounded bg-gray-200 dark:bg-neutral-800" />
                <span className="h-16 w-full animate-pulse rounded bg-gray-200 dark:bg-neutral-800" />
              </div>
            </div>
          </div>
        }
      >
        <Work params={params} />
      </Suspense>
    </main>
  );
}

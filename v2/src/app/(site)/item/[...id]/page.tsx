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
import PeopleLine from "@/components/PeopleLine";
import ListCover from "@/components/ListCover";
import Avatar from "@/components/ui/Avatar";
import { ShareLinkButton } from "@/components/profile/ProfileActions";
import { FavoritedBy, FavoritedList, YourCopyBar } from "@/components/item/ItemExtras";
import { card, cn, drawer, quietButton } from "@/components/ui/styles";

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
    <div className="flex flex-col gap-6">
      <div className="relative">
        <section className={cn(card, "relative z-10 overflow-hidden")}>
          <div className="flex flex-col gap-5 p-4 sm:flex-row sm:gap-6 sm:p-6">
            <div className="mx-auto w-44 shrink-0 sm:mx-0 sm:w-48 sm:self-start">
              <NaturalCover work={work} priority sizes="(max-width: 639px) 176px, 192px" />
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <p className="text-xs font-semibold text-gray-500 dark:text-neutral-400">{typeLabel(work)}</p>
              <h1 className="mt-1 text-2xl font-semibold leading-tight tracking-tight text-gray-900 sm:text-[28px] dark:text-neutral-100">
                {work.title}
              </h1>
              {meta && <p className="mt-1.5 text-sm text-gray-500 dark:text-neutral-400">{meta}</p>}
              {work.view_url && (
                <a
                  href={work.view_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={cn(quietButton, "mt-4 h-9 w-fit")}
                >
                  {sourceLabel(work.view_url, work.media_type)} <ArrowUpRight className="size-4" />
                </a>
              )}
              <div className="mt-5 flex items-center gap-1.5 sm:mt-auto sm:pt-6">
                <FavoriteButton work={work} />
                <SaveButton work={work} />
                <ShareLinkButton path={path} />
              </div>
            </div>
          </div>
        </section>
        {(work.fav_count > 0 || work.save_count > 0) && (
          <div className={cn(drawer, "px-4 pt-6 pb-2.5 sm:px-6")}>
            <PeopleLine work={work} />
          </div>
        )}
      </div>

      <YourCopyBar work={work} />

      {favorites.length > 0 && (
        <section>
          <h2 className="mb-3 px-1 text-sm font-semibold tracking-tight text-gray-900 dark:text-neutral-100">
            Favorited by {favorites.length} {favorites.length === 1 ? "person" : "people"}
          </h2>
          <Suspense fallback={<FavoritedList favorites={favorites} work={work} />}>
            <FavoritedBy favorites={favorites} work={work} />
          </Suspense>
        </section>
      )}

      {lists.length > 0 && (
        <section>
          <h2 className="mb-3 px-1 text-sm font-semibold tracking-tight text-gray-900 dark:text-neutral-100">
            In {lists.length} {lists.length === 1 ? "list" : "lists"}
          </h2>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {lists.map((l) => (
              <li key={l.id}>
                <Link
                  href={`/${l.owner.username}/lists/${l.slug}`}
                  className={cn(card, "flex items-center gap-3 p-3 transition-colors hover:bg-gray-50 dark:hover:bg-neutral-700/40")}
                >
                  <ListCover covers={work.image_url ? [work.image_url] : []} className="h-12 w-auto shrink-0" small />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-gray-900 dark:text-neutral-100">{l.title}</span>
                    <span className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-neutral-400">
                      <Avatar p={l.owner} className="size-4 text-[9px]" /> @{l.owner.username}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export default function ItemPage({ params }: Params) {
  return (
    <main className="mx-auto max-w-2xl px-4 pt-2 pb-16 sm:px-6 sm:pt-8">
      <Suspense
        fallback={
          <div className={cn(card, "flex gap-6 p-6")} aria-busy>
            <span className="aspect-[2/3] w-48 animate-pulse rounded-md bg-gray-200 dark:bg-neutral-700" />
            <div className="flex flex-1 flex-col gap-3">
              <span className="h-3 w-16 animate-pulse rounded bg-gray-200 dark:bg-neutral-700" />
              <span className="h-7 w-3/4 animate-pulse rounded bg-gray-200 dark:bg-neutral-700" />
              <span className="h-4 w-1/2 animate-pulse rounded bg-gray-200 dark:bg-neutral-700" />
            </div>
          </div>
        }
      >
        <Work params={params} />
      </Suspense>
    </main>
  );
}

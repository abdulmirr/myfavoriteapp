import type { MediaType } from "@/lib/types";
import { coverSrcSet } from "@/lib/img";
import { cn, mediaBox, newBadge } from "./ui/styles";

/**
 * Covers, rendered the way antislop renders images — a plain <img> straight
 * from the source CDN on a gray placeholder, first row prioritized — with one
 * rule on top: a cover is never cropped.
 *
 *   natural  feed masonry: the cover at its true aspect ratio. Media with a
 *            known shape (albums 1:1, posters 2:3, video 16:9) reserve it up
 *            front, so nothing shifts while images arrive.
 *   stage    antislop's 16:9 card media (home picks, list rows): wide images
 *            fill it; covers sit centered at full height over a soft blur of
 *            themselves.
 *
 * No artwork → antislop's black title card ("Title / by Creator").
 */

type CoverWork = {
  media_type: MediaType;
  title: string;
  creator?: string | null;
  image_url: string | null;
};

const KNOWN_RATIO: Partial<Record<MediaType, string>> = {
  music: "aspect-square",
  podcast: "aspect-square",
  movie: "aspect-[2/3]",
  tv: "aspect-[2/3]",
  video: "aspect-video",
};

/** wide media fills a 16:9 stage edge to edge */
const WIDE: MediaType[] = ["video", "article", "other"];

function imgProps(url: string, priority: boolean, sizes: string) {
  return {
    ...coverSrcSet(url, sizes),
    decoding: "async" as const,
    loading: priority ? ("eager" as const) : ("lazy" as const),
    fetchPriority: priority ? ("high" as const) : undefined,
  };
}

export function TitleCard({
  title,
  creator,
  className,
  badge,
}: {
  title: string;
  creator?: string | null;
  className?: string;
  badge?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative flex aspect-video w-full flex-col items-start justify-center overflow-hidden rounded-md bg-black px-2.5 py-2 sm:px-3 sm:py-2.5",
        className
      )}
    >
      {badge && <span className={newBadge}>New</span>}
      <p className="line-clamp-3 text-base font-semibold leading-snug text-white">{title}</p>
      {creator && <p className="mt-1 max-w-full truncate text-sm text-white/70">by {creator}</p>}
    </div>
  );
}

export function NaturalCover({
  work,
  priority = false,
  badge = false,
  sizes = "(max-width: 1023px) 46vw, (max-width: 1279px) 31vw, 330px",
}: {
  work: CoverWork;
  priority?: boolean;
  badge?: boolean;
  sizes?: string;
}) {
  if (!work.image_url) return <TitleCard title={work.title} creator={work.creator} badge={badge} />;
  const ratio = KNOWN_RATIO[work.media_type];
  return (
    <div className={cn(mediaBox, ratio)}>
      {badge && <span className={newBadge}>New</span>}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        {...imgProps(work.image_url, priority, sizes)}
        alt=""
        className={cn(
          "block w-full transition-opacity group-hover/resource:opacity-90",
          ratio ? "h-full object-cover" : "h-auto min-h-24"
        )}
      />
    </div>
  );
}

export function StageCover({
  work,
  priority = false,
  className,
  sizes = "(max-width: 639px) 92vw, 576px",
}: {
  work: CoverWork;
  priority?: boolean;
  className?: string;
  sizes?: string;
}) {
  if (!work.image_url) return <TitleCard title={work.title} creator={work.creator} className={className} />;
  const props = imgProps(work.image_url, priority, sizes);
  const wide = WIDE.includes(work.media_type);
  return (
    <div className={cn(mediaBox, "aspect-video", className)}>
      {wide ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img {...props} alt="" className="absolute inset-0 size-full object-cover" />
      ) : (
        <>
          {/* the same file twice — one download — blurred as the backdrop */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            {...props}
            alt=""
            aria-hidden
            className="absolute inset-0 size-full scale-125 object-cover opacity-70 blur-2xl saturate-150 dark:opacity-50"
          />
          <span className="absolute inset-0 bg-white/20 dark:bg-black/25" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            {...props}
            alt=""
            className={cn(
              "absolute top-1/2 left-1/2 h-[84%] w-auto max-w-[90%] -translate-x-1/2 -translate-y-1/2 object-contain shadow-[0_6px_24px_rgba(0,0,0,0.22)]",
              work.media_type === "book" && "rounded-[2px]"
            )}
          />
        </>
      )}
    </div>
  );
}

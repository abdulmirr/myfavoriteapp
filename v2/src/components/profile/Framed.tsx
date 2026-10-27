import type { Item } from "@/lib/types";
import { coverSrcSet } from "@/lib/img";
import { hashRange } from "@/lib/rand";
import { cn } from "../ui/styles";

/**
 * The wall's objects (ported from v1): each medium keeps one physical cue —
 *   music → vinyl peeking from the sleeve · book → the fore-edge of pages ·
 *   film/TV → one-sheet in a snap frame · photo → polaroid ·
 *   video → paused screen (YouTube mark when it's YouTube) · rest → bare art.
 * Frames shrink-wrap the image's natural shape inside a square tile, sized in
 * container units so the cue keeps its proportion at any tile size.
 */

const TONES = ["#e9e4d8", "#dde4dc", "#dbe1e7", "#e7dde1", "#e8e1d2", "#e0e0e4"];
function tone(seed: string): string {
  return TONES[Math.floor(((hashRange(seed) + 1) / 2) * TONES.length) % TONES.length];
}

function isYouTube(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    return /(^|\.)(youtube\.com|youtu\.be)$/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

type FramedItem = Pick<Item, "id" | "media_type" | "title" | "image_url" | "view_url">;

export default function Framed({
  item,
  eager = false,
  sizes = "(max-width: 639px) 30vw, 150px",
}: {
  item: FramedItem;
  eager?: boolean;
  sizes?: string;
}) {
  const img = item.image_url
    ? {
        ...coverSrcSet(item.image_url, sizes),
        decoding: "async" as const,
        loading: eager ? ("eager" as const) : ("lazy" as const),
        fetchPriority: eager ? ("high" as const) : undefined,
      }
    : null;

  const box =
    "relative flex aspect-square w-full items-center justify-center [container-type:inline-size] transition-transform duration-150 group-hover:-translate-y-1";

  if (!img) {
    return (
      <div className={box}>
        <div
          style={{ background: tone(item.title) }}
          className="obj-shadow aspect-[3/4] h-[92cqw] overflow-hidden p-[7cqw] text-left"
        >
          <span className="line-clamp-5 block text-[9cqw] font-medium leading-[1.2] tracking-[-0.01em] text-[#22211fd9]">
            {item.title}
          </span>
        </div>
      </div>
    );
  }

  if (item.media_type === "photo") {
    return (
      <div className={box}>
        <div className="polaroid obj-shadow">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img {...img} alt={item.title} className="block max-h-[74cqw] max-w-[74cqw] bg-gray-100" />
        </div>
      </div>
    );
  }

  const deco =
    item.media_type === "book"
      ? "bookframe"
      : item.media_type === "movie" || item.media_type === "tv"
        ? "posterframe"
        : item.media_type === "music"
          ? "vinylframe"
          : item.media_type === "video"
            ? isYouTube(item.view_url)
              ? "screenframe screenframe--yt"
              : "screenframe"
            : null;

  return (
    <div className={box}>
      {deco ? (
        // the record and the page block stick out on the right — nudge the
        // whole object left so the cue stays inside the tile
        <div
          className={cn(
            deco,
            "obj-shadow",
            deco === "vinylframe" && "-translate-x-[3cqw]",
            deco === "bookframe" && "-translate-x-[1cqw]"
          )}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            {...img}
            alt={item.title}
            className={cn(
              "block bg-gray-100 dark:bg-neutral-700",
              deco === "vinylframe"
                ? "max-h-[84cqw] max-w-[84cqw]"
                : deco === "bookframe"
                  ? "max-h-[92cqw] max-w-[84cqw]"
                  : "max-h-[90cqw] max-w-[88cqw]"
            )}
          />
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          {...img}
          alt={item.title}
          className={cn(
            "obj-shadow object-contain",
            item.media_type === "podcast" ? "max-h-[86%] max-w-[86%]" : "max-h-full max-w-full"
          )}
        />
      )}
    </div>
  );
}

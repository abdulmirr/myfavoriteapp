import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Item, MediaType } from "@/lib/types";
import Framed from "../profile/Framed";
import NewsletterCTA from "../home/NewsletterCTA";
import { cn } from "../ui/styles";
import Drift from "./Drift";

/*
 * The front door for visitors (members get Home), in one screen: the line in
 * the middle, a shelf of favorites floating around it, one button. The
 * covers sit at three depths — near ones bigger and moving most with the
 * mouse, far ones smaller and fainter — so it reads as a room, not a grid.
 * Phones and tablets get the shelf as a band above the words.
 */

type Cover = Pick<Item, "id" | "media_type" | "title" | "image_url" | "view_url">;
// through the image optimizer: the originals are up to 600px and 200KB
const c = (file: string, title: string, media_type: MediaType): Cover => ({
  id: file,
  media_type,
  title,
  image_url: `/_next/image?url=${encodeURIComponent(`/landing/covers/${file}`)}&w=384&q=75`,
  view_url: null,
});

type Depth = "near" | "mid" | "far";
/** how far each depth travels with the mouse (--d), and how much of it shows */
const DEPTH: Record<Depth, { d: number; fade: number }> = {
  near: { d: 1, fade: 1 },
  mid: { d: 0.6, fade: 0.95 },
  far: { d: 0.3, fade: 0.75 },
};
/** around the words — by the screen's shorter side, so short laptops don't pile them up */
const AROUND: Record<Depth, string> = {
  near: "clamp(92px,min(10.5vw,17svh),168px)",
  mid: "clamp(70px,min(7.8vw,12.5svh),124px)",
  far: "clamp(52px,min(5.4vw,8.6svh),86px)",
};
/** above the words, in a band that's its own container */
const ABOVE: Record<Depth, string> = { near: "27cqw", mid: "21cqw", far: "15cqw" };

type Piece = {
  cover: Cover;
  depth: Depth;
  /** from its own side of the screen, and from the top */
  x: string;
  y: string;
  /** the innermost spots, only where the screen is wide enough */
  wide?: boolean;
  dur: number;
  delay: number;
  tilt: number;
};

const LEFT: Piece[] = [
  { cover: c("album-blonde.jpg", "Blonde", "music"), depth: "near", x: "3%", y: "5%", dur: 7.4, delay: -1.8, tilt: -2 },
  { cover: c("book-meditations.jpg", "Meditations", "book"), depth: "far", x: "17%", y: "2%", dur: 8.6, delay: -3.2, tilt: 2 },
  { cover: c("book-the-secret-history.jpg", "The Secret History", "book"), depth: "mid", x: "14%", y: "25%", dur: 8.2, delay: -4.1, tilt: 1.5 },
  { cover: c("film-interstellar.jpg", "Interstellar", "movie"), depth: "near", x: "2.5%", y: "40%", dur: 6.6, delay: -0.6, tilt: 0 },
  { cover: c("tv-severance.jpg", "Severance", "tv"), depth: "far", x: "18%", y: "54%", dur: 7.1, delay: -2.6, tilt: -1 },
  { cover: c("album-in-rainbows.jpg", "In Rainbows", "music"), depth: "mid", x: "6%", y: "72%", dur: 8.4, delay: -2.3, tilt: 1 },
  { cover: c("podcast-acquired.jpg", "Acquired", "podcast"), depth: "far", x: "24%", y: "80%", wide: true, dur: 7.6, delay: -5.2, tilt: 0 },
];
const RIGHT: Piece[] = [
  { cover: c("film-her.jpg", "Her", "movie"), depth: "mid", x: "4%", y: "4%", dur: 6.9, delay: -5, tilt: 1.5 },
  { cover: c("album-currents.jpg", "Currents", "music"), depth: "far", x: "22%", y: "6%", wide: true, dur: 7.7, delay: -1.2, tilt: -1 },
  { cover: c("book-norwegian-wood.jpg", "Norwegian Wood", "book"), depth: "near", x: "13%", y: "21%", dur: 8.1, delay: -3.6, tilt: 0 },
  { cover: c("album-random-access-memories.jpg", "Random Access Memories", "music"), depth: "mid", x: "3%", y: "40%", dur: 7.2, delay: -0.4, tilt: -1.5 },
  { cover: c("film-spirited-away.jpg", "Spirited Away", "movie"), depth: "far", x: "17%", y: "50%", dur: 8.8, delay: -4.4, tilt: 1 },
  { cover: c("film-the-dark-knight.jpg", "The Dark Knight", "movie"), depth: "near", x: "8%", y: "66%", dur: 6.8, delay: -4.6, tilt: 2 },
  { cover: c("book-dune.jpg", "Dune", "book"), depth: "far", x: "25%", y: "84%", wide: true, dur: 7.9, delay: -2.9, tilt: -1 },
];
const BAND: Piece[] = [
  { ...LEFT[1], x: "3%", y: "40%" },
  { ...LEFT[0], x: "17%", y: "4%" },
  { ...LEFT[3], depth: "mid", x: "44%", y: "34%" },
  { ...LEFT[2], depth: "near", x: "62%", y: "0%" },
  { ...RIGHT[1], wide: false, x: "84%", y: "44%" },
];

// far ones first, so a near cover passes in front where two meet
const RANK: Record<Depth, number> = { far: 0, mid: 1, near: 2 };
const byDepth = <T extends { p: Piece }>(a: T, b: T) => RANK[a.p.depth] - RANK[b.p.depth];

function Float({ p, at, width, order }: { p: Piece; at: React.CSSProperties; width: string; order: number }) {
  const { d, fade } = DEPTH[p.depth];
  return (
    <div
      className={cn("landing-depth absolute", p.wide && "hidden xl:block")}
      style={{ ...at, width, "--d": d, animationDelay: `${150 + order * 60}ms` } as React.CSSProperties}
    >
      <div
        className="landing-float"
        style={
          {
            opacity: fade,
            animationDuration: `${p.dur}s`,
            animationDelay: `${p.delay}s`,
            "--tilt": `${p.tilt}deg`,
          } as React.CSSProperties
        }
      >
        <Framed item={p.cover} rush={false} />
      </div>
    </div>
  );
}

// bigButton's shape with the landing's tighter corners
const start =
  "inline-flex h-12 cursor-pointer items-center justify-center rounded-md bg-gray-900 px-7 text-base font-semibold text-white outline-none transition-colors hover:bg-gray-800 focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 dark:focus-visible:ring-neutral-400";

export default function Landing() {
  const around = [
    ...LEFT.map((p, i) => ({ p, side: "left" as const, order: i * 2 })),
    ...RIGHT.map((p, i) => ({ p, side: "right" as const, order: i * 2 + 1 })),
  ].sort(byDepth);
  const band = BAND.map((p, i) => ({ p, order: i })).sort(byDepth);

  return (
    // one screen under the sticky header (67px: its 34px row, py-4 and the hairline)
    <div className="relative flex min-h-[calc(100svh-67px)] flex-col overflow-hidden">
      <section className="relative flex flex-1 flex-col items-center justify-center pt-6 pb-8 lg:py-16">
        <Drift className="pointer-events-none absolute inset-0 hidden lg:block">
          {around.map(({ p, side, order }) => (
            <Float
              key={p.cover.id}
              p={p}
              order={order}
              width={AROUND[p.depth]}
              at={side === "left" ? { left: p.x, top: p.y } : { right: p.x, top: p.y }}
            />
          ))}
        </Drift>
        <div
          aria-hidden
          className="pointer-events-none relative mb-6 aspect-[100/36] w-full max-w-[560px] [container-type:inline-size] sm:mb-10 lg:hidden"
        >
          {band.map(({ p, order }) => (
            <Float key={p.cover.id} p={p} order={order} width={ABOVE[p.depth]} at={{ left: p.x, top: p.y }} />
          ))}
        </div>

        <div className="relative flex flex-col items-center px-4 text-center">
          <h1 className="text-[46px] font-bold leading-[1.02] tracking-[-0.045em] text-gray-950 sm:text-[64px] lg:text-[76px] dark:text-white">
            Your taste,
            <br />
            in one place.
          </h1>
          <p className="mt-6 max-w-lg text-[17px] leading-relaxed text-balance text-gray-600 sm:text-lg dark:text-neutral-300">
            Keep a page of the books, films and music that made you. Save what you want to get to next. Find new
            favorites from people with taste.
          </p>
          <div className="mt-9 flex flex-col items-center gap-5 sm:flex-row sm:gap-7">
            <Link href="/signin?mode=signup" className={start}>
              Start your library
            </Link>
            <Link
              href="/abdulmir"
              className="group inline-flex items-center gap-1.5 text-[15px] font-semibold text-gray-600 hover:text-gray-950 dark:text-neutral-300 dark:hover:text-white"
            >
              See an example page <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </section>

      <footer className="relative px-4 pt-2 pb-7">
        {/* the line arrives after hydration — hold its room so nothing jumps */}
        <div className="min-h-[84px] lg:min-h-10">
          <NewsletterCTA compact />
        </div>
        <p className="mt-5 flex items-center justify-center gap-4 text-xs text-gray-500 dark:text-neutral-400">
          <Link href="/privacy" className="hover:text-gray-900 dark:hover:text-neutral-100">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-gray-900 dark:hover:text-neutral-100">
            Terms
          </Link>
        </p>
      </footer>
    </div>
  );
}

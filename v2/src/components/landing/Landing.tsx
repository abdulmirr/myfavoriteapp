import Link from "next/link";
import { ArrowRight, Bookmark, Check, Circle, Sparkles } from "lucide-react";
import type { CommunityPick, LandingWall } from "@/lib/data";
import type { Item, MediaType, Work } from "@/lib/types";
import { itemHref } from "@/lib/work";
import Framed from "../profile/Framed";
import WorkRow, { RowCover } from "../WorkRow";
import NewsletterCTA from "../home/NewsletterCTA";
import Avatar from "../ui/Avatar";
import Star from "../ui/Star";
import { bigButton, cn } from "../ui/styles";

/*
 * The front door for visitors (members get Home). Every cover here is real —
 * the old landing's shelf, in the wall's own frames — and the middle of the
 * page is live: today's five picks and three pages from the community.
 */

type Cover = Pick<Item, "id" | "media_type" | "title" | "image_url" | "view_url">;
const c = (file: string, title: string, media_type: MediaType): Cover => ({
  id: file,
  media_type,
  title,
  image_url: `/landing/covers/${file}`,
  view_url: null,
});
const w = (cv: Cover, creator: string, year: string): Work => ({
  media_type: cv.media_type,
  title: cv.title,
  creator,
  image_url: cv.image_url,
  view_url: null,
  year,
  canonical_id: null,
});

/** the hero's two side bands — the middle stays clear for the words */
type Piece = { cover: Cover; x: string; y: string; w: string; dur: number; delay: number; tilt: number };
const LEFT: Piece[] = [
  { cover: c("album-blonde.jpg", "Blonde", "music"), x: "3%", y: "8%", w: "clamp(84px,9.5vw,148px)", dur: 7.4, delay: -1.8, tilt: -2 },
  { cover: c("book-the-secret-history.jpg", "The Secret History", "book"), x: "15%", y: "24%", w: "clamp(64px,7vw,112px)", dur: 8.2, delay: -4.1, tilt: 1.5 },
  { cover: c("film-interstellar.jpg", "Interstellar", "movie"), x: "4%", y: "41%", w: "clamp(78px,8.5vw,134px)", dur: 6.6, delay: -0.6, tilt: 0 },
  { cover: c("book-meditations.jpg", "Meditations", "book"), x: "16%", y: "57%", w: "clamp(62px,6.8vw,108px)", dur: 7.9, delay: -3, tilt: -1.5 },
  { cover: c("album-in-rainbows.jpg", "In Rainbows", "music"), x: "3%", y: "72%", w: "clamp(80px,9vw,140px)", dur: 8.4, delay: -2.3, tilt: 1 },
];
const RIGHT: Piece[] = [
  { cover: c("film-her.jpg", "Her", "movie"), x: "4%", y: "9%", w: "clamp(76px,8.5vw,132px)", dur: 6.9, delay: -5, tilt: 1.5 },
  { cover: c("album-channel-orange.jpg", "channel ORANGE", "music"), x: "16%", y: "26%", w: "clamp(66px,7.2vw,114px)", dur: 7.7, delay: -1.2, tilt: -1 },
  { cover: c("book-east-of-eden.jpg", "East of Eden", "book"), x: "3%", y: "43%", w: "clamp(72px,8vw,124px)", dur: 8.1, delay: -3.6, tilt: 0 },
  { cover: c("film-the-dark-knight.jpg", "The Dark Knight", "movie"), x: "16%", y: "59%", w: "clamp(62px,6.8vw,108px)", dur: 6.8, delay: -4.6, tilt: 2 },
  { cover: c("album-yeezus.jpg", "Yeezus", "music"), x: "4%", y: "74%", w: "clamp(80px,9vw,140px)", dur: 7.3, delay: -0.9, tilt: -1.5 },
];
const PHONE = [LEFT[0], RIGHT[1], LEFT[1], RIGHT[0]];

const ROLL = [
  c("film-oppenheimer.jpg", "Oppenheimer", "movie"),
  c("album-igor.jpg", "IGOR", "music"),
  c("book-blood-meridian.jpg", "Blood Meridian", "book"),
  c("film-parasite.jpg", "Parasite", "movie"),
  c("album-currents.jpg", "Currents", "music"),
  c("book-dune.jpg", "Dune", "book"),
  c("tv-severance.jpg", "Severance", "tv"),
  c("podcast-acquired.jpg", "Acquired", "podcast"),
  c("film-the-social-network.jpg", "The Social Network", "movie"),
  c("album-to-pimp-a-butterfly.jpg", "To Pimp a Butterfly", "music"),
  c("book-mans-search-for-meaning.jpg", "Man's Search for Meaning", "book"),
  c("film-spirited-away.jpg", "Spirited Away", "movie"),
  c("album-random-access-memories.jpg", "Random Access Memories", "music"),
  c("book-project-hail-mary.jpg", "Project Hail Mary", "book"),
];

const eyebrow = "text-sm font-semibold text-gray-500 dark:text-neutral-400";
const h2 = "text-[32px] font-bold leading-[1.05] tracking-[-0.035em] text-balance text-gray-950 sm:text-[44px] dark:text-white";
const panel =
  "rounded-2xl border border-gray-200 bg-white shadow-[0_10px_40px_rgba(0,0,0,0.06)] dark:border-neutral-800 dark:bg-neutral-800/70";

function Float({ p, side }: { p: Piece; side: "left" | "right" }) {
  const at = side === "left" ? { left: p.x, top: p.y, width: p.w } : { right: p.x, top: p.y, width: p.w };
  return (
    <div className="absolute" style={at}>
      <div
        className="landing-float"
        style={{ animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s`, "--tilt": `${p.tilt}deg` } as React.CSSProperties}
      >
        <Framed item={p.cover} eager rush={false} sizes="150px" />
      </div>
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden px-4 sm:px-6 md:min-h-[min(calc(100svh-64px),860px)] lg:px-8">
      <div aria-hidden className="pointer-events-none absolute inset-0 hidden md:block">
        {LEFT.map((p) => (
          <Float key={p.cover.id} p={p} side="left" />
        ))}
        {RIGHT.map((p) => (
          <Float key={p.cover.id} p={p} side="right" />
        ))}
      </div>
      <div className="relative mx-auto flex max-w-2xl flex-col items-center pt-10 pb-20 text-center md:min-h-[min(calc(100svh-64px),860px)] md:justify-center md:py-24">
        <div aria-hidden className="mb-10 grid w-full max-w-xs grid-cols-4 gap-3 md:hidden">
          {PHONE.map((p) => (
            <Framed key={p.cover.id} item={p.cover} eager rush={false} sizes="80px" />
          ))}
        </div>
        <h1 className="text-[44px] font-bold leading-[1.02] tracking-[-0.045em] text-gray-950 sm:text-[64px] lg:text-[76px] dark:text-white">
          Your taste,
          <br />
          in one place.
        </h1>
        <p className="mt-6 max-w-lg text-[17px] leading-relaxed text-balance text-gray-600 sm:text-lg dark:text-neutral-300">
          Favorite the books, films and music that made you. Save what you want to get to next. Find your next favorite
          every morning.
        </p>
        <div className="mt-9 flex flex-col items-center gap-4 sm:flex-row sm:gap-6">
          <Link href="/signin?mode=signup" className={bigButton}>
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
  );
}

/** ★ — a corner of someone's wall */
function WallDemo() {
  const four = [
    c("album-blonde.jpg", "Blonde", "music"),
    c("book-dune.jpg", "Dune", "book"),
    c("film-the-godfather.jpg", "The Godfather", "movie"),
    c("podcast-founders.jpg", "Founders", "podcast"),
  ];
  return (
    <div className={cn(panel, "grid grid-cols-2 gap-x-6 gap-y-5 p-6 sm:p-7")}>
      {four.map((cv) => (
        <div key={cv.id}>
          <Framed item={cv} sizes="140px" />
          <p className="mt-2 truncate text-center text-xs font-semibold text-gray-900 dark:text-neutral-100">{cv.title}</p>
        </div>
      ))}
    </div>
  );
}

/** 🔖 — a list, ticking along */
function ListDemo() {
  const rows: [Cover, string, boolean][] = [
    [c("film-whiplash.jpg", "Whiplash", "movie"), "Damien Chazelle · 2014", true],
    [c("book-project-hail-mary.jpg", "Project Hail Mary", "book"), "Andy Weir · 2021", false],
    [c("album-to-pimp-a-butterfly.jpg", "To Pimp a Butterfly", "music"), "Kendrick Lamar · 2015", false],
  ];
  return (
    <div className={cn(panel, "p-5 sm:p-6")}>
      <p className="text-xs font-semibold text-gray-500 dark:text-neutral-400">List</p>
      <p className="mt-0.5 text-xl font-bold tracking-tight text-gray-950 dark:text-white">Check later</p>
      <ol className="mt-4 flex flex-col gap-3">
        {rows.map(([cv, meta, done], i) => (
          <li key={cv.id} className="flex items-center gap-3">
            <span className="w-3 text-xs font-medium text-gray-400 tabular-nums">{i + 1}</span>
            <RowCover work={w(cv, "", "")} small dim={done} />
            <span className="min-w-0 flex-1">
              <span className={cn("block truncate text-sm font-semibold", done ? "text-gray-400 dark:text-neutral-500" : "text-gray-900 dark:text-neutral-100")}>
                {cv.title}
              </span>
              <span className="block truncate text-xs text-gray-500 dark:text-neutral-400">{meta}</span>
            </span>
            {done ? (
              <span className="flex size-5 items-center justify-center rounded-full bg-gray-900 text-white dark:bg-neutral-100 dark:text-neutral-900">
                <Check className="size-3" strokeWidth={3} />
              </span>
            ) : (
              <Circle className="size-5 text-gray-300 dark:text-neutral-600" strokeWidth={1.8} />
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

/** ☀ — a morning pick */
function PickDemo() {
  return (
    <div>
      <div className="mx-3 -mb-4 rounded-t-2xl border border-b-0 border-gray-200 bg-gray-50 px-4 pt-2.5 pb-[26px] text-xs text-gray-600 dark:border-neutral-800 dark:bg-neutral-800/50 dark:text-neutral-300">
        “The quietest film about ambition ever made.”
      </div>
      <div className={cn(panel, "relative flex items-center gap-4 p-4")}>
        <div className="w-20 shrink-0">
          <Framed item={c("film-la-la-land.jpg", "La La Land", "movie")} sizes="80px" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-gray-950 dark:text-white">La La Land</p>
          <p className="truncate text-xs text-gray-500 dark:text-neutral-400">Damien Chazelle · 2016 · Film</p>
          <p className="mt-2 text-xs leading-relaxed text-gray-700 dark:text-neutral-300">
            <span className="bg-yellow-200/80 px-0.5 dark:bg-yellow-500/30">Because you loved Whiplash</span> — same
            drummer&apos;s heart, softer light.
          </p>
        </div>
      </div>
    </div>
  );
}

function Verbs() {
  const verbs = [
    {
      icon: <Star className="size-5 text-star" />,
      name: "Favorite",
      title: "Your wall",
      body: "Put the books, films, albums and podcasts that made you on your page — records, page edges and posters on a wall. Pin your top four.",
      demo: <WallDemo />,
    },
    {
      icon: <Bookmark className="size-5" strokeWidth={2.2} />,
      name: "Save",
      title: "Your lists",
      body: "Everything you want to read, watch and hear next. Share lists like playlists, tick things off, and favorite what you loved.",
      demo: <ListDemo />,
    },
    {
      icon: <Sparkles className="size-5" />,
      name: "Discover",
      title: "Your mornings",
      body: "Five picks every day from people with taste — and once you've favorited a few, picks chosen from yours.",
      demo: <PickDemo />,
    },
  ];
  return (
    <section className="px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <p className={eyebrow}>How it works</p>
          <h2 className={cn(h2, "mt-2")}>Favorite. Save. Discover.</h2>
        </div>
        <div className="mt-14 grid gap-14 md:grid-cols-3 md:gap-8 lg:gap-12">
          {verbs.map((v) => (
            <div key={v.name} className="flex flex-col">
              {/* one height for all three from tablet up, so the words below line up */}
              <div className="flex md:h-[420px] md:items-center">
                <div className="w-full">{v.demo}</div>
              </div>
              <p className="mt-8 flex items-center gap-2 text-sm font-semibold text-gray-900 dark:text-neutral-100">
                {v.icon} {v.name}
              </p>
              <h3 className="mt-2 text-xl font-bold tracking-tight text-gray-950 dark:text-white">{v.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-gray-600 dark:text-neutral-300">{v.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TodaysFive({ picks }: { picks: CommunityPick[] }) {
  if (!picks.length) return null;
  return (
    <section className="border-y border-gray-200 bg-white px-4 py-24 sm:px-6 sm:py-28 lg:px-8 dark:border-neutral-800 dark:bg-neutral-950/40">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className={eyebrow}>Live from the community</p>
          <h2 className={cn(h2, "mt-2")}>Today&apos;s five.</h2>
          <p className="mt-4 text-[17px] leading-relaxed text-balance text-gray-600 dark:text-neutral-300">
            Five favorites from real people, and why they love them. New every morning — here today, gone
            tomorrow.
          </p>
        </div>
        <ul className="no-scrollbar -mx-4 mt-14 flex snap-x snap-mandatory gap-6 overflow-x-auto px-4 pb-2 lg:mx-0 lg:grid lg:grid-cols-5 lg:overflow-visible lg:px-0">
          {picks.slice(0, 5).map((p) => {
            const href = itemHref({ canonical_id: p.item.canonical_id, item_id: p.item.id }, p.by.username) ?? "#";
            return (
              <li key={p.item.id} className="w-52 shrink-0 snap-start lg:w-auto">
                <Link href={href} className="group block outline-none">
                  <Framed item={p.item} sizes="200px" />
                  <p className="mt-4 truncate text-[15px] font-semibold text-gray-950 group-hover:underline dark:text-white">
                    {p.item.title}
                  </p>
                  {p.item.creator && <p className="truncate text-[13px] text-gray-500 dark:text-neutral-400">{p.item.creator}</p>}
                  <p className="mt-2.5 line-clamp-3 text-sm leading-relaxed text-gray-700 dark:text-neutral-300">
                    “{p.item.description.trim()}”
                  </p>
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-500 dark:text-neutral-400">
                    <Avatar p={p.by} className="size-4" /> {p.by.display_name?.split(" ")[0] || p.by.username}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="mx-auto max-w-xl">
          <NewsletterCTA />
        </div>
      </div>
    </section>
  );
}

/** a slice of the Friends page, with the old landing's people in it */
function FriendsDemo() {
  const parasite = c("film-parasite.jpg", "Parasite", "movie");
  const groups = [
    {
      who: { username: "ben", display_name: "Ben", avatar_url: "/benpic.jpg" },
      verb: "favorited a film",
      when: "2h",
      rows: [{ work: w(parasite, "Bong Joon-ho", "2019"), note: "the basement reveal genuinely got me." }],
    },
    {
      who: { username: "nigel", display_name: "Nigel", avatar_url: "/nigelpic.jpg" },
      verb: (
        <>
          made a new list, <span className="font-medium text-gray-700 underline underline-offset-2 dark:text-neutral-200">Long drives</span>
        </>
      ),
      when: "1d",
      rows: [
        { work: w(c("album-in-rainbows.jpg", "In Rainbows", "music"), "Radiohead", "2007"), note: "" },
        { work: w(c("album-the-new-abnormal.jpg", "The New Abnormal", "music"), "The Strokes", "2020"), note: "" },
      ],
    },
  ];
  return (
    <div className={cn(panel, "flex flex-col gap-6 p-5 sm:p-6")}>
      {groups.map((g) => (
        <div key={g.who.username}>
          <div className="flex items-center gap-3">
            <Avatar p={g.who} className="size-8" />
            <p className="min-w-0 flex-1 text-sm text-gray-500 dark:text-neutral-400">
              <span className="font-semibold text-gray-900 dark:text-neutral-100">{g.who.display_name}</span> {g.verb}
            </p>
            <span className="text-xs text-gray-400 dark:text-neutral-500">{g.when}</span>
          </div>
          <div className="mt-1 ml-[15px] border-l border-gray-200 pl-1.5 dark:border-neutral-700">
            {g.rows.map((r) => (
              <WorkRow key={r.work.title} work={r.work} href={null} note={r.note} actions={<></>} className="hover:bg-transparent" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Friends() {
  return (
    <section className="px-4 py-24 sm:px-6 sm:py-32 lg:px-8">
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2 lg:gap-20">
        <div>
          <p className={eyebrow}>Friends</p>
          <h2 className={cn(h2, "mt-2")}>See what your people are into.</h2>
          <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-gray-600 dark:text-neutral-300">
            Follow your friends and their favorites and saves land on one page — with who&apos;s following you, who
            favorited something from your wall, and people whose taste runs close to yours.
          </p>
        </div>
        <FriendsDemo />
      </div>
    </section>
  );
}

function Walls({ walls }: { walls: LandingWall[] }) {
  if (!walls.length) return null;
  return (
    <section className="px-4 pb-24 sm:px-6 sm:pb-32 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="max-w-2xl">
          <p className={eyebrow}>Walls already up</p>
          <h2 className={cn(h2, "mt-2")}>A few pages, live right now.</h2>
        </div>
        <ul className="mt-12 grid gap-10 sm:grid-cols-2 lg:grid-cols-3 lg:gap-12">
          {walls.map((wl) => (
            <li key={wl.who.id}>
              <Link href={`/${wl.who.username}`} className="group block outline-none">
                <div className="grid grid-cols-4 gap-3">
                  {wl.covers.map((cv) => (
                    <Framed key={cv.id} item={cv} sizes="90px" />
                  ))}
                </div>
                <div className="mt-5 flex items-center gap-3">
                  <Avatar p={wl.who} className="size-9" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-gray-950 group-hover:underline dark:text-white">
                      {wl.who.display_name || `@${wl.who.username}`}
                    </span>
                    <span className="block truncate text-[13px] text-gray-500 dark:text-neutral-400">
                      @{wl.who.username} · {wl.count} favorites
                    </span>
                  </span>
                  <ArrowRight className="size-4 shrink-0 text-gray-400 transition-transform group-hover:translate-x-0.5 group-hover:text-gray-900 dark:group-hover:text-white" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function Closing() {
  return (
    <section className="pt-8 pb-10">
      <div className="px-4 text-center">
        <h2 className={h2}>Taste is meant to be shared.</h2>
        <div className="mt-8">
          <Link href="/signin?mode=signup" className={bigButton}>
            Start your library
          </Link>
        </div>
        <p className="mt-4 text-sm text-gray-500 dark:text-neutral-400">Free, and it takes about a minute.</p>
      </div>
      <div aria-hidden className="mt-20 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
        <div className="landing-roll flex w-max gap-8">
          {[...ROLL, ...ROLL].map((cv, i) => (
            <div key={i} className="w-24 shrink-0 sm:w-28">
              <Framed item={cv} eager rush={false} sizes="112px" />
            </div>
          ))}
        </div>
      </div>
      <footer className="mt-16 flex items-center justify-center gap-4 text-xs text-gray-500 dark:text-neutral-400">
        <span className="flex items-center gap-1.5">
          <Star className="size-3.5 text-star" /> Favorite
        </span>
        <Link href="/privacy" className="hover:text-gray-900 dark:hover:text-neutral-100">
          Privacy
        </Link>
        <Link href="/terms" className="hover:text-gray-900 dark:hover:text-neutral-100">
          Terms
        </Link>
      </footer>
    </section>
  );
}

export default function Landing({ picks, walls }: { picks: CommunityPick[]; walls: LandingWall[] }) {
  return (
    <div className="overflow-x-clip">
      <Hero />
      <Verbs />
      <TodaysFive picks={picks} />
      <Friends />
      <Walls walls={walls} />
      <Closing />
    </div>
  );
}

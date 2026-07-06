"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { hashRange } from "@/lib/rand";
import { useSystemTheme } from "@/lib/use-system-theme";
import SiteFooter from "./SiteFooter";

/**
 * The signed-out front door at `/`. Every image is a real cover — pulled from
 * the owner's previous site — rendered in the app's own frames (vinyl sleeve,
 * book fore-edge, poster glass, screen bezel, polaroid). No generated assets.
 */

type MediaType = "music" | "book" | "movie" | "video" | "photo" | "podcast";

type Piece = { src: string; title: string; creator?: string; type: MediaType };

const piece = (file: string, title: string, creator: string, type: MediaType): Piece => ({
  src: `/landing/covers/${file}`,
  title,
  creator,
  type,
});

/* ── the hero constellation — scattered toward the edges, center stays airy ── */

type HeroPiece = Piece & {
  /** desktop position as percentages of the hero box */
  left?: string;
  right?: string;
  top: string;
  /** width clamp keeps pieces readable on laptops and sane on ultrawides */
  w: string;
  /** idle-float personality: duration + negative delay so pieces desync */
  dur: number;
  drift: number;
};

const HERO: HeroPiece[] = [
  // left cluster
  { ...piece("album-yeezus.jpg", "Yeezus", "Kanye West", "music"), left: "4%", top: "13%", w: "clamp(76px, 8.5vw, 148px)", dur: 7.3, drift: -1.8 },
  { ...piece("book-the-secret-history.jpg", "The Secret History", "Donna Tartt", "book"), left: "23%", top: "7%", w: "clamp(60px, 6.5vw, 112px)", dur: 8.1, drift: -4.2 },
  { ...piece("film-interstellar.jpg", "Interstellar", "Christopher Nolan", "movie"), left: "15%", top: "31%", w: "clamp(70px, 8vw, 138px)", dur: 6.4, drift: -0.6 },
  { ...piece("book-meditations.jpg", "Meditations", "Marcus Aurelius", "book"), left: "5%", top: "46%", w: "clamp(64px, 7vw, 120px)", dur: 7.8, drift: -3.1 },
  { ...piece("film-whiplash.jpg", "Whiplash", "Damien Chazelle", "movie"), left: "18%", top: "58%", w: "clamp(66px, 7.5vw, 128px)", dur: 6.9, drift: -5.0 },
  { ...piece("album-blonde.jpg", "Blonde", "Frank Ocean", "music"), left: "4%", top: "73%", w: "clamp(70px, 8vw, 138px)", dur: 8.4, drift: -2.4 },
  { ...piece("album-in-rainbows.jpg", "In Rainbows", "Radiohead", "music"), left: "29%", top: "77%", w: "clamp(62px, 7vw, 118px)", dur: 7.1, drift: -1.2 },
  // top band, above the headline
  { ...piece("book-1984.jpg", "1984", "George Orwell", "book"), left: "36%", top: "4%", w: "clamp(56px, 6vw, 104px)", dur: 7.7, drift: -2.7 },
  { ...piece("podcast-founders.jpg", "Founders", "David Senra", "podcast"), left: "46.5%", top: "11%", w: "clamp(62px, 7vw, 118px)", dur: 8.3, drift: -0.4 },
  { ...piece("film-pulp-fiction.jpg", "Pulp Fiction", "Quentin Tarantino", "movie"), right: "36%", top: "5%", w: "clamp(58px, 6.5vw, 110px)", dur: 6.8, drift: -4.4 },
  // right cluster
  { ...piece("film-2001-a-space-odyssey.jpg", "2001: A Space Odyssey", "Stanley Kubrick", "movie"), right: "24%", top: "6%", w: "clamp(60px, 6.5vw, 112px)", dur: 7.6, drift: -3.7 },
  { ...piece("podcast-httotw.jpg", "How to Take Over the World", "Ben Wilson", "podcast"), right: "4%", top: "12%", w: "clamp(76px, 8.5vw, 148px)", dur: 6.6, drift: -0.9 },
  { ...piece("film-the-dark-knight.jpg", "The Dark Knight", "Christopher Nolan", "movie"), right: "15%", top: "30%", w: "clamp(70px, 8vw, 138px)", dur: 8.0, drift: -4.6 },
  { ...piece("book-east-of-eden.jpg", "East of Eden", "John Steinbeck", "book"), right: "5%", top: "47%", w: "clamp(64px, 7vw, 120px)", dur: 7.4, drift: -2.0 },
  { ...piece("film-her.jpg", "Her", "Spike Jonze", "movie"), right: "18%", top: "59%", w: "clamp(66px, 7.5vw, 128px)", dur: 6.7, drift: -5.5 },
  { ...piece("album-californication.jpg", "Californication", "Red Hot Chili Peppers", "music"), right: "4%", top: "74%", w: "clamp(70px, 8vw, 138px)", dur: 8.2, drift: -1.5 },
  { ...piece("album-the-new-abnormal.jpg", "The New Abnormal", "The Strokes", "music"), right: "29%", top: "78%", w: "clamp(62px, 7vw, 118px)", dur: 7.0, drift: -3.4 },
];

/** on phones the constellation folds into two small rows around the headline */
const HERO_MOBILE_TOP = [0, 2, 3] as const; // Yeezus · Interstellar · Meditations
const HERO_MOBILE_BOTTOM = [12, 14, 5] as const; // The Dark Knight · Her · Blonde

/* ── beat 2: one of each frame ── */

const SHELF: { p: Piece; tag: string }[] = [
  { p: piece("album-wish-you-were-here.jpg", "Wish You Were Here", "Pink Floyd", "music"), tag: "Music" },
  { p: piece("book-brave-new-world.jpg", "Brave New World", "Aldous Huxley", "book"), tag: "Book" },
  { p: piece("film-marty-supreme.jpg", "Marty Supreme", "Josh Safdie", "movie"), tag: "Film" },
  { p: piece("video-do-more.jpg", "DO MORE", "Casey Neistat", "video"), tag: "Video" },
  { p: piece("photo-shelf.jpg", "Ali & Abdul", "", "photo"), tag: "Photo" },
];

/* ── beat 3: the social loop — a taste of the Following feed ── */

const FEED_DEMO: {
  name: string;
  avatar: string;
  phrase: string;
  when: string;
  tag: string;
  quote?: string;
  p: Piece;
}[] = [
  {
    name: "Ben",
    avatar: "/benpic.jpg",
    phrase: "favorited a film",
    when: "Jul 4",
    tag: "Film",
    quote: "the basement reveal genuinely got me.",
    p: piece("film-parasite.jpg", "Parasite", "Bong Joon-ho", "movie"),
  },
  {
    name: "Nigel",
    avatar: "/nigelpic.jpg",
    phrase: "favorited some music",
    when: "Jul 2",
    tag: "Music",
    p: piece("album-in-rainbows.jpg", "In Rainbows", "Radiohead", "music"),
  },
  {
    name: "Abdul",
    avatar: "/abdulpic.jpg",
    phrase: "favorited a book",
    when: "Jun 27",
    tag: "Book",
    quote: "bunny deserved it.",
    p: piece("book-the-secret-history.jpg", "The Secret History", "Donna Tartt", "book"),
  },
];

/* ── beat 4: the closing film strip ── */

// aspect ratios (intrinsic w / h) reserve each cover's width before the image
// loads — otherwise the max-content track starts collapsed on a cold cache and
// the strip jumps/gaps as images trickle in
const MARQUEE: (Piece & { ratio: string })[] = [
  { ...piece("film-oppenheimer.jpg", "Oppenheimer", "Christopher Nolan", "movie"), ratio: "404 / 600" },
  { ...piece("album-channel-orange.jpg", "channel ORANGE", "Frank Ocean", "music"), ratio: "1 / 1" },
  { ...piece("book-blood-meridian.jpg", "Blood Meridian", "Cormac McCarthy", "book"), ratio: "390 / 600" },
  { ...piece("film-parasite.jpg", "Parasite", "Bong Joon-ho", "movie"), ratio: "420 / 600" },
  { ...piece("album-igor.jpg", "IGOR", "Tyler, the Creator", "music"), ratio: "1 / 1" },
  { ...piece("film-the-social-network.jpg", "The Social Network", "David Fincher", "movie"), ratio: "400 / 600" },
  { ...piece("book-crime-and-punishment.jpg", "Crime and Punishment", "Fyodor Dostoevsky", "book"), ratio: "402 / 600" },
  { ...piece("album-currents.jpg", "Currents", "Tame Impala", "music"), ratio: "1 / 1" },
  { ...piece("film-uncut-gems.jpg", "Uncut Gems", "Safdie brothers", "movie"), ratio: "400 / 600" },
  { ...piece("podcast-lex-fridman.jpg", "Lex Fridman Podcast", "Lex Fridman", "podcast"), ratio: "1 / 1" },
  { ...piece("album-the-life-of-pablo.jpg", "The Life of Pablo", "Kanye West", "music"), ratio: "1 / 1" },
  { ...piece("film-city-of-god.jpg", "City of God", "Fernando Meirelles", "movie"), ratio: "400 / 600" },
  { ...piece("book-mans-search-for-meaning.jpg", "Man's Search for Meaning", "Viktor Frankl", "book"), ratio: "362 / 600" },
  { ...piece("album-chromakopia.jpg", "CHROMAKOPIA", "Tyler, the Creator", "music"), ratio: "1 / 1" },
  { ...piece("film-inception.jpg", "Inception", "Christopher Nolan", "movie"), ratio: "405 / 600" },
  { ...piece("book-sapiens.jpg", "Sapiens", "Yuval Noah Harari", "book"), ratio: "380 / 600" },
  { ...piece("podcast-acquired.jpg", "Acquired", "Gilbert & Rosenthal", "podcast"), ratio: "1 / 1" },
];

/* ── frame rendering — mirrors TileMedia's object-on-a-wall language ── */

const FRAME: Record<MediaType, string | null> = {
  book: "bookframe",
  movie: "posterframe",
  music: "vinylframe",
  video: "screenframe",
  photo: "polaroid",
  podcast: null,
};

/** same whisper-of-a-tilt rule as the library tiles */
function tiltOf(id: string): number {
  const h = hashRange(id);
  return Math.abs(h) < 0.6 ? 0 : h * 1.2;
}

function Framed({ p, eager }: { p: Piece; eager?: boolean }) {
  const frame = FRAME[p.type];
  const style = { "--tilt": `${tiltOf(p.src)}deg` } as React.CSSProperties;
  const img = (cls: string) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={p.src}
      alt={p.title}
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : undefined}
      decoding="async"
      className={cls}
    />
  );
  return (
    <div className="item-media relative flex aspect-square w-full items-center justify-center [container-type:inline-size]">
      {p.type === "photo" ? (
        <div className="polaroid item-media-img" style={style}>
          {img("block max-h-[75cqw] max-w-[75cqw] bg-zinc-100")}
        </div>
      ) : frame ? (
        <div className={`${frame} item-media-img`} style={style}>
          {img(
            `block ${frame === "vinylframe" ? "max-h-[86cqw] max-w-[86cqw]" : "max-h-[92cqw] max-w-[88cqw]"}`
          )}
        </div>
      ) : (
        <div className="item-media-img" style={style}>
          {img("block max-h-[86cqw] max-w-[86cqw] object-contain")}
        </div>
      )}
    </div>
  );
}

/** framed artwork + the library's rise-in hover caption */
function LandingTile({ p, eager }: { p: Piece; eager?: boolean }) {
  return (
    <div className="item-tile relative block">
      <Framed p={p} eager={eager} />
      <div className="item-label flex justify-center">
        <div className="item-label-inner text-center">
          <span className="item-name">{p.title}</span>
          {p.creator && <span className="item-sub">{p.creator}</span>}
        </div>
      </div>
    </div>
  );
}

/* ── entrance choreography ── */

const REVEAL_EASE = [0.2, 0, 0, 1] as const; // --ease-snap
const DRIFT_EASE = [0.16, 1, 0.3, 1] as const; // --ease-drift

function Reveal({
  delay,
  children,
  className,
  style,
}: {
  delay: number;
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <motion.div
      className={className}
      style={style}
      // negative insets on the settled state leave headroom so the hover
      // lift (and frame decorations) never get clipped by the reveal
      initial={{ clipPath: "inset(100% -20% -20% -20%)", y: 14 }}
      animate={{ clipPath: "inset(-20% -20% -20% -20%)", y: 0 }}
      transition={{ duration: 0.65, delay, ease: REVEAL_EASE }}
    >
      {children}
    </motion.div>
  );
}

/** headline words rise out of an overflow-hidden slot, one after another */
function RevealWords({ text, delay }: { text: string; delay: number }) {
  return (
    <>
      {text.split(" ").map((word, i, words) => (
        <span
          key={i}
          // spacing via margin: a trailing space would collapse inside the
          // inline-block, and an nbsp would kill wrapping between words
          className={`inline-block overflow-hidden align-bottom ${
            i < words.length - 1 ? "mr-[0.3em]" : ""
          }`}
        >
          <motion.span
            className="inline-block"
            initial={{ y: "110%" }}
            animate={{ y: 0 }}
            transition={{ duration: 0.75, delay: delay + i * 0.06, ease: DRIFT_EASE }}
          >
            {word}
          </motion.span>
        </span>
      ))}
    </>
  );
}

/* ── the page ── */

export default function Landing() {
  useSystemTheme();

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-30 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/favicon.svg" alt="Favorites" className="h-6 w-auto" />
          <Link
            href="/signin"
            className="text-xs text-zinc-400 transition-colors hover:text-zinc-900"
          >
            Sign in
          </Link>
        </div>
      </header>

      {/* ── beat 1: hero ── */}
      <section className="relative flex min-h-[calc(100svh-4.25rem)] flex-col items-center justify-center overflow-hidden px-5">
        {/* constellation — desktop */}
        <div className="pointer-events-none absolute inset-0 hidden md:block">
          {HERO.map((h, i) => (
            <Reveal
              key={h.src}
              delay={0.15 + i * 0.045}
              className="pointer-events-auto absolute"
              style={{ left: h.left, right: h.right, top: h.top, width: h.w }}
            >
              <div
                className="landing-float hover-fx"
                style={{ animationDuration: `${h.dur}s`, animationDelay: `${h.drift}s` }}
              >
                <LandingTile p={h} eager />
              </div>
            </Reveal>
          ))}
        </div>

        {/* constellation — phones: a small row above and below the headline */}
        <div className="flex w-full max-w-sm items-end justify-center gap-5 md:hidden">
          {HERO_MOBILE_TOP.map((idx, i) => {
            const h = HERO[idx];
            return (
              <Reveal key={h.src} delay={0.15 + i * 0.06} className="w-20">
                <div
                  className="landing-float"
                  style={{ animationDuration: `${h.dur}s`, animationDelay: `${h.drift}s` }}
                >
                  <Framed p={h} eager />
                </div>
              </Reveal>
            );
          })}
        </div>

        <div className="flex flex-col items-center py-14 text-center md:py-0">
          <h1 className="text-[28px] font-semibold leading-[1.15] tracking-tight text-zinc-900 sm:text-5xl">
            <RevealWords text="Your taste," delay={0.25} />
            <br />
            <RevealWords text="in one place." delay={0.37} />
          </h1>
          <motion.p
            className="mt-4 text-xs text-zinc-400 sm:text-sm"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.65, ease: DRIFT_EASE }}
          >
            Favorite is a library for everything you love.
          </motion.p>
          <motion.div
            className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:gap-5"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.8, ease: DRIFT_EASE }}
          >
            <Link
              href="/signin"
              className="flex h-9 items-center whitespace-nowrap bg-zinc-900 px-4 text-xs font-medium text-white transition-colors hover:bg-zinc-700"
            >
              Start your library
            </Link>
            <Link
              href="/abdulmir"
              className="whitespace-nowrap text-xs text-zinc-400 transition-colors hover:text-zinc-900"
            >
              explore mine →
            </Link>
          </motion.div>
        </div>

        <div className="flex w-full max-w-sm items-start justify-center gap-5 md:hidden">
          {HERO_MOBILE_BOTTOM.map((idx, i) => {
            const h = HERO[idx];
            return (
              <Reveal key={h.src} delay={0.35 + i * 0.06} className="w-20">
                <div
                  className="landing-float"
                  style={{ animationDuration: `${h.dur}s`, animationDelay: `${h.drift}s` }}
                >
                  <Framed p={h} eager />
                </div>
              </Reveal>
            );
          })}
        </div>
      </section>

      {/* ── beat 2: every kind of favorite ── */}
      <section className="mx-auto max-w-5xl px-5 py-28 sm:px-8 sm:py-36">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: REVEAL_EASE }}
          className="flex flex-col gap-1.5"
        >
          <h2 className="text-lg font-semibold leading-snug tracking-tight text-zinc-900">
            Every kind of favorite.
          </h2>
          <p className="text-xs text-zinc-400">
            From the film that changed you to the podcast you never miss.
          </p>
        </motion.div>

        <div className="hover-fx mt-14 grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-3 md:grid-cols-5">
          {SHELF.map(({ p, tag }, i) => (
            <motion.div
              key={p.src}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.55, delay: i * 0.07, ease: REVEAL_EASE }}
            >
              <div className="item-tile relative block">
                <Framed p={p} />
                <p className="mt-4 text-center text-[10px] uppercase tracking-[0.08em] text-zinc-400">
                  {tag}
                </p>
                <div className="item-label flex justify-center">
                  <div className="item-label-inner text-center">
                    <span className="item-name">{p.title}</span>
                    {p.creator && <span className="item-sub">{p.creator}</span>}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── beat 3: the social loop, shown as a slice of the Following feed ── */}
      <section className="mx-auto w-full max-w-lg px-5 pb-28 sm:px-8 sm:pb-36">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: REVEAL_EASE }}
          className="flex flex-col gap-1.5"
        >
          <h2 className="text-lg font-semibold leading-snug tracking-tight text-zinc-900">
            See what your people love.
          </h2>
          <p className="text-xs text-zinc-400">
            Follow your friends&rsquo; libraries, and get picks tuned to your taste every week.
          </p>
        </motion.div>

        <div className="mt-14 flex flex-col gap-12">
          {FEED_DEMO.map((row, i) => (
            <motion.div
              key={row.p.src}
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.55, delay: i * 0.07, ease: REVEAL_EASE }}
            >
              {/* who + when — same bones as the real Following feed */}
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden bg-zinc-100">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={row.avatar} alt="" loading="lazy" className="h-full w-full object-cover" />
                </div>
                <p className="min-w-0 flex-1 truncate text-xs text-zinc-400">
                  <span className="text-[13px] font-medium text-zinc-900">{row.name}</span>{" "}
                  {row.phrase}
                </p>
                <span className="shrink-0 text-[10px] uppercase tracking-[0.08em] text-zinc-400">
                  {row.when}
                </span>
              </div>
              <div className="mt-5 flex gap-4 border-l border-zinc-100 pl-6 sm:ml-4">
                <div className="w-24 shrink-0">
                  <Framed p={row.p} />
                </div>
                <div className="min-w-0 flex-1 self-center">
                  <span className="text-[10px] uppercase tracking-[0.08em] text-zinc-400">
                    {row.tag}
                  </span>
                  <h3 className="mt-0.5 truncate text-[13px] leading-snug tracking-[-0.01em] text-zinc-900">
                    {row.p.title}
                  </h3>
                  {row.p.creator && (
                    <p className="truncate text-xs text-zinc-400">{row.p.creator}</p>
                  )}
                  {row.quote && (
                    <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                      &ldquo;{row.quote}&rdquo;
                    </p>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ── beat 4: close ── */}
      <section className="pb-8 pt-16 sm:pt-24">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6, ease: REVEAL_EASE }}
          className="flex flex-col items-center px-5 text-center"
        >
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
            Taste is meant to be shared.
          </h2>
          <Link
            href="/signin"
            className="mt-7 flex h-9 items-center bg-zinc-900 px-4 text-xs font-medium text-white transition-colors hover:bg-zinc-700"
          >
            Start your library
          </Link>
        </motion.div>

        {/* the closing film strip — keeps rolling; covers lift with a caption on hover */}
        <div className="landing-marquee mt-20 overflow-hidden pb-16 pt-3 sm:mt-24">
          <div className="landing-marquee-track hover-fx">
            {[0, 1].map((copy) => (
              <div key={copy} className="flex shrink-0" aria-hidden={copy === 1}>
                {MARQUEE.map((p) => (
                  <div
                    key={`${copy}-${p.src}`}
                    className="item-tile relative mr-8 flex h-24 items-end sm:h-28"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={p.src}
                      alt={copy === 0 ? `${p.title} — ${p.creator}` : ""}
                      loading="lazy"
                      className="item-media-img block h-full w-auto object-contain"
                      style={{ aspectRatio: p.ratio }}
                    />
                    <div className="item-label absolute left-1/2 top-full w-max max-w-44 -translate-x-1/2 text-center">
                      <div className="item-label-inner">
                        <span className="item-name">{p.title}</span>
                        {p.creator && <span className="item-sub">{p.creator}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-20">
          <SiteFooter />
        </div>
      </section>
    </div>
  );
}

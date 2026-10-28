import Link from "next/link";
import { ArrowRight, Bookmark } from "lucide-react";
import type { Item, MediaType } from "@/lib/types";
import Framed from "../profile/Framed";
import NewsletterCTA from "../home/NewsletterCTA";
import Avatar from "../ui/Avatar";
import { bigButton } from "../ui/styles";

/*
 * The front door for visitors (members get Home): what this is, in one
 * screen. A line that says it, one example of it — a page, its Top four, a
 * save landing — and one button. The covers are the old landing's shelf.
 */

type Cover = Pick<Item, "id" | "media_type" | "title" | "image_url" | "view_url">;
const c = (file: string, title: string, media_type: MediaType): Cover => ({
  id: file,
  media_type,
  title,
  image_url: `/landing/covers/${file}`,
  view_url: null,
});

const FOUR = [
  c("album-blonde.jpg", "Blonde", "music"),
  c("book-the-secret-history.jpg", "The Secret History", "book"),
  c("film-her.jpg", "Her", "movie"),
  c("album-in-rainbows.jpg", "In Rainbows", "music"),
];

/** an example page — someone's taste, and something they just saved */
function Example() {
  return (
    <div aria-hidden className="relative pb-6 lg:pb-0">
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_30px_80px_rgba(0,0,0,0.12)] dark:border-neutral-800 dark:bg-neutral-800">
        <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3 dark:border-neutral-700/70">
          <span className="flex gap-1.5">
            {[0, 1, 2].map((i) => (
              <span key={i} className="size-2.5 rounded-full bg-gray-200 dark:bg-neutral-700" />
            ))}
          </span>
          <span className="mx-auto rounded-md bg-gray-100 px-3 py-1 text-xs text-gray-500 dark:bg-neutral-700/70 dark:text-neutral-400">
            myfavoriteapp.com/<span className="font-semibold text-gray-800 dark:text-neutral-200">maya</span>
          </span>
          <span className="w-[42px]" />
        </div>
        <div className="relative h-24 overflow-hidden sm:h-28">
          <div className="absolute -inset-10 flex scale-110 opacity-80 blur-2xl saturate-[1.6] dark:opacity-50">
            {FOUR.slice(0, 3).map((cv) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={cv.id} src={cv.image_url!} alt="" className="h-full min-w-0 flex-1 object-cover" />
            ))}
          </div>
          <div className="absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-b from-transparent to-white dark:to-neutral-800" />
        </div>
        <div className="relative px-6 pb-8 sm:px-8">
          <Avatar
            p={{ username: "maya", display_name: "Maya", avatar_url: null }}
            className="-mt-10 size-20 text-3xl ring-4 ring-white dark:ring-neutral-800"
          />
          <p className="mt-3 text-2xl font-bold tracking-tight text-gray-950 dark:text-white">Maya Ortiz</p>
          <p className="mt-0.5 text-sm text-gray-500 dark:text-neutral-400">Slow films, sad books, loud records.</p>
          <p className="mt-7 text-sm font-semibold text-gray-900 dark:text-neutral-100">Top four</p>
          <div className="mt-3 grid grid-cols-4 gap-4 sm:gap-6">
            {FOUR.map((cv) => (
              <Framed key={cv.id} item={cv} eager rush={false} sizes="(max-width: 639px) 22vw, 130px" />
            ))}
          </div>
        </div>
      </div>
      {/* the other half of the app: something saved for later */}
      <div className="absolute bottom-0 left-5 flex items-center gap-3 rounded-xl bg-gray-900 py-2 pr-4 pl-2 text-white shadow-[0_12px_40px_rgba(0,0,0,0.25)] lg:-bottom-6 lg:-left-8 dark:bg-neutral-100 dark:text-neutral-900">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/landing/covers/book-project-hail-mary.jpg" alt="" className="h-11 w-auto rounded-[3px]" />
        <span>
          <span className="flex items-center gap-1.5 text-xs text-white/70 dark:text-neutral-500">
            <Bookmark className="size-3" strokeWidth={2.4} /> Saved to Check later
          </span>
          <span className="block text-sm font-semibold">Project Hail Mary</span>
        </span>
      </div>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="flex min-h-[calc(100svh-64px)] flex-col">
      <section className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-14 px-4 pt-8 pb-16 sm:px-6 lg:grid-cols-[1fr_1.05fr] lg:gap-20 lg:px-8 lg:py-12">
        <div>
          <h1 className="text-[44px] font-bold leading-[1.02] tracking-[-0.045em] text-gray-950 sm:text-[64px] lg:text-[72px] dark:text-white">
            Your taste,
            <br />
            in one place.
          </h1>
          <p className="mt-6 max-w-md text-[17px] leading-relaxed text-gray-600 sm:text-lg dark:text-neutral-300">
            Keep a page of the books, films and music that made you. Save what you want to get to next. Find new
            favorites from people with taste.
          </p>
          <div className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
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
        <Example />
      </section>

      <footer className="border-t border-gray-200 px-4 py-8 dark:border-neutral-800">
        <NewsletterCTA compact />
        <p className="mt-6 flex items-center justify-center gap-4 text-xs text-gray-500 dark:text-neutral-400">
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

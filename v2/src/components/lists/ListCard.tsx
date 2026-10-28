import Link from "next/link";
import { Lock } from "lucide-react";
import ListCover from "../ListCover";

type CardList = {
  title: string;
  slug: string;
  is_public: boolean;
  updated_at: string;
  count: number;
  covers: string[];
  cover_image_url: string | null;
};

/** A list as a playlist tile: its cover, the title, "12 items · Private" — no box around it. */
export default function ListCard({ list, username, priority = false }: { list: CardList; username: string; priority?: boolean }) {
  return (
    <Link
      href={`/${username}/lists/${list.slug}`}
      prefetch={true}
      className="group block rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-4 focus-visible:ring-offset-gray-100 dark:focus-visible:ring-neutral-400 dark:focus-visible:ring-offset-neutral-900"
    >
      <div className="transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)] group-hover:-translate-y-0.5">
        <ListCover
          coverImage={list.cover_image_url}
          covers={list.covers}
          title={list.title}
          priority={priority}
          className="shadow-[0_1px_2px_rgba(0,0,0,0.06)] transition-shadow group-hover:shadow-[0_10px_30px_rgba(0,0,0,0.14)]"
        />
      </div>
      <h2 className="mt-3 truncate text-[15px] font-semibold tracking-tight text-gray-900 group-hover:underline dark:text-neutral-100">
        {list.title}
      </h2>
      <p className="mt-0.5 flex items-center gap-1 text-[13px] text-gray-500 dark:text-neutral-400">
        {list.count} {list.count === 1 ? "item" : "items"}
        {!list.is_public && (
          <>
            {" "}
            · <Lock className="size-3" aria-hidden /> Private
          </>
        )}
      </p>
    </Link>
  );
}

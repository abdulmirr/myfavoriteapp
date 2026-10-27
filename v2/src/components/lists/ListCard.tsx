import Link from "next/link";
import { Lock } from "lucide-react";
import ListCover from "../ListCover";
import { card, cn } from "../ui/styles";

type CardList = {
  title: string;
  slug: string;
  is_public: boolean;
  updated_at: string;
  count: number;
  covers: string[];
  cover_image_url: string | null;
};

/** antislop's list card: 16:9 cover, title, "N items · Public", "Updated …". */
export default function ListCard({ list, username, priority = false }: { list: CardList; username: string; priority?: boolean }) {
  return (
    <Link
      href={`/${username}/lists/${list.slug}`}
      prefetch={true}
      className={cn(
        card,
        "group flex h-full flex-col p-3.5 outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:focus-visible:ring-neutral-400"
      )}
    >
      <ListCover coverImage={list.cover_image_url} covers={list.covers} title={list.title} priority={priority} />
      <div className="mt-2.5 min-w-0">
        <h2 className="text-sm font-semibold leading-snug tracking-tight text-gray-900 sm:text-base dark:text-neutral-100">
          <span className="underline decoration-gray-300 underline-offset-2 sm:no-underline sm:group-hover:underline dark:decoration-neutral-600">
            {list.title}
          </span>
        </h2>
        <p className="mt-1 flex items-center gap-1 text-xs text-gray-500 dark:text-neutral-400">
          {list.count} {list.count === 1 ? "item" : "items"} ·{" "}
          {list.is_public ? (
            "Public"
          ) : (
            <>
              <Lock className="size-3" aria-hidden /> Private
            </>
          )}
        </p>
        <p className="mt-0.5 text-xs text-gray-500 dark:text-neutral-400">
          Updated{" "}
          <time dateTime={list.updated_at}>
            {new Date(list.updated_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
          </time>
        </p>
      </div>
    </Link>
  );
}

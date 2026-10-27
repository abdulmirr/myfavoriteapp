import Link from "next/link";
import type { FeedWork, Work } from "@/lib/types";
import { isNew, itemHref, metaLine, typeLabel } from "@/lib/work";
import { NaturalCover } from "./Cover";
import FavoriteButton from "./FavoriteButton";
import SaveButton from "./SaveButton";
import PeopleLine from "./PeopleLine";
import { card, cn, drawer } from "./ui/styles";

/**
 * antislop's archive card — the cover at its true shape, title, two meta
 * lines, and the actions bottom-right (🔖 save, ★ favorite) — with
 * Favorite's addition tucked underneath: who has it.
 */
export default function WorkCard({ work, priority = false }: { work: FeedWork; priority?: boolean }) {
  const href = itemHref(work) ?? "#";
  const meta = metaLine(work);
  return (
    <article className="relative">
      <div className={cn(card, "relative z-10 p-2.5 sm:p-4")}>
        <Link href={href} prefetch={true} className="group/resource block outline-none">
          <NaturalCover work={work} priority={priority} badge={isNew(work.first_at)} />
          <h3 className="line-clamp-2 pt-2.5 text-[13px] font-semibold leading-snug tracking-tight text-gray-900 sm:line-clamp-none sm:pt-3 sm:text-base dark:text-neutral-100">
            <span className="sm:group-hover/resource:underline">
              {work.title}
            </span>
          </h3>
        </Link>
        <div className="mt-0.5 flex items-end justify-between gap-2 sm:gap-3">
          <div className="min-w-0">
            {meta && <p className="truncate text-[11px] text-gray-500 sm:text-xs dark:text-neutral-400">{meta}</p>}
            <p className="mt-0.5 text-[11px] text-gray-500 sm:text-xs dark:text-neutral-400">{typeLabel(work)}</p>
          </div>
          <CardActions work={work} />
        </div>
      </div>
      <div className={cn(drawer, "px-2.5 pt-6 pb-2 sm:px-4")}>
        <PeopleLine work={work} />
      </div>
    </article>
  );
}

/** 🔖 then ★, bottom-right — the same pair on every card in the app. */
export function CardActions({ work }: { work: Work }) {
  return (
    <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
      <SaveButton work={work} className="max-sm:size-8" />
      <FavoriteButton work={work} className="max-sm:size-8" />
    </div>
  );
}

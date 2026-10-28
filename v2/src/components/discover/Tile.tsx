"use client";

import Link from "next/link";
import type { Work } from "@/lib/types";
import { isFavorited, listsHolding, useViewer } from "@/lib/viewer";
import { itemHref, typeLabel } from "@/lib/work";
import Framed from "../profile/Framed";
import { CardActions } from "../WorkCard";
import { cn } from "../ui/styles";

export type TileWork = Work & { work_key?: string | null; item_id?: string | null };

function To({
  href,
  className,
  hidden,
  children,
}: {
  href: string | null;
  className?: string;
  /** a second link to the same place, for the mouse only */
  hidden?: boolean;
  children: React.ReactNode;
}) {
  const a11y = hidden ? { "aria-hidden": true, tabIndex: -1 } : {};
  if (!href) return <div className={className}>{children}</div>;
  if (/^https?:/.test(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className} {...a11y}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} className={className} {...a11y}>
      {children}
    </Link>
  );
}

/**
 * Discover's card: the work in the wall's frame (vinyl, book, poster), title
 * and creator under it. 🔖 and ★ sit on a small pill over the corner — on
 * hover where there's a mouse, and always once it's saved or favorited; on
 * touch screens the work's page is one tap away.
 */
export default function Tile({
  work,
  href,
  priority = false,
  sizes = "(max-width: 639px) 38vw, 180px",
  who,
}: {
  work: TileWork;
  /** where it goes: the work's page by default; catalog finds link out (or nowhere) */
  href?: string | null;
  priority?: boolean;
  sizes?: string;
  /** the line under the title: who loves it */
  who?: React.ReactNode;
}) {
  const v = useViewer();
  const kept = isFavorited(v, work) || listsHolding(v, work).size > 0;
  const to = href === undefined ? itemHref(work) : href;
  return (
    <div className="@container min-w-0">
      <div className="group/tile group relative">
        <To href={to} hidden className="block outline-none">
          <Framed
            item={{
              id: work.work_key ?? `${work.media_type}:${work.title}`,
              media_type: work.media_type,
              title: work.title,
              image_url: work.image_url,
              view_url: work.view_url,
            }}
            eager={priority}
            sizes={sizes}
          />
        </To>
        <div
          className={cn(
            "absolute right-1 bottom-1 z-20 rounded-full bg-white/95 p-0.5 shadow-[0_2px_12px_rgba(0,0,0,0.18)] backdrop-blur-sm transition-opacity duration-150 dark:bg-neutral-800/95",
            kept
              ? "opacity-100"
              : "pointer-events-none opacity-0 group-hover/tile:pointer-events-auto group-hover/tile:opacity-100 group-focus-within/tile:pointer-events-auto group-focus-within/tile:opacity-100"
          )}
        >
          <CardActions work={work} />
        </div>
      </div>
      <To
        href={to}
        className="mt-2.5 block min-w-0 rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:focus-visible:ring-neutral-400"
      >
        <p className="truncate text-[13px] font-semibold leading-snug tracking-tight text-gray-900 hover:underline dark:text-neutral-100">
          {work.title}
        </p>
        <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-neutral-400">{work.creator || typeLabel(work)}</p>
      </To>
      {who}
    </div>
  );
}

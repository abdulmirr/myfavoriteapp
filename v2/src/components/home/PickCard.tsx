"use client";

import Link from "next/link";
import MaybeLink from "../ui/MaybeLink";
import { ExternalLink, X } from "lucide-react";
import type { ProfileLite, Work } from "@/lib/types";
import { itemHref, metaLine, typeLabel } from "@/lib/work";
import { StageCover } from "../Cover";
import { CardActions } from "../WorkCard";
import Avatar from "../ui/Avatar";
import { card, cn, noteTab } from "../ui/styles";

/**
 * antislop's home card: the note tab on top (an AI pick's hook, or a real
 * person's thought), the 16:9 media, the title with ↗ (goes to the source),
 * meta + 🔖 ★, then the "Key highlight" slot — "Why it's for you" for AI
 * picks, who favorited it for community picks.
 */
export default function PickCard({
  work,
  tab,
  reason,
  by,
  count = 0,
  onPass,
  priority = false,
}: {
  work: Work & { item_id?: string | null };
  tab: React.ReactNode;
  /** AI picks: why it fits this person (yellow highlight) */
  reason?: string;
  /** community picks: whose favorite this is */
  by?: ProfileLite;
  count?: number;
  /** AI picks: "Not for me" */
  onPass?: () => void;
  priority?: boolean;
}) {
  const inner = itemHref({ canonical_id: work.canonical_id, item_id: work.item_id ?? work.source_item_id });
  const href = work.view_url ?? inner;
  const external = !!work.view_url;
  const words = work.title.trim().split(" ");
  const last = words.pop();
  const meta = metaLine(work);


  return (
    <article className="relative">
      <div className={noteTab}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 whitespace-pre-wrap break-words text-sm font-medium text-gray-900 dark:text-neutral-100">
            {tab}
          </div>
          {onPass && (
            <button
              type="button"
              onClick={onPass}
              aria-label={`Not for me — don't suggest ${work.title} again`}
              title="Not for me"
              className="-mt-0.5 -mr-1.5 inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded-md text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-900 dark:text-neutral-500 dark:hover:bg-neutral-700 dark:hover:text-neutral-100"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      <div className={cn(card, "relative z-10 overflow-hidden")}>
        <div className="relative p-4">
          <div className="group/resource">
            <MaybeLink href={href} external={external} className="block transition-opacity hover:opacity-95">
              <StageCover work={work} priority={priority} />
            </MaybeLink>
            <div className="pt-3">
              <h2 className="text-base font-semibold leading-snug tracking-tight text-gray-900 sm:text-lg dark:text-neutral-100">
                <MaybeLink href={href} external={external} className="underline decoration-gray-300 underline-offset-2 sm:no-underline sm:group-hover/resource:underline dark:decoration-neutral-600">
                  {words.length > 0 && `${words.join(" ")} `}
                  <span className="whitespace-nowrap">
                    {last}
                    {external && (
                      <ExternalLink className="ml-1.5 inline size-3.5 -translate-y-px text-gray-400 dark:text-neutral-500" aria-hidden />
                    )}
                  </span>
                </MaybeLink>
              </h2>
            </div>
          </div>
          <div className="mt-1.5 flex items-end justify-between gap-3">
            <div className="min-w-0">
              {meta && <p className="truncate text-sm text-gray-500 dark:text-neutral-400">{meta}</p>}
              <p className="mt-0.5 text-sm text-gray-500 dark:text-neutral-400">{typeLabel(work)}</p>
            </div>
            <CardActions work={work} />
          </div>
        </div>
        {reason && (
          <div className="-mt-1 px-4 pb-4">
            <hr className="mb-3 border-t border-gray-100 dark:border-neutral-700" />
            <p className="text-sm leading-relaxed text-gray-600 dark:text-neutral-300">
              <span className="mb-1 block font-bold">Why it&apos;s for you:</span>
              <span className="bg-yellow-200 [box-decoration-break:clone] px-0.5 [-webkit-box-decoration-break:clone] dark:bg-yellow-500/30">
                {reason}
              </span>
            </p>
          </div>
        )}
        {by && (
          <div className="-mt-1 px-4 pb-4">
            <hr className="mb-3 border-t border-gray-100 dark:border-neutral-700" />
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-gray-600 dark:text-neutral-300">
              <Avatar p={by} className="size-5 text-[9px]" />
              <span>
                From{" "}
                <Link href={`/${by.username}`} className="font-semibold text-gray-900 hover:underline dark:text-neutral-100">
                  {by.display_name || `@${by.username}`}
                </Link>
                &apos;s favorites
                {count > 1 && inner && (
                  <>
                    {" · "}
                    <Link href={inner} className="underline underline-offset-2 hover:text-gray-900 dark:hover:text-neutral-100">
                      {count - 1} more {count - 1 === 1 ? "person loves" : "people love"} it
                    </Link>
                  </>
                )}
              </span>
            </p>
          </div>
        )}
      </div>
    </article>
  );
}

export function PickSkeleton() {
  return (
    <div aria-hidden>
      <div className="mx-2 -mb-4 h-[60px] rounded-t-2xl border border-b-0 border-gray-200 bg-gray-50 dark:border-neutral-700 dark:bg-neutral-800/60" />
      <div className="relative z-10 rounded-2xl border border-gray-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-800">
        <div className="aspect-video animate-pulse rounded-md bg-gray-200 dark:bg-neutral-700" />
        <div className="mt-4 h-5 w-3/5 animate-pulse rounded bg-gray-200 dark:bg-neutral-700" />
        <div className="mt-2 h-4 w-2/5 animate-pulse rounded bg-gray-200 dark:bg-neutral-700" />
      </div>
    </div>
  );
}

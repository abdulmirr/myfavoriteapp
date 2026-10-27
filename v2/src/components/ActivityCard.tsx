import Link from "next/link";
import MaybeLink from "./ui/MaybeLink";
import type { ProfileLite, Work } from "@/lib/types";
import { metaLine, typeLabel } from "@/lib/work";
import { StageCover } from "./Cover";
import { CardActions } from "./WorkCard";
import Avatar from "./ui/Avatar";
import { card, cn, inlineLink, noteTab } from "./ui/styles";

/**
 * antislop's activity card: a tab on top ("‹avatar› Abdul added to Check
 * later… · 8 Oct 2026") and a horizontal card — media left, title and meta
 * right, actions bottom-right. Phones stack media over text. A favorite's
 * thought or a list note reads inside the card.
 */
export default function ActivityCard({
  who,
  verb,
  date,
  work,
  href,
  external = false,
  note,
  tabExtra,
  priority = false,
}: {
  who: ProfileLite;
  /** the rest of the tab sentence after the name */
  verb: React.ReactNode;
  date?: string | null;
  work: Work;
  /** where the media + title go; external links open the source */
  href: string | null;
  external?: boolean;
  note?: string | null;
  /** owner controls at the tab's right edge (reorder) */
  tabExtra?: React.ReactNode;
  priority?: boolean;
}) {
  const meta = metaLine(work);
  const Media = <StageCover work={work} priority={priority} sizes="(max-width: 639px) 92vw, 224px" />;

  return (
    <article className="relative">
      <div className={noteTab}>
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 truncate text-xs text-gray-500 dark:text-neutral-400">
            <span className="group/who inline-flex min-w-0 items-baseline gap-1.5">
              <Link href={`/${who.username}`} aria-label={who.display_name || who.username} className="relative z-20 shrink-0 self-center">
                <Avatar p={who} className="size-4 text-[9px]" />
              </Link>
              <Link href={`/${who.username}`} className={inlineLink}>
                {who.display_name?.split(" ")[0] || who.username}
              </Link>
            </span>{" "}
            {verb}
          </p>
          <div className="flex shrink-0 items-center gap-1.5 text-xs text-gray-500 dark:text-neutral-400">
            {date && <time dateTime={date}>{new Date(date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</time>}
            {tabExtra}
          </div>
        </div>
      </div>
      <div className="relative z-10">
        <div className={cn(card, "relative flex flex-col gap-3 p-3.5 sm:flex-row sm:gap-4")}>
          <MaybeLink href={href} external={external} prefetch className="relative block w-full shrink-0 transition-opacity hover:opacity-90 sm:w-[36%] sm:max-w-56 sm:self-start">
            {Media}
          </MaybeLink>
          <div className="flex min-w-0 flex-1 flex-col">
            <h2 className="min-w-0 text-sm font-semibold leading-snug tracking-tight text-gray-900 sm:text-base dark:text-neutral-100">
              <MaybeLink href={href} external={external} prefetch className="underline decoration-gray-300 underline-offset-2 sm:no-underline sm:hover:underline dark:decoration-neutral-600">
                <span className="line-clamp-2">{work.title}</span>
              </MaybeLink>
            </h2>
            <div className="mt-1 flex items-end justify-between gap-3 sm:flex-col sm:items-stretch">
              <div className="min-w-0 sm:pr-24">
                {meta && <p className="truncate text-xs text-gray-500 dark:text-neutral-400">{meta}</p>}
                <p className="mt-0.5 truncate text-xs text-gray-500 dark:text-neutral-400">{typeLabel(work)}</p>
              </div>
              <div className="shrink-0 sm:absolute sm:right-3.5 sm:bottom-3.5">
                <CardActions work={work} />
              </div>
            </div>
            {note?.trim() && (
              <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-gray-600 sm:pr-24 dark:text-neutral-300">
                “{note.trim()}”
              </p>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

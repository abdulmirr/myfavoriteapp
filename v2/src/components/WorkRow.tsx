import { BookOpen, Film, Image as ImageIcon, Link2, Mic, Music, Play, Sparkles, Tv } from "lucide-react";
import type { MediaType, Work } from "@/lib/types";
import { thumbCover } from "@/lib/img";
import { metaLine, typeLabel } from "@/lib/work";
import MaybeLink from "./ui/MaybeLink";
import { CardActions } from "./WorkCard";
import { cn } from "./ui/styles";

const TYPE_ICON: Record<MediaType, typeof Music> = {
  music: Music,
  book: BookOpen,
  movie: Film,
  tv: Tv,
  podcast: Mic,
  video: Play,
  article: Link2,
  photo: ImageIcon,
  other: Sparkles,
};

/**
 * A cover in a square slot at its true shape — albums fill it, posters and
 * books stand in it, videos lie across it — so every row's text starts on
 * the same line and nothing is ever cropped. No artwork → a black tile with
 * the medium's icon (antislop's title card, shrunk to a thumbnail).
 */
export function RowCover({
  work,
  priority = false,
  dim = false,
  small = false,
}: {
  work: Work;
  priority?: boolean;
  dim?: boolean;
  /** 48px (search results) instead of a row's 56–64px */
  small?: boolean;
}) {
  const Icon = TYPE_ICON[work.media_type] ?? Sparkles;
  return (
    <span
      className={cn("flex shrink-0 items-center justify-center", small ? "size-12" : "size-14 sm:size-16", dim && "opacity-55")}
    >
      {work.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbCover(work.image_url, 200)}
          alt=""
          loading={priority ? "eager" : "lazy"}
          decoding="async"
          className={cn(
            "max-h-full max-w-full bg-gray-200 object-contain shadow-[0_1px_2px_rgba(0,0,0,0.12),0_4px_14px_rgba(0,0,0,0.08)] dark:bg-neutral-700",
            work.media_type === "book" ? "rounded-[2px]" : "rounded-[4px]"
          )}
        />
      ) : (
        <span className="flex size-full items-center justify-center rounded-[4px] bg-black text-white/70">
          <Icon className="size-5" />
        </span>
      )}
    </span>
  );
}

/**
 * One work as a line — a playlist row. Cover, title, "Creator · Year · Type",
 * an optional quoted note underneath, the actions on the right. The title's
 * link stretches over the whole row; anything interactive sits above it.
 * Used by list pages and the Friends timeline.
 */
export default function WorkRow({
  work,
  href,
  external = false,
  note,
  lead,
  aside,
  actions,
  dim = false,
  priority = false,
  className,
}: {
  work: Work;
  /** the item page (or the source, when external) */
  href: string | null;
  external?: boolean;
  note?: string | null;
  /** the left gutter: a rank number, a drag handle, a check */
  lead?: React.ReactNode;
  /** quiet text before the actions (an added date) */
  aside?: React.ReactNode;
  /** defaults to 🔖 ★ */
  actions?: React.ReactNode;
  /** finished items step back */
  dim?: boolean;
  priority?: boolean;
  className?: string;
}) {
  const meta = [metaLine(work), typeLabel(work)].filter(Boolean).join(" · ");
  return (
    <div
      className={cn(
        "group/row relative flex items-start gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-gray-900/[0.04] sm:gap-4 sm:px-3 dark:hover:bg-white/[0.04]",
        className
      )}
    >
      {lead !== undefined && (
        <div className="relative z-20 flex h-14 w-6 shrink-0 items-center justify-center sm:h-16 sm:w-7">{lead}</div>
      )}
      <RowCover work={work} priority={priority} dim={dim} />
      <div className="flex min-h-14 min-w-0 flex-1 flex-col justify-center sm:min-h-16">
        <h3
          className={cn(
            "text-[15px] font-semibold leading-snug tracking-tight",
            dim ? "text-gray-500 dark:text-neutral-400" : "text-gray-900 dark:text-neutral-100"
          )}
        >
          <MaybeLink
            href={href}
            external={external}
            prefetch={false}
            className="line-clamp-2 outline-none after:absolute after:inset-0 after:rounded-xl after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-gray-900 sm:group-hover/row:underline dark:focus-visible:after:ring-neutral-400"
          >
            {work.title}
          </MaybeLink>
        </h3>
        {meta && <p className="mt-0.5 truncate text-[13px] text-gray-500 dark:text-neutral-400">{meta}</p>}
        {note?.trim() && (
          <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-gray-600 dark:text-neutral-300">
            “{note.trim()}”
          </p>
        )}
      </div>
      <div className="flex h-14 shrink-0 items-center gap-2 sm:h-16 sm:gap-3">
        {aside && <span className="hidden text-xs text-gray-400 tabular-nums md:block dark:text-neutral-500">{aside}</span>}
        <div className="relative z-20 flex items-center gap-0.5 sm:gap-1">{actions ?? <CardActions work={work} />}</div>
      </div>
    </div>
  );
}

/** A loading row with the real one's shape. */
export function WorkRowSkeleton({ lead = false }: { lead?: boolean }) {
  return (
    <div className="flex items-center gap-3 px-2 py-2 sm:gap-4 sm:px-3" aria-hidden>
      {lead && <span className="w-6 sm:w-7" />}
      <span className="size-14 shrink-0 animate-pulse rounded-[4px] bg-gray-200 sm:size-16 dark:bg-neutral-800" />
      <span className="flex flex-1 flex-col gap-2">
        <span className="h-3.5 w-1/2 animate-pulse rounded bg-gray-200 dark:bg-neutral-800" />
        <span className="h-3 w-1/3 animate-pulse rounded bg-gray-200 dark:bg-neutral-800" />
      </span>
    </div>
  );
}

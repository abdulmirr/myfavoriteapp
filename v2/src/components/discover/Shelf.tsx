import type { DiscoverWork } from "@/lib/types";
import { cn } from "../ui/styles";
import Tile from "./Tile";

/** A row's name and its reason, with an optional picture in front. */
export function SectionHead({ title, sub, lead }: { title: React.ReactNode; sub?: React.ReactNode; lead?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3.5">
      {lead}
      <div className="min-w-0">
        <h2 className="text-lg font-semibold tracking-tight text-gray-900 sm:text-xl dark:text-neutral-100">{title}</h2>
        {sub && <p className="mt-0.5 text-sm text-gray-500 dark:text-neutral-400">{sub}</p>}
      </div>
    </div>
  );
}

// a dozen to swipe through on phones; six in a line on desktop, seven when wide
const slot = (i: number) =>
  cn(
    "w-[38vw] max-w-44 shrink-0 snap-start sm:w-[26vw] md:w-[20vw] lg:w-auto lg:max-w-none",
    i >= 6 && "lg:hidden",
    i === 6 && "xl:block"
  );
const track =
  "no-scrollbar -mx-4 mt-4 flex snap-x snap-mandatory scroll-px-4 gap-4 overflow-x-auto px-4 pt-1 pb-1 sm:-mx-6 sm:scroll-px-6 sm:px-6 lg:mx-0 lg:grid lg:grid-cols-6 lg:gap-6 lg:overflow-visible lg:px-0 xl:grid-cols-7";

/** A row of tiles under its reason. */
export default function Shelf({
  head,
  works,
  priority = false,
}: {
  head: React.ReactNode;
  works: DiscoverWork[];
  priority?: boolean;
}) {
  return (
    <section>
      {head}
      <div className={track}>
        {works.slice(0, 12).map((w, i) => (
          <div key={w.work_key} className={slot(i)}>
            <Tile work={w} priority={priority && i < 7} />
          </div>
        ))}
      </div>
    </section>
  );
}

const bone = "animate-pulse rounded bg-gray-200 dark:bg-neutral-800";

export function ShelfSkeleton() {
  return (
    <section aria-hidden>
      <div className={cn(bone, "h-6 w-56")} />
      <div className={cn(bone, "mt-2 h-4 w-72 max-w-full")} />
      <div className={cn(track, "overflow-hidden")}>
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className={slot(i)}>
            <div className={cn(bone, "aspect-square rounded-md")} />
            <div className={cn(bone, "mt-2.5 h-3.5 w-3/4")} />
            <div className={cn(bone, "mt-1.5 h-3 w-1/2")} />
          </div>
        ))}
      </div>
    </section>
  );
}

/** Browse's grid: three across on phones, eight on wide screens. */
export const grid = "grid grid-cols-3 gap-x-3 gap-y-7 sm:grid-cols-4 sm:gap-x-5 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8";

export function GridSkeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className={cn(grid, "mt-6")}>
      {Array.from({ length: 16 }, (_, i) => (
        <div key={i}>
          <div className={cn(bone, "aspect-square rounded-md")} />
          <div className={cn(bone, "mt-2.5 h-3.5 w-3/4")} />
          <div className={cn(bone, "mt-1.5 h-3 w-1/2")} />
        </div>
      ))}
    </div>
  );
}

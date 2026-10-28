"use client";

import Link from "next/link";
import type { SearchHits } from "@/lib/search";
import Avatar from "../ui/Avatar";
import { cn } from "../ui/styles";
import { GridSkeleton, grid } from "./Shelf";
import Tile from "./Tile";

/** Search results in Discover's shapes: people first, then works (yours included) and catalog finds as tiles. */
export default function DiscoverSearch({ results, searching }: { results: SearchHits | null; searching: boolean }) {
  if (!results) return <GridSkeleton label="Searching…" />;
  const { people, works, catalog } = results;
  if (!people.length && !works.length && !catalog.length) {
    return (
      <p className="py-16 text-center text-sm text-gray-500 dark:text-neutral-400">
        {searching ? "Searching…" : "No matches."}
      </p>
    );
  }
  return (
    <div className={cn("transition-opacity", searching && "opacity-60")}>
      {people.length > 0 && (
        <ul className="mb-10 flex flex-wrap gap-x-7 gap-y-4">
          {people.map((p) => (
            <li key={p.id}>
              <Link href={`/${p.username}`} className="group flex items-center gap-2.5 outline-none">
                <Avatar p={p} className="size-9" />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-gray-900 group-hover:underline dark:text-neutral-100">
                    {p.display_name || p.username}
                  </span>
                  <span className="block truncate text-xs text-gray-500 dark:text-neutral-400">@{p.username}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {works.length + catalog.length > 0 && (
        <div className={grid}>
          {works.map((w) => (
            <Tile key={`w:${w.work_key}`} work={w} sizes="(max-width: 639px) 31vw, (max-width: 1279px) 17vw, 160px" />
          ))}
          {catalog.map((r) => (
            // not on Favorite yet — no page of its own, so it links out
            <Tile
              key={`c:${r.media_type}:${r.source_id}`}
              work={{ ...r, year: r.year || null }}
              href={r.view_url}
              sizes="(max-width: 639px) 31vw, (max-width: 1279px) 17vw, 160px"
            />
          ))}
        </div>
      )}
    </div>
  );
}

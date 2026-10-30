"use client";

import Link from "next/link";
import { useState } from "react";
import type { ProfileLite } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { useViewer } from "@/lib/viewer";
import Avatar from "../ui/Avatar";

// who's who, shared by every line on the page: the newest three come with
// the works; the rest load on a first hover (most counts never get one)
const known = new Map<string, ProfileLite>();
async function load(ids: string[]): Promise<void> {
  const missing = ids.filter((id) => !known.has(id));
  if (!missing.length) return;
  const { data } = await supabase().from("profiles").select("id, username, display_name, avatar_url").in("id", missing);
  for (const p of (data ?? []) as ProfileLite[]) known.set(p.id, p);
}

/**
 * How many love it, under a tile — "12 favorites", a step quieter than the
 * creator above it. Hover it (where there's a mouse) and their faces appear
 * just underneath, small — people you follow first, then "+N" — over the gap
 * below the tile, so nothing moves. Each face goes to their page.
 */
export default function Who({ count, ids, people }: { count: number; ids: string[]; people: ProfileLite[] }) {
  const v = useViewer();
  const [shown, setShown] = useState<ProfileLite[] | null>(null);
  const reveal = () => {
    if (shown) return;
    for (const p of people) known.set(p.id, p);
    const me = v.profile?.id;
    const order = [...ids.filter((id) => v.followingIds.has(id)), ...ids.filter((id) => !v.followingIds.has(id))]
      .filter((id) => id !== me)
      .slice(0, 6);
    void load(order).then(() => setShown(order.map((id) => known.get(id)).filter((p): p is ProfileLite => !!p)));
  };
  const rest = count - (shown?.length ?? 0);
  return (
    <div onPointerEnter={reveal} onFocus={reveal} className="group/who relative mt-2 w-fit">
      <p className="cursor-default text-[11px] font-medium text-gray-400 tabular-nums transition-colors group-hover/who:text-gray-700 dark:text-neutral-500 dark:group-hover/who:text-neutral-300">
        {count} {count === 1 ? "favorite" : "favorites"}
      </p>
      <div className="pointer-events-none absolute top-full left-0 z-20 pt-1 opacity-0 transition-opacity duration-150 group-hover/who:pointer-events-auto group-hover/who:opacity-100 group-focus-within/who:pointer-events-auto group-focus-within/who:opacity-100">
        {shown === null ? (
          <span aria-hidden className="flex -space-x-1">
            {Array.from({ length: Math.min(count, 4) }, (_, i) => (
              <span key={i} className="size-4 animate-pulse rounded-[30%] bg-gray-200 ring-[1.5px] ring-gray-100 dark:bg-neutral-700 dark:ring-neutral-900" />
            ))}
          </span>
        ) : (
          <ul aria-label={`${count} ${count === 1 ? "person" : "people"} favorited this`} className="flex items-center">
            {shown.map((p, i) => (
              <li key={p.id} className={i > 0 ? "-ml-1" : undefined}>
                <Link href={`/${p.username}`} title={p.display_name || `@${p.username}`} className="relative block rounded-[30%] hover:z-10">
                  <Avatar p={p} className="size-4 text-[7px] ring-[1.5px] ring-gray-100 dark:ring-neutral-900" />
                </Link>
              </li>
            ))}
            {rest > 0 && (
              <li className="ml-1.5 text-[10px] font-medium text-gray-400 tabular-nums dark:text-neutral-500">+{rest}</li>
            )}
          </ul>
        )}
      </div>
    </div>
  );
}

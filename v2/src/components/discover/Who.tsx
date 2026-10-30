"use client";

import Link from "next/link";
import { useState } from "react";
import { HoverCard } from "radix-ui";
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
 * How many love it, under a tile: "12 favorites". Hover it (where there's a
 * mouse) and their faces open in a small card above — people you follow
 * first — each going to their page.
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
      .slice(0, 8);
    void load(order).then(() => setShown(order.map((id) => known.get(id)).filter((p): p is ProfileLite => !!p)));
  };
  return (
    <HoverCard.Root openDelay={120} closeDelay={80} onOpenChange={(o) => o && reveal()}>
      <HoverCard.Trigger asChild>
        <p onPointerEnter={reveal} className="mt-1.5 w-fit cursor-default text-xs text-gray-500 tabular-nums dark:text-neutral-400">
          {count} {count === 1 ? "favorite" : "favorites"}
        </p>
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          side="top"
          align="start"
          sideOffset={6}
          collisionPadding={12}
          className="hovercard-content z-50 w-max rounded-lg border border-gray-200 bg-white p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.10)] dark:border-neutral-700 dark:bg-neutral-800"
        >
          {/* one row: up to eight faces, then how many more */}
          {shown === null ? (
            <div aria-hidden className="flex gap-1">
              {Array.from({ length: Math.min(count, 4) }, (_, i) => (
                <span key={i} className="size-[22px] animate-pulse rounded-[30%] bg-gray-200 dark:bg-neutral-700" />
              ))}
            </div>
          ) : (
            <ul aria-label={`${count} ${count === 1 ? "person" : "people"} favorited this`} className="flex items-center gap-1">
              {shown.map((p) => (
                <li key={p.id}>
                  <Link
                    href={`/${p.username}`}
                    title={p.display_name || `@${p.username}`}
                    className="block rounded-[30%] transition-opacity hover:opacity-80"
                  >
                    <Avatar p={p} className="size-[22px] text-[10px]" />
                  </Link>
                </li>
              ))}
              {count > shown.length && (
                <li className="flex h-[22px] items-center px-1 text-[11px] font-medium text-gray-500 tabular-nums dark:text-neutral-400">
                  +{count - shown.length}
                </li>
              )}
            </ul>
          )}
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}

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

const first = (p: ProfileLite) => p.display_name?.split(" ")[0] || p.username;

/**
 * How many love it, under a tile — "12 favorites", a step quieter than the
 * creator above it. Hover it (where there's a mouse) and a small dark card
 * opens above: their faces, people you follow first, and "Ali and 10 more".
 * Each face goes to their page.
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
      .slice(0, 5);
    void load(order).then(() => setShown(order.map((id) => known.get(id)).filter((p): p is ProfileLite => !!p)));
  };
  // one line: "Ali and Sam" when it's the two of them, else "Ali and 10 more"
  const named = (shown ?? []).slice(0, count === 2 ? 2 : 1).map(first);
  const rest = count - named.length;
  return (
    <HoverCard.Root openDelay={120} closeDelay={80} onOpenChange={(o) => o && reveal()}>
      <HoverCard.Trigger asChild>
        <p
          onPointerEnter={reveal}
          className="mt-2 w-fit cursor-default text-[11px] font-medium text-gray-400 tabular-nums transition-colors hover:text-gray-700 dark:text-neutral-500 dark:hover:text-neutral-300"
        >
          {count} {count === 1 ? "favorite" : "favorites"}
        </p>
      </HoverCard.Trigger>
      <HoverCard.Portal>
        <HoverCard.Content
          side="top"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="hovercard-content z-50 flex max-w-64 items-center gap-2.5 rounded-lg bg-gray-950 py-1.5 pr-3 pl-1.5 text-white shadow-[0_12px_32px_rgba(0,0,0,0.22)] dark:bg-white dark:text-gray-950"
        >
          {shown === null ? (
            <span aria-hidden className="flex items-center gap-2.5">
              <span className="flex -space-x-1.5">
                {Array.from({ length: Math.min(count, 3) }, (_, i) => (
                  <span key={i} className="size-6 animate-pulse rounded-[30%] bg-white/15 ring-2 ring-gray-950 dark:bg-gray-950/10 dark:ring-white" />
                ))}
              </span>
              <span className="h-2.5 w-16 animate-pulse rounded bg-white/15 dark:bg-gray-950/10" />
            </span>
          ) : (
            <>
              <span className="flex shrink-0 -space-x-1.5">
                {shown.map((p) => (
                  <Link
                    key={p.id}
                    href={`/${p.username}`}
                    title={p.display_name || `@${p.username}`}
                    className="relative rounded-[30%] transition-transform hover:z-10 hover:-translate-y-px"
                  >
                    <Avatar p={p} className="size-6 text-[10px] ring-2 ring-gray-950 dark:ring-white" />
                  </Link>
                ))}
              </span>
              <span className="flex min-w-0 items-baseline gap-1 text-xs leading-snug whitespace-nowrap">
                <span className="max-w-32 truncate font-semibold">{named.join(" and ")}</span>
                {rest > 0 && <span className="shrink-0 text-white/60 dark:text-gray-500">and {rest} more</span>}
              </span>
            </>
          )}
          <HoverCard.Arrow width={10} height={5} className="fill-gray-950 dark:fill-white" />
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}

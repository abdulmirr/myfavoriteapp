"use client";

import type { ProfileLite } from "@/lib/types";
import { useViewer } from "@/lib/viewer";
import { AvatarStack } from "../ui/Avatar";

const first = (p: Pick<ProfileLite, "display_name" | "username">) => p.display_name?.split(" ")[0] || p.username;

/**
 * Who loves it, under a tile: how many, and a few of their faces — people
 * you follow first, since a pick from someone you know is the one worth a
 * look. Their names are a hover away.
 */
export default function Who({ count, ids, people }: { count: number; ids: string[]; people: ProfileLite[] }) {
  const v = useViewer();
  const me = v.profile?.id;
  const following = new Map(v.following.map((p) => [p.id, p]));
  const friends = ids.filter((id) => following.has(id)).map((id) => following.get(id)!);
  const faces = [...friends, ...people.filter((p) => p.id !== me && !following.has(p.id))].slice(0, 3);
  const others = count - faces.length;
  const names = faces.length ? `${faces.map(first).join(", ")}${others > 0 ? ` and ${others} more` : ""}` : "";
  return (
    <p
      title={names || undefined}
      className="relative mt-1.5 flex min-w-0 items-center gap-1.5 text-xs text-gray-500 tabular-nums dark:text-neutral-400"
    >
      <span className="sr-only">
        {count} {count === 1 ? "favorite" : "favorites"}
        {names && `: ${names}`}
      </span>
      <span aria-hidden>{count}</span>
      {faces.length > 0 && (
        <span aria-hidden className="flex shrink-0">
          <AvatarStack people={faces} ring="ring-2 ring-gray-100 dark:ring-neutral-900" />
        </span>
      )}
    </p>
  );
}

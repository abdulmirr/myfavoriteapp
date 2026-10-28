"use client";

import type { ProfileLite } from "@/lib/types";
import { useViewer } from "@/lib/viewer";
import { AvatarStack } from "../ui/Avatar";
import Star from "../ui/Star";

const first = (p: Pick<ProfileLite, "display_name" | "username">) => p.display_name?.split(" ")[0] || p.username;

/**
 * Who loves it, under a tile: how many (★), a few faces, and by name the
 * people you follow among them. They come first — a pick from someone you
 * know is the one worth a look. Everyone's name is a hover away; names give
 * way on narrow tiles, the count and the faces stay.
 */
export default function Who({ count, ids, people }: { count: number; ids: string[]; people: ProfileLite[] }) {
  const v = useViewer();
  const me = v.profile?.id;
  const following = new Map(v.following.map((p) => [p.id, p]));
  const friends = ids.filter((id) => following.has(id)).map((id) => following.get(id)!);
  const faces = [...friends, ...people.filter((p) => p.id !== me && !following.has(p.id))].slice(0, 3);
  const names = friends.length
    ? friends.slice(0, 2).map(first).join(", ") + (friends.length > 2 ? ` +${friends.length - 2}` : "")
    : "";
  const others = count - faces.length;
  const hover = faces.length
    ? `${faces.map(first).join(", ")}${others > 0 ? ` and ${others} more` : ""}`
    : undefined;
  return (
    <p
      title={hover}
      className="relative mt-1.5 flex min-w-0 items-center gap-1.5 text-xs text-gray-500 dark:text-neutral-400"
    >
      <span className="sr-only">
        {count} {count === 1 ? "favorite" : "favorites"}
        {names && `, including ${names}`}
      </span>
      <span aria-hidden className="flex shrink-0 items-center gap-1 tabular-nums">
        <Star className="size-3 text-star" />
        {count}
      </span>
      {faces.length > 0 && (
        <span aria-hidden className="flex shrink-0">
          <AvatarStack people={faces} ring="ring-2 ring-gray-100 dark:ring-neutral-900" />
        </span>
      )}
      {names && (
        <span aria-hidden className="hidden min-w-0 truncate font-medium text-gray-700 @min-[8.5rem]:inline dark:text-neutral-200">
          {names}
        </span>
      )}
    </p>
  );
}

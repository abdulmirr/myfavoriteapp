"use client";

import Link from "next/link";
import type { FeedWork, Profile, ProfileLite } from "@/lib/types";
import { useViewer } from "@/lib/viewer";
import { AvatarStack } from "./ui/Avatar";

type Person = Pick<ProfileLite, "id" | "username" | "display_name" | "avatar_url">;

const nameOf = (p: Person) => p.display_name?.split(" ")[0] || p.username;

function Names({ people, extra, suffix }: { people: Person[]; extra: number; suffix?: string }) {
  return (
    <>
      {people.map((p, i) => (
        <span key={p.id}>
          {i > 0 && (i === people.length - 1 && extra === 0 ? " and " : ", ")}
          <Link
            href={`/${p.username}`}
            className="relative z-20 font-medium text-gray-700 hover:text-gray-900 hover:underline dark:text-neutral-200 dark:hover:text-white"
          >
            {nameOf(p)}
          </Link>
        </span>
      ))}
      {extra > 0 && ` & ${extra} more`}
      {suffix}
    </>
  );
}

/**
 * Who has this — the drawer under every feed card. People you follow come
 * first ("Favorited by sam and alex", "Saved by jo"); if none of them have
 * it, whoever does ("Favorited by ali & 3 more"). Always one line, so the
 * card never changes height when your follows load in.
 */
export default function PeopleLine({ work }: { work: FeedWork }) {
  const v = useViewer();
  const following = new Map<string, Profile>(v.following.map((p) => [p.id, p]));
  const me = v.profile?.id;

  const friendFavs = work.favoriter_ids.filter((id) => following.has(id)).map((id) => following.get(id)!);
  const friendSaves = work.saver_ids
    .filter((id) => following.has(id) && !work.favoriter_ids.includes(id))
    .map((id) => following.get(id)!);
  const youFav = !!me && work.favoriter_ids.includes(me);

  let avatars: Person[];
  let line: React.ReactNode;

  if (friendFavs.length) {
    const shown = friendFavs.slice(0, 2);
    const extra = friendFavs.length - shown.length;
    avatars = friendFavs;
    line = (
      <>
        Favorited by {youFav && "you, "}
        <Names people={shown} extra={extra} />
        {friendSaves.length > 0 && `, saved by ${friendSaves.length}`}
      </>
    );
  } else if (friendSaves.length) {
    const shown = friendSaves.slice(0, 2);
    avatars = friendSaves;
    line = (
      <>
        Saved by <Names people={shown} extra={friendSaves.length - shown.length} />
      </>
    );
  } else {
    const others = work.top_profiles.filter((p) => p.id !== me);
    const shown = others.slice(0, 1);
    const extra = Math.max(0, work.fav_count - (youFav ? 1 : 0) - shown.length);
    avatars = others;
    line = shown.length ? (
      <>
        Favorited by {youFav && "you, "}
        <Names people={shown} extra={extra} />
      </>
    ) : (
      <>Favorited by you</>
    );
  }

  return (
    <p className="flex min-w-0 items-center gap-1.5 text-[11px] leading-5 text-gray-500 sm:gap-2 sm:text-xs dark:text-neutral-400">
      {avatars.length > 0 && <AvatarStack people={avatars} />}
      <span className="min-w-0 truncate">{line}</span>
    </p>
  );
}

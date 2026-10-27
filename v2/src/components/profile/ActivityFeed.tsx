"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { ActivityEvent } from "@/lib/data";
import type { ProfileLite, Work } from "@/lib/types";
import { itemHref } from "@/lib/work";
import ActivityCard from "../ActivityCard";
import { inlineLink } from "../ui/styles";

function toWork(e: ActivityEvent): Work {
  const it = e.item;
  return {
    media_type: it.media_type,
    title: it.title,
    creator: it.creator,
    image_url: it.image_url,
    view_url: it.view_url,
    year: it.metadata?.year != null ? String(it.metadata.year) : null,
    canonical_id: it.canonical_id,
    metadata: it.metadata,
    // favoriting from someone's activity credits them ("via @…")
    ...(e.kind === "favorite" ? { source_item_id: it.id, source_profile_id: it.profile_id } : {}),
  };
}

/** A person's timeline — favorites and public-list adds — paging as you scroll. */
export default function ActivityFeed({
  who,
  initial,
  hasMore: initialMore,
}: {
  who: ProfileLite;
  initial: ActivityEvent[];
  hasMore: boolean;
}) {
  const [events, setEvents] = useState(initial);
  const [hasMore, setHasMore] = useState(initialMore);
  const loading = useRef(false);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!hasMore) return;
    const el = sentinel.current;
    const last = events.at(-1)?.at;
    if (!el || !last) return;
    const io = new IntersectionObserver(
      (e) => {
        if (!e[0]?.isIntersecting || loading.current) return;
        loading.current = true;
        fetch(`/api/activity?profile=${who.id}&before=${encodeURIComponent(last)}`)
          .then((r) => (r.ok ? r.json() : { events: [], hasMore: false }))
          .then((page: { events: ActivityEvent[]; hasMore: boolean }) => {
            setEvents((prev) => [...prev, ...page.events]);
            setHasMore(page.hasMore);
          })
          .catch(() => setHasMore(false))
          .finally(() => {
            loading.current = false;
          });
      },
      { rootMargin: "500px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [events, hasMore, who.id]);

  if (!events.length) {
    return <p className="px-1 py-8 text-center text-sm text-gray-500 dark:text-neutral-400">Nothing here yet.</p>;
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      {events.map((e, i) => {
        const work = toWork(e);
        const internal = e.kind === "favorite" ? itemHref({ canonical_id: e.item.canonical_id, item_id: e.item.id }, who.username) : e.item.canonical_id ? itemHref({ canonical_id: e.item.canonical_id }) : null;
        return (
          <ActivityCard
            key={`${e.kind}:${e.item.id}`}
            who={who}
            verb={
              e.kind === "favorite" ? (
                "favorited…"
              ) : (
                <>
                  added to{" "}
                  <Link href={`/${who.username}/lists/${e.list.slug}`} className={inlineLink}>
                    {e.list.title}
                  </Link>
                  …
                </>
              )
            }
            date={e.at}
            work={work}
            href={internal ?? e.item.view_url}
            external={!internal}
            note={e.kind === "favorite" ? e.item.description : e.item.note}
            priority={i < 2}
          />
        );
      })}
      {hasMore && <div ref={sentinel} aria-hidden className="h-px w-full" />}
    </div>
  );
}

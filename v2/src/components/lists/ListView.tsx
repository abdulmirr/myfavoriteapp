"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, Lock, Pencil } from "lucide-react";
import type { ListItem, ListSummary, ProfileLite, Work } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { listsHolding, revalidate, useViewer } from "@/lib/viewer";
import { itemHref } from "@/lib/work";
import ActivityCard from "../ActivityCard";
import { ShareLinkButton } from "../profile/ProfileActions";
import { toast } from "../ui/Toast";
import { card, cn, quietButton } from "../ui/styles";

const EditListDialog = dynamic(() => import("./EditListDialog"));

function toWork(it: ListItem): Work {
  return {
    media_type: it.media_type,
    title: it.title,
    creator: it.creator,
    image_url: it.image_url,
    view_url: it.view_url,
    year: it.metadata?.year != null ? String(it.metadata.year) : null,
    canonical_id: it.canonical_id,
    work_key: it.work_key,
    metadata: it.metadata,
  };
}

const smallIcon =
  "relative z-20 inline-flex size-6 cursor-pointer items-center justify-center rounded-md text-gray-500 transition-colors hover:bg-gray-200 hover:text-gray-900 disabled:opacity-30 dark:hover:bg-neutral-700 dark:hover:text-neutral-100";

/** antislop's list page: a header card, then the items as activity cards. */
export default function ListView({
  list: initialList,
  owner,
  items: initialItems,
}: {
  list: ListSummary;
  owner: ProfileLite;
  items: ListItem[];
}) {
  const v = useViewer();
  const own = v.status === "signed-in" && v.profile?.id === owner.id;
  const [list, setList] = useState(initialList);
  const [items, setItems] = useState(initialItems);
  const [editing, setEditing] = useState(false);
  const [reordering, setReordering] = useState(false);

  // the owner's own removals (via the save dialog) take effect immediately —
  // only once the store has fully loaded this list, so an empty store never
  // hides everything
  const live = own && !v.stale && v.lists.some((l) => l.id === list.id);
  const shown = useMemo(
    () => (live ? items.filter((it) => listsHolding(v, toWork(it)).has(list.id)) : items),
    [live, items, v, list.id]
  );

  const move = async (i: number, dir: -1 | 1) => {
    const a = shown[i];
    const b = shown[i + dir];
    if (!a || !b) return;
    const next = items.map((it) =>
      it.id === a.id ? { ...it, position: b.position } : it.id === b.id ? { ...it, position: a.position } : it
    );
    next.sort((x, y) => x.position - y.position);
    setItems(next);
    const db = supabase();
    const [r1, r2] = await Promise.all([
      db.from("list_items").update({ position: b.position }).eq("id", a.id),
      db.from("list_items").update({ position: a.position }).eq("id", b.id),
    ]);
    if (r1.error || r2.error) {
      toast("Couldn't save the new order — try again.");
      setItems(items);
      return;
    }
    revalidate([`list:${list.id}`, `profile:${owner.id}`]);
  };

  const date = (iso: string) =>
    new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

  return (
    <div className="space-y-5 sm:space-y-6">
      <div className={cn(card, "overflow-hidden")}>
        <header className="relative px-4 py-4 sm:px-6 sm:py-6">
          <div className="pr-0 sm:pr-48">
            <h1 className="text-xl font-semibold leading-tight tracking-tight text-gray-900 sm:text-2xl dark:text-neutral-100">
              {list.title}
            </h1>
            <p className="mt-1 text-sm text-gray-700 dark:text-neutral-300">
              by{" "}
              <Link
                href={`/${owner.username}`}
                className="font-medium text-gray-900 underline decoration-gray-300 underline-offset-4 hover:decoration-gray-900 dark:text-neutral-100 dark:decoration-neutral-600 dark:hover:decoration-neutral-100"
              >
                @{owner.username}
              </Link>
            </p>
          </div>
          {list.description?.trim() && (
            <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-gray-700 dark:text-neutral-300">
              {list.description.trim()}
            </p>
          )}
          <p className="mt-4 flex items-center gap-1 text-xs text-gray-500 dark:text-neutral-400">
            {shown.length} {shown.length === 1 ? "item" : "items"} ·{" "}
            {list.is_public ? (
              "Public"
            ) : (
              <>
                <Lock className="size-3" aria-hidden /> Private
              </>
            )}
          </p>
          <p className="mt-0.5 text-xs text-gray-500 dark:text-neutral-400">
            Last updated <time dateTime={list.updated_at}>{date(list.updated_at)}</time>
          </p>
          <div className="mt-4 flex gap-1.5 sm:absolute sm:top-4 sm:right-4 sm:mt-0">
            {own && (
              <>
                {shown.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setReordering((r) => !r)}
                    aria-pressed={reordering}
                    className={cn(quietButton, "h-9", reordering && "bg-gray-900 text-white hover:bg-gray-800 dark:bg-neutral-100 dark:text-neutral-900")}
                  >
                    <ArrowUpDown className="size-4" /> {reordering ? "Done" : "Reorder"}
                  </button>
                )}
                <button type="button" onClick={() => setEditing(true)} className={cn(quietButton, "h-9")}>
                  <Pencil className="size-4" /> Edit
                </button>
              </>
            )}
            {list.is_public && <ShareLinkButton path={`/${owner.username}/lists/${list.slug}`} />}
          </div>
        </header>
      </div>

      <div className="flex flex-col gap-4 sm:gap-5">
        {shown.map((it, i) => {
          const work = toWork(it);
          const internal = it.canonical_id ? itemHref({ canonical_id: it.canonical_id }) : null;
          return (
            <ActivityCard
              key={it.id}
              who={owner}
              verb={list.show_added ? <>added <time dateTime={it.created_at}>on {date(it.created_at)}</time>…</> : "added…"}
              work={work}
              href={internal ?? it.view_url}
              external={!internal}
              note={it.note}
              priority={i < 2}
              tabExtra={
                own && reordering ? (
                  <span className="flex items-center gap-0.5">
                    <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className={smallIcon}>
                      <ArrowUp className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Move down"
                      disabled={i === shown.length - 1}
                      onClick={() => move(i, 1)}
                      className={smallIcon}
                    >
                      <ArrowDown className="size-3.5" />
                    </button>
                  </span>
                ) : null
              }
            />
          );
        })}
      </div>
      {shown.length === 0 && (
        <p className="px-1 py-8 text-center text-sm text-gray-500 dark:text-neutral-400">
          {own ? "This list is empty — tap 🔖 on anything to save it here." : "This list is empty."}
        </p>
      )}
      {editing && (
        <EditListDialog
          list={list}
          open={editing}
          onOpenChange={setEditing}
          onSaved={(patch) => setList((l) => ({ ...l, ...patch }))}
        />
      )}
    </div>
  );
}

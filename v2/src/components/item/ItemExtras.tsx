"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Pin, PinOff, Plus } from "lucide-react";
import type { Item, ProfileLite, Work } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { myItemId, revalidate, useViewer } from "@/lib/viewer";
import { dayStamp } from "@/lib/work";
import Avatar from "../ui/Avatar";
import { toast } from "../ui/Toast";
import { cn } from "../ui/styles";

const ThoughtDialog = dynamic(() => import("../ThoughtDialog"));

type Fav = Item & { profile: ProfileLite };

const chip =
  "inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-gray-700 outline-none transition-colors hover:bg-gray-900/5 hover:text-gray-900 focus-visible:ring-2 focus-visible:ring-gray-900 disabled:cursor-default disabled:opacity-50 dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-white";

/**
 * Your own line in "Favorited by", first: your thought (or a prompt to write
 * one) and the Top four pin, right where everyone else's thoughts are — it
 * replaces the old "On your wall" bar.
 */
export function YourEntry({ work }: { work: Work }) {
  const v = useViewer();
  const id = myItemId(v, work);
  const real = !!id && id !== "pending";
  const [row, setRow] = useState<{ id: string; description: string; created_at: string; pinned_order: number | null } | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!real) return;
    let stale = false;
    supabase()
      .from("items")
      .select("id, description, created_at, pinned_order")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => !stale && setRow((data as typeof row) ?? null));
    return () => {
      stale = true;
    };
  }, [real, id]);

  if (!id || !v.profile) return null;
  const mine = row && row.id === id ? row : null;
  const thought = mine?.description?.trim();

  const togglePin = async () => {
    if (busy || !mine || !v.profile) return;
    setBusy(true);
    try {
      const db = supabase();
      if (mine.pinned_order) {
        const { error } = await db.from("items").update({ pinned_order: null }).eq("id", mine.id);
        if (error) throw error;
        setRow({ ...mine, pinned_order: null });
        toast("Unpinned from your Top four");
      } else {
        const { data } = await db
          .from("items")
          .select("pinned_order")
          .eq("profile_id", v.profile.id)
          .not("pinned_order", "is", null);
        const used = new Set(((data ?? []) as { pinned_order: number }[]).map((r) => r.pinned_order));
        const slot = [1, 2, 3, 4].find((s) => !used.has(s));
        if (!slot) {
          toast("Your Top four is full — unpin one first.");
          return;
        }
        const { error } = await db.from("items").update({ pinned_order: slot }).eq("id", mine.id);
        if (error) throw error;
        setRow({ ...mine, pinned_order: slot });
        toast("Pinned to your Top four");
      }
      revalidate([`profile:${v.profile.id}`]);
    } catch {
      toast("Couldn't update — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex gap-3 py-4 sm:gap-4">
      <Avatar p={v.profile} className="size-10" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p className="min-w-0 flex-1 text-sm text-gray-500 dark:text-neutral-400">
            <span className="font-semibold text-gray-900 dark:text-neutral-100">You</span>
            {mine && <> · {dayStamp(mine.created_at)}</>}
          </p>
          <button type="button" onClick={togglePin} disabled={busy || !mine} className={cn(chip, "-my-1")}>
            {mine?.pinned_order ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
            {mine?.pinned_order ? "Unpin" : "Pin to Top four"}
          </button>
        </div>
        {thought ? (
          <p className="mt-1 text-[15px] leading-relaxed whitespace-pre-line text-gray-800 dark:text-neutral-200">
            “{thought}”{" "}
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="cursor-pointer text-sm font-semibold text-gray-500 underline-offset-2 hover:text-gray-900 hover:underline dark:text-neutral-400 dark:hover:text-neutral-100"
            >
              Edit
            </button>
          </p>
        ) : (
          <button
            type="button"
            onClick={() => setEditing(true)}
            disabled={!mine}
            className="mt-1 inline-flex cursor-pointer items-center gap-1 text-[15px] text-gray-500 hover:text-gray-900 disabled:cursor-default dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            <Plus className="size-4" /> Add your thought — what makes it one of yours?
          </button>
        )}
      </div>
      {editing && mine && (
        <ThoughtDialog
          itemId={mine.id}
          title={work.title}
          open={editing}
          onOpenChange={setEditing}
          onSaved={(text) => {
            setRow({ ...mine, description: text });
            revalidate([`work:${work.work_key ?? work.canonical_id ?? ""}`]);
          }}
        />
      )}
    </div>
  );
}

/**
 * Everyone who has it. People who wrote something get a line each, newest
 * first — `?from=` (the wall you came from) leads, then people you follow;
 * the rest gather as faces, under "And N more" when lines come before them
 * (the heading has already counted everyone). Your own copy is YourEntry, so
 * it's left out here.
 */
export function FavoritedBy({ favorites }: { favorites: Fav[] }) {
  const from = useSearchParams().get("from");
  return <FavoritedList favorites={favorites} from={from} />;
}

export function FavoritedList({ favorites, from = null }: { favorites: Fav[]; from?: string | null }) {
  const v = useViewer();
  const me = v.profile?.id;
  const rank = (f: Fav) => (f.profile.username === from ? 0 : v.followingIds.has(f.profile_id) ? 1 : 2);
  const others = favorites
    .filter((f) => f.profile_id !== me)
    .map((f, i) => ({ f, i }))
    .sort((a, b) => rank(a.f) - rank(b.f) || a.i - b.i)
    .map((x) => x.f);
  const said = others.filter((f) => f.description?.trim());
  const quiet = others.filter((f) => !f.description?.trim());
  const after = said.length > 0 || others.length < favorites.length;

  return (
    <>
      {said.map((f) => (
        <article key={f.id} className="flex gap-3 py-4 sm:gap-4">
          <Link href={`/${f.profile.username}`} aria-label={f.profile.display_name || f.profile.username} className="shrink-0">
            <Avatar p={f.profile} className="size-10" />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-gray-500 dark:text-neutral-400">
              <Link href={`/${f.profile.username}`} className="font-semibold text-gray-900 hover:underline dark:text-neutral-100">
                {f.profile.display_name || `@${f.profile.username}`}
              </Link>{" "}
              · <time dateTime={f.created_at}>{dayStamp(f.created_at)}</time>
            </p>
            <p className="mt-1 text-[15px] leading-relaxed whitespace-pre-line text-gray-800 dark:text-neutral-200">
              “{f.description.trim()}”
            </p>
          </div>
        </article>
      ))}
      {quiet.length > 0 && (
        <div className="py-4">
          {after && <p className="mb-3 text-sm text-gray-500 dark:text-neutral-400">And {quiet.length} more</p>}
          <div className="-ml-1 flex flex-wrap gap-x-1 gap-y-2">
            {quiet.map((f) => (
              <Link
                key={f.id}
                href={`/${f.profile.username}`}
                className="flex items-center gap-2 rounded-full py-1 pr-3 pl-1 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-900/5 hover:text-gray-900 dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-white"
              >
                <Avatar p={f.profile} className="size-7" />
                {f.profile.display_name?.split(" ")[0] || f.profile.username}
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

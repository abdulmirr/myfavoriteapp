"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Pin, PinOff, Quote } from "lucide-react";
import type { Item, ProfileLite, Work } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { myItemId, revalidate, useViewer } from "@/lib/viewer";
import Avatar from "../ui/Avatar";
import { toast } from "../ui/Toast";
import { card, cn, quietButton } from "../ui/styles";

const ThoughtDialog = dynamic(() => import("../ThoughtDialog"));

/** When the viewer has this on their wall: edit the thought, pin to Top four. */
export function YourCopyBar({ work }: { work: Work }) {
  const v = useViewer();
  const id = myItemId(v, work);
  const [pinned, setPinned] = useState<number | null | undefined>(undefined);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!id || id === "pending") return;
    let stale = false;
    supabase()
      .from("items")
      .select("pinned_order")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => !stale && setPinned((data as { pinned_order: number | null } | null)?.pinned_order ?? null));
    return () => {
      stale = true;
    };
  }, [id]);

  if (!id || id === "pending" || !v.profile) return null;

  const togglePin = async () => {
    if (busy || pinned === undefined) return;
    setBusy(true);
    try {
      const db = supabase();
      if (pinned) {
        const { error } = await db.from("items").update({ pinned_order: null }).eq("id", id);
        if (error) throw error;
        setPinned(null);
        toast("Unpinned from your Top four");
      } else {
        const { data } = await db
          .from("items")
          .select("pinned_order")
          .eq("profile_id", v.profile!.id)
          .not("pinned_order", "is", null);
        const used = new Set(((data ?? []) as { pinned_order: number }[]).map((r) => r.pinned_order));
        const slot = [1, 2, 3, 4].find((s) => !used.has(s));
        if (!slot) {
          toast("Your Top four is full — unpin one first.");
          return;
        }
        const { error } = await db.from("items").update({ pinned_order: slot }).eq("id", id);
        if (error) throw error;
        setPinned(slot);
        toast("Pinned to your Top four");
      }
      revalidate([`profile:${v.profile!.id}`]);
    } catch {
      toast("Couldn't update — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={cn(card, "flex flex-wrap items-center justify-between gap-3 px-4 py-3")}>
      <p className="text-sm font-semibold text-gray-900 dark:text-neutral-100">On your wall</p>
      <div className="flex gap-1.5">
        <button type="button" onClick={() => setEditing(true)} className={cn(quietButton, "h-8 px-2.5 text-[13px]")}>
          <Quote className="size-3.5" /> Your thought
        </button>
        <button
          type="button"
          onClick={togglePin}
          disabled={busy || pinned === undefined}
          className={cn(quietButton, "h-8 px-2.5 text-[13px]")}
        >
          {pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
          {pinned ? "Unpin" : "Pin to Top four"}
        </button>
      </div>
      {editing && (
        <ThoughtDialog
          itemId={id}
          title={work.title}
          open={editing}
          onOpenChange={setEditing}
          onSaved={() => revalidate([`work:${work.work_key ?? work.canonical_id ?? ""}`])}
        />
      )}
    </div>
  );
}

/** Everyone who has it, their thought in the card — `?from=` puts that person first. */
export function FavoritedBy({ favorites, work }: { favorites: (Item & { profile: ProfileLite })[]; work: Work }) {
  const from = useSearchParams().get("from");
  const ordered = from
    ? [...favorites].sort((a, b) => (a.profile.username === from ? -1 : b.profile.username === from ? 1 : 0))
    : favorites;
  return <FavoritedList favorites={ordered} work={work} />;
}

export function FavoritedList({ favorites, work }: { favorites: (Item & { profile: ProfileLite })[]; work: Work }) {
  // people who wrote something get the full card; the rest gather in one row
  const said = favorites.filter((f) => f.description?.trim());
  const quiet = favorites.filter((f) => !f.description?.trim());
  return (
    <div className="flex flex-col gap-4 sm:gap-5">
      {said.map((f) => (
        <ThoughtCard key={f.id} f={f} work={work} />
      ))}
      {quiet.length > 0 && (
        <div className={cn(card, "p-4")}>
          <p className="mb-3 text-xs font-semibold text-gray-500 dark:text-neutral-400">
            {said.length ? "Also on" : "On"} {quiet.length} {quiet.length === 1 ? "wall" : "walls"}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {quiet.map((f) => (
              <Link
                key={f.id}
                href={`/${f.profile.username}`}
                className="flex items-center gap-1.5 rounded-lg bg-gray-100 py-1 pr-2.5 pl-1 text-xs font-medium text-gray-700 transition-colors hover:bg-gray-200 dark:bg-neutral-700/60 dark:text-neutral-200 dark:hover:bg-neutral-700"
              >
                <Avatar p={f.profile} className="size-5 text-[9px]" />
                {f.profile.display_name?.split(" ")[0] || f.profile.username}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ThoughtCard({ f, work }: { f: Item & { profile: ProfileLite }; work: Work }) {
  const thought = f.description?.trim();
  const date = new Date(f.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  return (
    <article className="relative">
      <div className="mx-2 -mb-4 rounded-t-2xl border border-b-0 border-gray-200 bg-gray-50 px-4 pt-2.5 pb-[26px] dark:border-neutral-700 dark:bg-neutral-800/60">
        <div className="flex items-center justify-between gap-3 text-xs text-gray-500 dark:text-neutral-400">
          <p className="min-w-0 truncate">
            <Link href={`/${f.profile.username}`} className="font-medium text-gray-500 underline underline-offset-2 hover:text-gray-700 dark:text-neutral-400">
              {f.profile.display_name || f.profile.username}
            </Link>{" "}
            favorited it
          </p>
          <time dateTime={f.created_at} className="shrink-0">
            {date}
          </time>
        </div>
      </div>
      <div className={cn(card, "relative z-10 p-4")}>
        <p className="whitespace-pre-line text-[15px] leading-relaxed text-gray-800 dark:text-neutral-200">“{thought}”</p>
        <Link
          href={`/${f.profile.username}`}
          className="mt-3 inline-block text-xs font-medium text-gray-500 hover:text-gray-900 hover:underline dark:text-neutral-400 dark:hover:text-neutral-100"
        >
          See @{f.profile.username}&apos;s wall →
        </Link>
        <span className="sr-only">{work.title}</span>
      </div>
    </article>
  );
}


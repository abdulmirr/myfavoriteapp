"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ListItem, ListRow, ListSummary, ProfileLite } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { useViewer } from "@/lib/viewer";
import ListView from "./ListView";
import { card, cn } from "../ui/styles";

/**
 * The server only ever sees public lists. When it found nothing, this asks
 * again as the signed-in viewer — the owner of a private list gets it;
 * everyone else gets a quiet "private or missing".
 */
export default function ListGate({ username, slug }: { username: string; slug: string }) {
  const v = useViewer();
  type Found = { list: ListSummary; owner: ProfileLite; items: ListItem[] } | "none";
  const [fetched, setFetched] = useState<{ key: string; data: Found } | null>(null);
  const me = v.status === "signed-in" ? v.profile : null;
  const mine = !!me && me.username === username;
  const key = `${me?.id}:${slug}`;
  // only the owner can see a private list, so anyone else knows the answer already
  const data: Found | null =
    v.status === "unknown" || (v.status === "signed-in" && !v.profile && v.stale)
      ? null
      : !mine
        ? "none"
        : fetched?.key === key
          ? fetched.data
          : null;

  useEffect(() => {
    if (!mine || !me) return;
    let stale = false;
    const setData = (d: Found) => setFetched({ key, data: d });
    (async () => {
      const db = supabase();
      const { data: list } = await db
        .from("lists")
        .select("*")
        .eq("profile_id", me.id)
        .eq("slug", slug)
        .maybeSingle();
      if (stale) return;
      if (!list) return setData("none");
      const { data: items } = await db
        .from("list_items")
        .select("*")
        .eq("list_id", (list as ListRow).id)
        .order("position", { ascending: true });
      if (stale) return;
      const rows = (items ?? []) as ListItem[];
      setData({
        list: {
          ...(list as ListRow),
          count: rows.length,
          covers: rows.map((r) => r.image_url).filter((u): u is string => !!u).slice(0, 4),
        },
        owner: { id: me.id, username: me.username, display_name: me.display_name, avatar_url: me.avatar_url },
        items: rows,
      });
    })();
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refetch per owner + list, not per profile object
  }, [mine, key]);

  if (data === null) {
    return (
      <div className="mx-auto max-w-3xl px-4 pt-4 sm:px-6 sm:pt-10">
        <div className={cn(card, "h-40 animate-pulse")} aria-busy />
      </div>
    );
  }
  if (data === "none") {
    return (
      <div className={cn(card, "mx-4 mt-4 max-w-3xl px-6 py-12 text-center sm:mx-auto sm:mt-10")}>
        <p className="text-base font-semibold text-gray-900 dark:text-neutral-100">This list is private or doesn&apos;t exist.</p>
        <Link href={`/${username}/lists`} className="mt-2 inline-block text-sm text-gray-500 underline underline-offset-4 hover:text-gray-900 dark:text-neutral-400">
          See @{username}&apos;s lists
        </Link>
      </div>
    );
  }
  return <ListView list={data.list} owner={data.owner} items={data.items} />;
}

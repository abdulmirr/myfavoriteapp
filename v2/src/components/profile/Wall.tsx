"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import type { Item, MediaType } from "@/lib/types";
import { useViewer } from "@/lib/viewer";
import { itemHref, TYPE_FILTERS } from "@/lib/work";
import { playSfx } from "@/lib/sfx";
import Framed from "./Framed";
import { cn, pill, pillActive, pillIdle, quietButton } from "../ui/styles";

const AddDialog = dynamic(() => import("../add/AddDialog"));

function Tile({ item, username, eager, big = false }: { item: Item; username: string; eager: boolean; big?: boolean }) {
  const href = itemHref({ canonical_id: item.canonical_id, item_id: item.id }, username) ?? "#";
  return (
    <Link
      href={href}
      prefetch={true}
      onClick={() => playSfx(item.media_type)}
      className="group block min-w-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-4 focus-visible:ring-offset-gray-100 dark:focus-visible:ring-neutral-400 dark:focus-visible:ring-offset-neutral-900"
    >
      <Framed
        item={item}
        eager={eager}
        sizes={
          big
            ? "(max-width: 639px) 44vw, 240px"
            : "(max-width: 639px) 30vw, (max-width: 1023px) 22vw, 190px"
        }
      />
      <p
        className={cn(
          "truncate text-center font-semibold tracking-tight text-gray-900 group-hover:underline dark:text-neutral-100",
          big ? "mt-3 text-sm sm:text-[15px]" : "mt-2.5 text-[13px]"
        )}
      >
        {item.title}
      </p>
      {item.creator && (
        <p className={cn("truncate text-center text-gray-500 dark:text-neutral-400", big ? "text-[13px]" : "text-xs")}>
          {item.creator}
        </p>
      )}
    </Link>
  );
}

/**
 * The library, kept: a person's favorites as objects on a wall — vinyl,
 * page edges, posters in frames — straight on the page, no boxes. Their Top
 * four leads, large (pinned first; a full wall tops up the empty slots from
 * its own order), then the whole wall with quiet type filters.
 */
export default function Wall({ items, profileId, username }: { items: Item[]; profileId: string; username: string }) {
  const v = useViewer();
  const own = v.status === "signed-in" && v.profile?.id === profileId;
  const [filter, setFilter] = useState("all");
  const [adding, setAdding] = useState(false);

  const pinned = useMemo(
    () => items.filter((i) => i.pinned_order).sort((a, b) => (a.pinned_order ?? 0) - (b.pinned_order ?? 0)),
    [items]
  );
  const four = useMemo(() => {
    const top = pinned.slice(0, 4);
    if (top.length === 4 || items.length < 8) return top;
    const used = new Set(top.map((i) => i.id));
    return [...top, ...items.filter((i) => !used.has(i.id) && i.media_type !== "photo")].slice(0, 4);
  }, [items, pinned]);
  const counts = useMemo(() => {
    const c = new Map<string, number>();
    for (const f of TYPE_FILTERS) c.set(f.key, items.filter((i) => f.types.includes(i.media_type)).length);
    c.set("photos", items.filter((i) => i.media_type === "photo").length);
    return c;
  }, [items]);
  const filters = [
    { key: "all", label: "All", types: null as MediaType[] | null, n: items.length },
    ...TYPE_FILTERS.map((f) => ({ key: f.key, label: f.label, types: f.types, n: counts.get(f.key) ?? 0 })),
    { key: "photos", label: "Photos", types: ["photo"] as MediaType[], n: counts.get("photos") ?? 0 },
  ].filter((f) => f.key === "all" || f.n > 0);
  const active = filters.find((f) => f.key === filter) ?? filters[0];
  const shown = active.types ? items.filter((i) => active.types!.includes(i.media_type)) : items;

  if (!items.length) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-300 px-6 py-12 text-center dark:border-neutral-700">
        <p className="text-sm text-gray-500 dark:text-neutral-400">
          {own ? "Your wall is empty — favorite something you love and it lands here." : "Nothing on this wall yet."}
        </p>
        {own && (
          <button type="button" onClick={() => setAdding(true)} className={cn(quietButton, "mt-4")}>
            <Plus className="size-4" /> Add a favorite
          </button>
        )}
        {adding && <AddDialog open={adding} onOpenChange={setAdding} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10 pt-2 sm:gap-14 sm:pt-4">
      {four.length > 0 && (
        <section aria-labelledby="top-four">
          <div className="mb-4 flex items-baseline justify-between gap-3 sm:mb-6">
            <h2 id="top-four" className="text-base font-semibold tracking-tight text-gray-900 dark:text-neutral-100">
              Top four
            </h2>
            {own && pinned.length < 4 && (
              <p className="text-xs text-gray-500 dark:text-neutral-400">Pin yours from any favorite&rsquo;s page</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4 sm:gap-x-8 lg:gap-x-12">
            {four.map((i) => (
              <Tile key={i.id} item={i} username={username} eager big />
            ))}
          </div>
        </section>
      )}

      <section aria-label="All favorites">
        <div className="mb-6 flex items-center justify-between gap-3 sm:mb-8">
          <div className="no-scrollbar -mx-1 flex gap-1.5 overflow-x-auto px-1">
            {filters.map((f) => (
              <button
                key={f.key}
                type="button"
                onClick={() => setFilter(f.key)}
                aria-pressed={active.key === f.key}
                className={cn(pill, "px-2.5 py-1 text-[13px]", active.key === f.key ? pillActive : pillIdle)}
              >
                {f.label}
                <span className="font-normal opacity-60">{f.n}</span>
              </button>
            ))}
          </div>
          {own && (
            <button
              type="button"
              onClick={() => setAdding(true)}
              aria-label="Add a favorite"
              title="Add a favorite"
              className={cn(pill, pillIdle, "px-2.5 py-1 text-[13px]")}
            >
              <Plus className="size-3.5" strokeWidth={2.4} /> <span className="max-sm:hidden">Add</span>
            </button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-x-4 gap-y-8 sm:grid-cols-4 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-5 lg:gap-x-8">
          {shown.map((i, n) => (
            <Tile key={i.id} item={i} username={username} eager={n < 10} />
          ))}
        </div>
      </section>
      {adding && <AddDialog open={adding} onOpenChange={setAdding} />}
    </div>
  );
}

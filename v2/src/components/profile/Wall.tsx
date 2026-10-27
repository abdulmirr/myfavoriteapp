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
import { card, cn, pill, pillActive, pillIdle, quietButton } from "../ui/styles";

const AddDialog = dynamic(() => import("../add/AddDialog"));

function Tile({ item, username, eager, big = false }: { item: Item; username: string; eager: boolean; big?: boolean }) {
  const href = itemHref({ canonical_id: item.canonical_id, item_id: item.id }, username) ?? "#";
  return (
    <Link
      href={href}
      prefetch={true}
      onClick={() => playSfx(item.media_type)}
      className="group block min-w-0 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:focus-visible:ring-neutral-400"
    >
      <Framed
        item={item}
        eager={eager}
        sizes={big ? "(max-width: 639px) 24vw, 160px" : "(max-width: 639px) 30vw, 150px"}
      />
      <p
        className={cn(
          "mt-2.5 truncate text-center font-semibold tracking-tight text-gray-900 group-hover:underline dark:text-neutral-100",
          big ? "text-[13px]" : "text-xs"
        )}
      >
        {item.title}
      </p>
      {item.creator && (
        <p className="truncate text-center text-[11px] text-gray-500 dark:text-neutral-400">{item.creator}</p>
      )}
    </Link>
  );
}

/**
 * The library, kept: a person's favorites as objects on a wall — vinyl,
 * page edges, posters in frames — with their Top four first and quiet type
 * filters. Lives under the profile header in antislop's card language.
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
      <div className={cn(card, "px-6 py-12 text-center")}>
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
    <div className="flex flex-col gap-4 sm:gap-5">
      {pinned.length > 0 && (
        <section className={cn(card, "p-4 sm:p-6")}>
          <h2 className="mb-3 text-sm font-semibold tracking-tight text-gray-900 sm:mb-4 dark:text-neutral-100">
            Top four
          </h2>
          <div className="grid grid-cols-4 gap-3 sm:gap-5">
            {pinned.slice(0, 4).map((i) => (
              <Tile key={i.id} item={i} username={username} eager big />
            ))}
          </div>
        </section>
      )}

      <section className={cn(card, "p-4 sm:p-6")}>
        <div className="mb-5 flex items-start justify-between gap-3">
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
              className={cn(quietButton, "h-8 shrink-0 px-2.5 text-[13px]")}
            >
              <Plus className="size-4" /> <span className="max-sm:hidden">Add</span>
            </button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 sm:gap-x-5 sm:gap-y-8">
          {shown.map((i, n) => (
            <Tile key={i.id} item={i} username={username} eager={n < 8} />
          ))}
        </div>
      </section>
      {adding && <AddDialog open={adding} onOpenChange={setAdding} />}
    </div>
  );
}

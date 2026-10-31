"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { PinOff, Plus } from "lucide-react";
import type { Item, MediaType } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { revalidate, useViewer } from "@/lib/viewer";
import { itemHref, TYPE_FILTERS } from "@/lib/work";
import { playSfx } from "@/lib/sfx";
import Framed from "./Framed";
import { toast } from "../ui/Toast";
import { cn, pill, pillActive, pillIdle, quietButton } from "../ui/styles";

const AddDialog = dynamic(() => import("../add/AddDialog"));
const PinPicker = dynamic(() => import("./PinPicker"));

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
 * its own order), then the whole wall with quiet type filters. The owner sees
 * only what's actually pinned: ✕-pin on hover to unpin, and each empty slot
 * opens a picker of their wall.
 */
export default function Wall({ items, profileId, username }: { items: Item[]; profileId: string; username: string }) {
  const v = useViewer();
  const own = v.status === "signed-in" && v.profile?.id === profileId;
  const [filter, setFilter] = useState("all");
  const [adding, setAdding] = useState(false);
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  // pins changed here, until the server's copy of the wall catches up
  const [pins, setPins] = useState<Record<string, number | null>>({});

  const pinned = useMemo(() => {
    const at = (i: Item) => (i.id in pins ? pins[i.id] : i.pinned_order) ?? 0;
    return items.filter((i) => at(i) > 0).sort((a, b) => at(a) - at(b));
  }, [items, pins]);
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
  const top = pinned.slice(0, 4);

  const setPin = async (item: Item, slot: number | null) => {
    if (busy) return;
    setBusy(true);
    const { error } = await supabase().from("items").update({ pinned_order: slot }).eq("id", item.id);
    setBusy(false);
    if (error) {
      toast("Couldn't update your Top four — try again.");
      return;
    }
    setPins((p) => ({ ...p, [item.id]: slot }));
    revalidate([`profile:${profileId}`]);
    toast(slot ? `Pinned ${item.title}` : `Unpinned ${item.title}`);
  };
  const pinFirstFree = (item: Item) => {
    setPicking(false);
    const used = new Set(top.map((i) => (i.id in pins ? pins[i.id] : i.pinned_order)));
    const slot = [1, 2, 3, 4].find((s) => !used.has(s));
    if (slot) void setPin(item, slot);
  };
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
      {(own || four.length > 0) && (
        <section aria-labelledby="top-four">
          <h2
            id="top-four"
            className="mb-4 text-base font-semibold tracking-tight text-gray-900 sm:mb-6 dark:text-neutral-100"
          >
            Top four
          </h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4 sm:gap-x-8 lg:gap-x-12">
            {own ? (
              <>
                {top.map((i) => (
                  <div key={i.id} className="group/pin relative min-w-0">
                    <Tile item={i} username={username} eager big />
                    <button
                      type="button"
                      onClick={() => void setPin(i, null)}
                      disabled={busy}
                      aria-label={`Unpin ${i.title} from your Top four`}
                      title="Unpin"
                      className="absolute top-1 right-1 z-10 inline-flex size-8 cursor-pointer items-center justify-center rounded-full bg-white/95 text-gray-900 opacity-0 shadow-[0_2px_12px_rgba(0,0,0,0.18)] outline-none backdrop-blur-sm transition-opacity duration-150 group-hover/pin:opacity-100 hover:bg-white focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-gray-900 disabled:cursor-default [@media(hover:none)]:opacity-100 dark:bg-neutral-800/95 dark:text-neutral-100 dark:hover:bg-neutral-700"
                    >
                      <PinOff className="size-4" />
                    </button>
                  </div>
                ))}
                {Array.from({ length: 4 - top.length }, (_, n) => (
                  <button
                    key={`empty-${n}`}
                    type="button"
                    onClick={() => setPicking(true)}
                    disabled={busy}
                    className="group block min-w-0 cursor-pointer self-start rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-4 focus-visible:ring-offset-gray-100 dark:focus-visible:ring-neutral-400 dark:focus-visible:ring-offset-neutral-900"
                  >
                    {/* an empty frame the size of a cover, the New list tile's + at its heart */}
                    <span className="flex aspect-square w-full items-center justify-center">
                      <span className="flex size-[86%] items-center justify-center rounded-md bg-gray-200/70 ring-1 ring-gray-900/5 transition-colors ring-inset group-hover:bg-gray-200 dark:bg-neutral-800/70 dark:ring-white/[0.06] dark:group-hover:bg-neutral-800">
                        <span className="flex size-11 items-center justify-center rounded-full bg-white text-gray-900 shadow-[0_2px_8px_rgba(0,0,0,0.12)] transition-transform duration-200 group-hover:scale-105 dark:bg-neutral-100 dark:text-neutral-900">
                          <Plus className="size-5" strokeWidth={2.25} />
                        </span>
                      </span>
                    </span>
                    <span className="mt-3 block text-center text-sm font-semibold tracking-tight text-gray-900 group-hover:underline sm:text-[15px] dark:text-neutral-100">
                      Pin a favorite
                    </span>
                  </button>
                ))}
              </>
            ) : (
              four.map((i) => <Tile key={i.id} item={i} username={username} eager big />)
            )}
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
      {picking && (
        <PinPicker
          open={picking}
          onOpenChange={setPicking}
          items={items.filter((i) => !top.includes(i))}
          onPick={pinFirstFree}
        />
      )}
    </div>
  );
}

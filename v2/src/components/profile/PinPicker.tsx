"use client";

import { useState } from "react";
import type { Item } from "@/lib/types";
import Dialog from "../ui/Dialog";
import { field } from "../ui/styles";
import Framed from "./Framed";

/** The Top four's "Pin a favorite": your wall, searchable; one click pins it. */
export default function PinPicker({
  open,
  onOpenChange,
  items,
  onPick,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** the wall, minus what's already pinned */
  items: Item[];
  onPick: (item: Item) => void;
}) {
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const shown = needle
    ? items.filter((i) => `${i.title} ${i.creator ?? ""}`.toLowerCase().includes(needle))
    : items;

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Pin to your Top four" size="xl">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search your favorites"
        aria-label="Search your favorites"
        className={field}
      />
      {shown.length ? (
        <div className="grid grid-cols-3 gap-x-4 gap-y-6 sm:grid-cols-4">
          {shown.map((i) => (
            <button
              key={i.id}
              type="button"
              onClick={() => onPick(i)}
              className="group min-w-0 cursor-pointer rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:focus-visible:ring-neutral-400"
            >
              <Framed item={i} sizes="(max-width: 639px) 28vw, 130px" />
              <span className="mt-2 block truncate text-center text-xs font-semibold tracking-tight text-gray-900 group-hover:underline dark:text-neutral-100">
                {i.title}
              </span>
            </button>
          ))}
        </div>
      ) : (
        <p className="py-10 text-center text-sm text-gray-500 dark:text-neutral-400">
          {needle ? <>Nothing on your wall matches “{q.trim()}”.</> : "Everything on your wall is pinned."}
        </p>
      )}
    </Dialog>
  );
}

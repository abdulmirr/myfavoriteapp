"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useState } from "react";
import { Popover } from "radix-ui";
import { Bookmark, Lock, Plus } from "lucide-react";
import { useViewer } from "@/lib/viewer";
import ListCover from "./ListCover";
import { cn, headerIcon } from "./ui/styles";

const NewListDialog = dynamic(() => import("./lists/NewListDialog"));

/**
 * 🔖 in the header — everything you've saved, one tap from anywhere: your
 * lists (most recently touched first), each a link to the list. Reads the
 * viewer store, so it opens instantly with no fetch.
 */
export default function ListsButton() {
  const v = useViewer();
  const me = v.profile;
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger
          aria-label="Your lists"
          title="Your lists"
          className={cn(headerIcon, "data-[state=open]:bg-gray-300 dark:data-[state=open]:bg-neutral-700")}
        >
          <Bookmark className="size-4" strokeWidth={2.1} />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="end"
            sideOffset={8}
            collisionPadding={12}
            className="popover-content z-50 flex max-h-[min(70dvh,520px)] w-[min(92vw,340px)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_8px_30px_rgba(0,0,0,0.08)] outline-none dark:border-neutral-700 dark:bg-neutral-800"
          >
            <div className="flex items-center justify-between gap-3 border-b border-gray-100 py-2 pr-2 pl-4 dark:border-neutral-700">
              <p className="text-sm font-semibold tracking-tight text-gray-900 dark:text-neutral-100">Your lists</p>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setCreating(true);
                }}
                className="inline-flex h-8 cursor-pointer items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-gray-900 outline-none transition-colors hover:bg-gray-100 focus-visible:ring-2 focus-visible:ring-gray-900 dark:text-neutral-100 dark:hover:bg-neutral-700"
              >
                <Plus className="size-3.5" strokeWidth={2.4} /> New list
              </button>
            </div>
            <div className="overflow-y-auto p-1.5">
              {!me || v.lists.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm leading-relaxed text-gray-500 dark:text-neutral-400">
                  Nothing saved yet. Tap 🔖 on anything you want to check out later — it lands here.
                </p>
              ) : (
                <ul className="flex flex-col">
                  {v.lists.map((l) => (
                    <li key={l.id}>
                      <Link
                        href={`/${me.username}/lists/${l.slug}`}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-3 rounded-xl px-2.5 py-2 outline-none transition-colors hover:bg-gray-100 focus-visible:bg-gray-100 dark:hover:bg-neutral-700/60 dark:focus-visible:bg-neutral-700/60"
                      >
                        <ListCover coverImage={l.cover_image_url} covers={l.covers} small />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-gray-900 dark:text-neutral-100">{l.title}</span>
                          <span className="flex items-center gap-1 text-xs text-gray-500 dark:text-neutral-400">
                            {!l.is_public && <Lock className="size-3" aria-label="Private" />}
                            {l.count} {l.count === 1 ? "item" : "items"}
                          </span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
      {creating && <NewListDialog open={creating} onOpenChange={setCreating} />}
    </>
  );
}

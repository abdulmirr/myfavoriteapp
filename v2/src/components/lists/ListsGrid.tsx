"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Plus } from "lucide-react";
import type { ListSummary } from "@/lib/types";
import { useViewer } from "@/lib/viewer";
import ListCard from "./ListCard";

const NewListDialog = dynamic(() => import("./NewListDialog"));

/**
 * A person's lists. Visitors see the public ones (server-rendered); the owner
 * sees all of theirs — private ones marked with a lock — plus "New list".
 */
export default function ListsGrid({
  lists,
  profileId,
  username,
}: {
  lists: ListSummary[];
  profileId: string;
  username: string;
}) {
  const v = useViewer();
  const own = v.status === "signed-in" && v.profile?.id === profileId;
  const [creating, setCreating] = useState(false);
  const shown = own ? v.lists : lists;

  if (!shown.length && !own) {
    return (
      <p className="px-1 py-8 text-center text-sm text-gray-500 dark:text-neutral-400">
        No public lists yet.
      </p>
    );
  }

  return (
    <>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-6 sm:gap-y-10">
        {own && (
          <li>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="group block w-full cursor-pointer rounded-lg text-left outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-4 focus-visible:ring-offset-gray-100 dark:focus-visible:ring-neutral-400 dark:focus-visible:ring-offset-neutral-900"
            >
              <span className="flex aspect-video w-full items-center justify-center rounded-md border-2 border-dashed border-gray-300 text-gray-400 transition-colors group-hover:border-gray-400 group-hover:text-gray-700 dark:border-neutral-700 dark:text-neutral-500 dark:group-hover:border-neutral-500 dark:group-hover:text-neutral-200">
                <Plus className="size-6" />
              </span>
              <span className="mt-3 block text-[15px] font-semibold tracking-tight text-gray-900 dark:text-neutral-100">New list</span>
              <span className="mt-0.5 block truncate text-[13px] text-gray-500 dark:text-neutral-400">“10/10 albums”, “Summer reads”…</span>
            </button>
          </li>
        )}
        {shown.map((l, i) => (
          <li key={l.id}>
            <ListCard list={l} username={username} priority={i < 3} />
          </li>
        ))}
      </ul>
      {creating && <NewListDialog open={creating} onOpenChange={setCreating} />}
    </>
  );
}

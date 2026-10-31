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
              {/* a quiet surface the size of a cover, a white + at its heart; lifts like the cards */}
              <span className="block transition-transform duration-200 ease-[cubic-bezier(0.2,0,0,1)] group-hover:-translate-y-0.5">
                <span className="flex aspect-video w-full items-center justify-center rounded-md bg-gray-200/70 ring-1 ring-gray-900/5 transition-colors ring-inset group-hover:bg-gray-200 dark:bg-neutral-800/70 dark:ring-white/[0.06] dark:group-hover:bg-neutral-800">
                  <span className="flex size-11 items-center justify-center rounded-full bg-white text-gray-900 shadow-[0_2px_8px_rgba(0,0,0,0.12)] transition-transform duration-200 group-hover:scale-105 dark:bg-neutral-100 dark:text-neutral-900">
                    <Plus className="size-5" strokeWidth={2.25} />
                  </span>
                </span>
              </span>
              <span className="mt-3 block text-[15px] font-semibold tracking-tight text-gray-900 group-hover:underline dark:text-neutral-100">
                New list
              </span>
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

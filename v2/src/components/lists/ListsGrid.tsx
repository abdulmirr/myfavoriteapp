"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { Plus } from "lucide-react";
import type { ListSummary } from "@/lib/types";
import { useViewer } from "@/lib/viewer";
import ListCard from "./ListCard";
import { card, cn } from "../ui/styles";

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
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
        {own && (
          <li className="h-full">
            <button
              type="button"
              onClick={() => setCreating(true)}
              className={cn(
                card,
                "flex h-full min-h-40 w-full cursor-pointer flex-col items-center justify-center gap-2 border-dashed p-3.5 text-center transition-colors hover:bg-gray-50 dark:hover:bg-neutral-700/40"
              )}
            >
              <span className="flex size-10 items-center justify-center rounded-full bg-gray-200 dark:bg-neutral-700">
                <Plus className="size-5" />
              </span>
              <span className="text-sm font-semibold text-gray-900 dark:text-neutral-100">New list</span>
              <span className="max-w-56 text-xs text-gray-500 dark:text-neutral-400">
                “Fiction books that made me cry”, “10/10 albums”… public or private.
              </span>
            </button>
          </li>
        )}
        {shown.map((l, i) => (
          <li key={l.id} className="h-full">
            <ListCard list={l} username={username} priority={i < 2} />
          </li>
        ))}
      </ul>
      {creating && <NewListDialog open={creating} onOpenChange={setCreating} />}
    </>
  );
}

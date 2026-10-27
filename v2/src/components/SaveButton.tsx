"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bookmark } from "lucide-react";
import type { Work } from "@/lib/types";
import { listsHolding, useViewer, viewer } from "@/lib/viewer";
import { CARD_ACTIONS, cn, iconButton } from "./ui/styles";

const SaveDialog = dynamic(() => import("./SaveDialog"));

/** 🔖 — "I want to check this out". Opens "Save ‘…’ to…" (lists). */
export default function SaveButton({ work, className }: { work: Work; className?: string }) {
  const v = useViewer();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const saved = listsHolding(v, work).size > 0;

  return (
    <>
      <button
        type="button"
        aria-label={saved ? `${work.title} is in your lists` : `Save ${work.title}`}
        aria-pressed={saved}
        title={saved ? "Saved" : "Save to a list"}
        onClick={() => {
          if (viewer().status !== "signed-in") {
            router.push(`/signin?next=${encodeURIComponent(location.pathname)}`);
            return;
          }
          setOpen(true);
        }}
        className={cn(iconButton, className)}
      >
        <Bookmark
          className={cn(
            CARD_ACTIONS === "bare" ? "size-4" : "size-3.5",
            saved && "fill-current text-gray-900 dark:text-neutral-100"
          )}
          strokeWidth={2.2}
        />
      </button>
      {open && <SaveDialog work={work} open={open} onOpenChange={setOpen} />}
    </>
  );
}

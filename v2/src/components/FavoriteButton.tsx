"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Work } from "@/lib/types";
import { favorite, isFavorited, restoreFavorite, unfavorite, useViewer, viewer } from "@/lib/viewer";
import { playUi } from "@/lib/sfx";
import Star from "./ui/Star";
import { toast } from "./ui/Toast";
import { cn, iconButton } from "./ui/styles";

const ThoughtDialog = dynamic(() => import("./ThoughtDialog"));

/**
 * ★ — "this is me". One tap puts the work on your wall (gold star, a chime,
 * and an optional "Add a thought"); tapping again takes it off, with Undo.
 */
export default function FavoriteButton({ work, className }: { work: Work; className?: string }) {
  const v = useViewer();
  const router = useRouter();
  const on = isFavorited(v, work);
  const [busy, setBusy] = useState(false);
  const [pop, setPop] = useState(0);
  const [thoughtFor, setThoughtFor] = useState<string | null>(null);

  const act = async () => {
    if (viewer().status !== "signed-in") {
      router.push(`/signin?next=${encodeURIComponent(location.pathname)}`);
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      if (!on) {
        playUi("confirm");
        setPop((n) => n + 1);
        const id = await favorite(work);
        toast("Added to your favorites", { label: "Add a thought", run: () => setThoughtFor(id) });
      } else {
        const row = await unfavorite(work);
        toast("Removed from your favorites", row ? { label: "Undo", run: () => void restoreFavorite(row) } : undefined);
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Something went wrong — try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={act}
        disabled={busy}
        aria-pressed={on}
        aria-label={on ? `Remove ${work.title} from your favorites` : `Favorite ${work.title}`}
        title={on ? "In your favorites" : "Favorite"}
        className={cn(iconButton, className)}
      >
        <Star
          key={pop}
          className={cn(
            "size-[17px] transition-colors",
            on ? "star-pop text-star" : "text-gray-500 dark:text-neutral-400"
          )}
        />
      </button>
      {thoughtFor && (
        <ThoughtDialog
          itemId={thoughtFor}
          title={work.title}
          open={!!thoughtFor}
          onOpenChange={(o) => !o && setThoughtFor(null)}
        />
      )}
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/social";
import { revalidate, viewer } from "@/lib/viewer";
import Dialog from "./ui/Dialog";
import { cn, primaryButton, quietButton, textarea } from "./ui/styles";

/** Write (or rewrite) the thought on one of your favorites. Always optional. */
export default function ThoughtDialog({
  itemId,
  title,
  open,
  onOpenChange,
  onSaved,
}: {
  itemId: string;
  title: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved?: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open || itemId === "pending") return;
    let stale = false;
    supabase()
      .from("items")
      .select("description")
      .eq("id", itemId)
      .maybeSingle()
      .then(({ data }) => {
        if (stale) return;
        // whatever they've typed while this loaded wins over the stored text
        const saved = (data as { description: string } | null)?.description ?? "";
        setText((cur) => (cur.trim() ? cur : saved));
        setLoaded(true);
      });
    return () => {
      stale = true;
    };
  }, [open, itemId]);

  const save = async () => {
    setBusy(true);
    setError("");
    const { error: err } = await supabase()
      .from("items")
      .update({ description: text.trim() })
      .eq("id", itemId);
    setBusy(false);
    if (err) {
      setError(friendlyError(err.message));
      return;
    }
    const me = viewer().profile;
    if (me) revalidate([`profile:${me.id}`, "feed"]);
    onSaved?.(text.trim());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Your thought on ‘${title}’`} busy={busy}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={loaded ? "What makes it one of yours?" : ""}
        maxLength={1000}
        aria-label="Your thought"
        className={cn(textarea, "min-h-28")}
        autoFocus
      />
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={() => onOpenChange(false)} className={cn(quietButton, "flex-1")}>
          Cancel
        </button>
        <button type="button" onClick={save} disabled={busy || !loaded} className={cn(primaryButton, "flex-1")}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </Dialog>
  );
}

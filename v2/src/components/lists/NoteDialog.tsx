"use client";

import { useState } from "react";
import type { ListItem } from "@/lib/types";
import { updateListItem } from "@/lib/viewer";
import Dialog from "../ui/Dialog";
import { cn, primaryButton, quietButton, textarea } from "../ui/styles";

const MAX = 280;

/** The owner's note on one list row — why it's here, who told them, when to watch it. */
export default function NoteDialog({
  item,
  open,
  onOpenChange,
  onSaved,
}: {
  item: ListItem;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: (note: string) => void;
}) {
  const [text, setText] = useState(item.note ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async () => {
    setBusy(true);
    setError("");
    try {
      const note = text.trim().slice(0, MAX);
      await updateListItem(item, { note });
      onSaved(note);
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save the note.");
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={`Note on ‘${item.title}’`} busy={busy}>
      <div className="flex flex-col gap-1.5">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Why it's here — who told you, what it's for…"
          maxLength={MAX}
          aria-label="Note"
          className={cn(textarea, "min-h-24")}
          autoFocus
        />
        <p className="text-right text-xs text-gray-400 tabular-nums dark:text-neutral-500">
          {text.length}/{MAX}
        </p>
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button type="button" onClick={() => onOpenChange(false)} className={cn(quietButton, "flex-1")}>
          Cancel
        </button>
        <button type="button" onClick={save} disabled={busy} className={cn(primaryButton, "flex-1")}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </Dialog>
  );
}

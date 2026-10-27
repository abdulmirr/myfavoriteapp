"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Switch } from "radix-ui";
import { createList, viewer } from "@/lib/viewer";
import Dialog from "../ui/Dialog";
import { cn, field, fieldLabel, primaryButton, textarea } from "../ui/styles";

const IDEAS = ["Fiction books that made me cry", "10/10 albums", "Films to watch with friends", "Summer reads"];

export function PrivacySwitch({ isPublic, onChange }: { isPublic: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg bg-gray-100 px-3 py-2.5 dark:bg-neutral-700/50">
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-gray-900 dark:text-neutral-100">Private</span>
        <span className="block text-xs text-gray-500 dark:text-neutral-400">
          {isPublic ? "Anyone can see it on your profile." : "Only you can see it."}
        </span>
      </span>
      <Switch.Root
        checked={!isPublic}
        onCheckedChange={(c) => onChange(!c)}
        className="relative h-[22px] w-9 shrink-0 cursor-pointer rounded-full bg-gray-300 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gray-900 data-[state=checked]:bg-gray-900 dark:bg-neutral-600 dark:data-[state=checked]:bg-neutral-100"
      >
        <Switch.Thumb className="block size-[18px] translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[16px] dark:data-[state=checked]:bg-neutral-900" />
      </Switch.Root>
    </label>
  );
}

/** Make a list from anywhere (lists tab, empty states). Lands on the new list. */
export default function NewListDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [idea] = useState(() => IDEAS[Math.floor(Math.random() * IDEAS.length)]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="New list" busy={busy}>
      <form
        className="flex flex-col gap-4"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim() || busy) return;
          setBusy(true);
          setError("");
          try {
            const l = await createList({ title, isPublic, description });
            onOpenChange(false);
            router.push(`/${viewer().profile!.username}/lists/${l.slug}`);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Couldn't create the list.");
            setBusy(false);
          }
        }}
      >
        <label className="flex flex-col gap-1.5">
          <span className={fieldLabel}>Title</span>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={idea}
            maxLength={80}
            autoFocus
            className={field}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={fieldLabel}>Description</span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What this list is for"
            maxLength={280}
            className={cn(textarea, "min-h-20")}
          />
        </label>
        <PrivacySwitch isPublic={isPublic} onChange={setIsPublic} />
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <button type="submit" disabled={busy || !title.trim()} className={primaryButton}>
          {busy ? "Creating…" : "Create list"}
        </button>
      </form>
    </Dialog>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import type { ListSummary } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { deleteList, updateList, viewer } from "@/lib/viewer";
import { slugify } from "@/lib/work";
import Dialog from "../ui/Dialog";
import { PrivacySwitch } from "./NewListDialog";
import { cn, destructiveButton, field, fieldLabel, primaryButton, quietButton, textarea } from "../ui/styles";

const MAX_BYTES = 4 * 1024 * 1024;

/** antislop's "Edit list": title, description, URL, image, private, added dates, delete. */
export default function EditListDialog({
  list,
  open,
  onOpenChange,
  onSaved,
}: {
  list: ListSummary;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onSaved: (patch: Partial<ListSummary>) => void;
}) {
  const router = useRouter();
  const [title, setTitle] = useState(list.title);
  const [description, setDescription] = useState(list.description);
  const [slug, setSlug] = useState(list.slug);
  const [isPublic, setIsPublic] = useState(list.is_public);
  const [showAdded, setShowAdded] = useState(list.show_added);
  const [cover, setCover] = useState<string | null>(list.cover_image_url);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const username = viewer().profile?.username ?? "";

  const save = async () => {
    const cleanSlug = slugify(slug || title, 80);
    if (!title.trim()) return setError("Give your list a name.");
    setBusy(true);
    setError("");
    try {
      let coverUrl = cover;
      if (file) {
        const me = viewer().profile!;
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
        const path = `${me.id}/list-${list.id}-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase().storage.from("media").upload(path, file, { upsert: true });
        if (upErr) throw new Error(upErr.message);
        coverUrl = supabase().storage.from("media").getPublicUrl(path).data.publicUrl;
      }
      const patch = {
        title: title.trim(),
        description: description.trim(),
        slug: cleanSlug,
        is_public: isPublic,
        show_added: showAdded,
        cover_image_url: coverUrl,
      };
      await updateList(list.id, patch);
      onSaved(patch);
      onOpenChange(false);
      if (cleanSlug !== list.slug) router.replace(`/${username}/lists/${cleanSlug}`);
      else router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange} title="Edit list" busy={busy}>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className={fieldLabel}>Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} className={field} />
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
        <label className="flex flex-col gap-1.5">
          <span className={fieldLabel}>URL</span>
          <div className="flex items-center rounded-lg bg-gray-200 pl-3 focus-within:ring-2 focus-within:ring-gray-900 dark:bg-neutral-700 dark:focus-within:ring-neutral-400">
            <span className="shrink-0 truncate text-base text-gray-500 sm:text-sm dark:text-neutral-400">/{username}/lists/</span>
            <input
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
              maxLength={80}
              className="h-10 min-w-0 flex-1 bg-transparent pr-3 text-base font-medium text-gray-900 outline-none sm:text-sm dark:text-neutral-100"
            />
          </div>
        </label>
        <div className="flex flex-col gap-1.5">
          <span className={fieldLabel}>Image</span>
          <div className="flex items-center gap-3">
            <div className="relative aspect-video h-16 shrink-0 overflow-hidden rounded-md bg-gray-200 dark:bg-neutral-700">
              {(file || cover) && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={file ? URL.createObjectURL(file) : cover!}
                  alt=""
                  className="absolute inset-0 size-full object-cover"
                />
              )}
            </div>
            <button type="button" onClick={() => fileRef.current?.click()} className={cn(quietButton, "h-9")}>
              <ImagePlus className="size-4" /> {cover || file ? "Replace" : "Upload"}
            </button>
            {(cover || file) && (
              <button
                type="button"
                aria-label="Remove image"
                onClick={() => {
                  setFile(null);
                  setCover(null);
                }}
                className={cn(quietButton, "size-9 px-0")}
              >
                <X className="size-4" />
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (f.size > MAX_BYTES) return setError("Images must be under 4MB.");
                setError("");
                setFile(f);
              }}
            />
          </div>
          <p className="text-xs text-gray-500 dark:text-neutral-400">
            JPEG, PNG or WebP, up to 4MB. Without one, the list shows its newest covers.
          </p>
        </div>
        <PrivacySwitch isPublic={isPublic} onChange={setIsPublic} />
        <label className="flex cursor-pointer items-center justify-between gap-4 rounded-lg bg-gray-100 px-3 py-2.5 dark:bg-neutral-700/50">
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-gray-900 dark:text-neutral-100">Added dates</span>
            <span className="block text-xs text-gray-500 dark:text-neutral-400">Show when each thing was added.</span>
          </span>
          <input
            type="checkbox"
            checked={showAdded}
            onChange={(e) => setShowAdded(e.target.checked)}
            className="size-4 accent-gray-900 dark:accent-neutral-100"
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <div className="flex gap-2 pt-1">
          {confirmDelete ? (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await deleteList(list.id);
                  onOpenChange(false);
                  router.replace(`/${username}/lists`);
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Couldn't delete.");
                  setBusy(false);
                }
              }}
              className={cn(destructiveButton, "flex-1 border-red-600 bg-red-600 text-white hover:bg-red-700")}
            >
              Delete for good
            </button>
          ) : (
            <button type="button" onClick={() => setConfirmDelete(true)} className={cn(destructiveButton, "flex-1")}>
              Delete list
            </button>
          )}
          <button type="button" onClick={save} disabled={busy} className={cn(primaryButton, "flex-1")}>
            {busy ? "Saving…" : "Save"}
          </button>
        </div>
        {confirmDelete && (
          <p className="-mt-2 text-xs text-gray-500 dark:text-neutral-400">
            {list.title} and everything saved in it will be removed. Your favorites stay.
          </p>
        )}
      </div>
    </Dialog>
  );
}

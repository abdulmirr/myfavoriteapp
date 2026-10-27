"use client";

import { useRef, useState } from "react";
import { ImagePlus } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { headerSrc } from "@/lib/img";
import { patchProfile, revalidate } from "@/lib/viewer";
import { uploadHeader } from "../profile/ProfileBanner";
import { cn, fieldLabel, quietButton } from "../ui/styles";

/** The profile banner in settings: change or remove it (saves on its own). */
export default function HeaderSetting({
  profileId,
  username,
  headerUrl,
}: {
  profileId: string;
  username: string;
  headerUrl: string | null;
}) {
  const [url, setUrl] = useState(headerUrl);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const save = async (next: string | null) => {
    const { error: err } = await supabase().from("profiles").update({ header_url: next }).eq("id", profileId);
    if (err) throw new Error(err.message);
    setUrl(next);
    patchProfile({ header_url: next });
    revalidate([`profile:${profileId}`, `username:${username}`]);
  };

  const run = async (job: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await job();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save — try again.");
    } finally {
      setBusy(false);
    }
  };

  const shown = preview ?? (url ? headerSrc(url) : null);
  return (
    <div className="flex flex-col gap-1.5">
      <span className={fieldLabel}>Header</span>
      <div className="relative aspect-[4/1] w-full overflow-hidden rounded-lg bg-gray-200 dark:bg-neutral-700">
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt="" className="absolute inset-0 size-full object-cover" />
        ) : (
          <p className="absolute inset-0 grid place-items-center px-4 text-center text-xs text-gray-500 dark:text-neutral-400">
            Until you add one, your page shows your top covers, blurred.
          </p>
        )}
      </div>
      <div className="mt-1 flex gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className={cn(quietButton, "h-9")}
        >
          <ImagePlus className="size-4" /> {url ? "Change header" : "Add header"}
        </button>
        {url && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(async () => {
                await save(null);
                setPreview(null);
              })
            }
            className={cn(quietButton, "h-9")}
          >
            Remove
          </button>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          void run(async () => {
            await save(await uploadHeader(profileId, f));
            setPreview(URL.createObjectURL(f));
          });
        }}
      />
    </div>
  );
}

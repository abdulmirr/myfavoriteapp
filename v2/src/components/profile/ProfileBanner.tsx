"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { headerSrc, thumbCover } from "@/lib/img";
import { patchProfile, revalidate, useViewer } from "@/lib/viewer";
import { toast } from "../ui/Toast";
import { cn } from "../ui/styles";

const MAX_BYTES = 8 * 1024 * 1024;

/** Upload a header image for the signed-in profile; returns its public URL. */
export async function uploadHeader(profileId: string, file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("Use a JPEG, PNG or WebP image.");
  if (file.size > MAX_BYTES) throw new Error("Header images must be under 8MB.");
  const db = supabase();
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const path = `${profileId}/header-${Date.now()}.${ext}`;
  const { error } = await db.storage.from("media").upload(path, file, { upsert: true, contentType: file.type });
  if (error) throw new Error(error.message);
  return db.storage.from("media").getPublicUrl(path).data.publicUrl;
}

/**
 * The banner across the top of a profile: their header image, or — until
 * they add one — their top covers blurred into a field of color, so every
 * page opens on that person's taste. Owners change it in place.
 */
export default function ProfileBanner({
  profileId,
  username,
  headerUrl,
  ambient,
}: {
  profileId: string;
  username: string;
  headerUrl: string | null;
  ambient: string[];
}) {
  const v = useViewer();
  const router = useRouter();
  const own = v.status === "signed-in" && v.profile?.id === profileId;
  // a fresh upload shows at once; the server copy catches up on refresh
  const [local, setLocal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const url = local ?? headerUrl;

  const pick = async (file: File) => {
    setBusy(true);
    try {
      const publicUrl = await uploadHeader(profileId, file);
      const { error } = await supabase().from("profiles").update({ header_url: publicUrl }).eq("id", profileId);
      if (error) throw new Error(error.message);
      setLocal(URL.createObjectURL(file));
      patchProfile({ header_url: publicUrl });
      revalidate([`profile:${profileId}`, `username:${username}`]);
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't upload that image.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative aspect-[5/2] w-full overflow-hidden bg-gray-200 sm:aspect-[4/1] dark:bg-neutral-700">
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={local ? url : headerSrc(url)}
          alt=""
          fetchPriority="high"
          className="absolute inset-0 size-full object-cover"
        />
      ) : ambient.length > 0 ? (
        // their covers as a soft glow that settles into the card below
        <div aria-hidden className="absolute inset-0">
          <div className="absolute -inset-12 flex scale-125 blur-3xl saturate-[1.8]">
            {ambient.map((src, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={thumbCover(src, 120)} alt="" className="h-full min-w-0 flex-1 object-cover" />
            ))}
          </div>
          <div className="absolute inset-0 bg-gradient-to-b from-white/5 via-white/25 to-white dark:from-black/10 dark:via-black/20 dark:to-neutral-800" />
        </div>
      ) : (
        <div
          aria-hidden
          className="absolute inset-0 bg-gradient-to-br from-gray-200 via-gray-100 to-gray-300 dark:from-neutral-700 dark:via-neutral-800 dark:to-neutral-700"
        />
      )}

      {own && (
        <>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className={cn(
              "absolute top-3 right-3 inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full bg-black/45 px-3 text-xs font-semibold text-white backdrop-blur-md transition-colors hover:bg-black/60 focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none disabled:cursor-default"
            )}
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
            {url ? "Change header" : "Add header"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) void pick(f);
            }}
          />
        </>
      )}
    </div>
  );
}

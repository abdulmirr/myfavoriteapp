"use client";

import { useEffect, useRef, useState } from "react";
import type { Profile } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { isReservedUsername } from "@/lib/reserved-usernames";
import { RevealWords, Rise } from "./bits";

/**
 * Beat 1 — claim your page. Display name + username (live availability),
 * optional avatar and bio. The trigger already minted an email-derived
 * username; this is where the user makes the page theirs.
 */
export default function ClaimStep({
  profile,
  onDone,
}: {
  profile: Profile;
  onDone: (updated: Profile) => void;
}) {
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(profile.avatar_url);
  const [availability, setAvailability] = useState<
    "idle" | "checking" | "free" | "taken" | "reserved"
  >("idle");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);

  // live availability — debounced; your own current name is always fine
  useEffect(() => {
    const name = username.trim();
    if (!name || name === profile.username) {
      setAvailability("idle");
      return;
    }
    if (!/^[a-z0-9_]{2,30}$/.test(name)) {
      setAvailability("idle");
      return;
    }
    if (isReservedUsername(name)) {
      setAvailability("reserved");
      return;
    }
    const id = ++seq.current;
    setAvailability("checking");
    const t = setTimeout(async () => {
      const { data } = await supabase()
        .from("profiles")
        .select("id")
        .eq("username", name)
        .neq("id", profile.id)
        .maybeSingle();
      if (id !== seq.current) return;
      setAvailability(data ? "taken" : "free");
    }, 350);
    return () => clearTimeout(t);
  }, [username, profile.username, profile.id]);

  const save = async () => {
    setSaving(true);
    setError("");
    try {
      if (!/^[a-z0-9_]{2,30}$/.test(username)) {
        throw new Error("Usernames are 2–30 characters: a–z, 0–9 and _");
      }
      const db = supabase();
      let avatarUrl = profile.avatar_url;

      if (avatarFile) {
        const path = `${profile.id}/avatar-${Date.now()}`;
        const { error: upErr } = await db.storage
          .from("media")
          .upload(path, avatarFile, { upsert: true });
        if (upErr) throw new Error(upErr.message);
        avatarUrl = db.storage.from("media").getPublicUrl(path).data.publicUrl;
      }

      const patch = {
        username,
        display_name: displayName.trim() || username,
        bio: bio.trim(),
        avatar_url: avatarUrl,
      };
      const { error: updErr } = await db.from("profiles").update(patch).eq("id", profile.id);
      if (updErr) {
        throw new Error(
          updErr.code === "23505"
            ? "That username is taken."
            : updErr.code === "23514"
              ? "That username is reserved — try another."
              : updErr.message
        );
      }
      onDone({ ...profile, ...patch });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-sm">
      <h1 className="text-2xl font-semibold leading-snug tracking-tight text-zinc-900 sm:text-3xl">
        <RevealWords text="Claim your page." delay={0.1} />
      </h1>
      <Rise delay={0.35}>
        <p className="mt-2 text-xs text-zinc-400">This is where your taste lives.</p>
      </Rise>

      <Rise delay={0.5} className="mt-8 flex flex-col gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => fileRef.current?.click()}
            className="flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center overflow-hidden bg-zinc-100 text-center text-[10px] uppercase leading-tight tracking-[0.08em] text-zinc-400 transition-colors hover:text-zinc-900"
          >
            {avatarPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarPreview} alt="" className="h-full w-full object-cover" />
            ) : (
              "photo"
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) {
                  setAvatarFile(f);
                  setAvatarPreview(URL.createObjectURL(f));
                }
              }}
            />
          </button>
          <div className="flex w-full flex-col gap-1">
            <span className="text-[10px] uppercase tracking-[0.08em] text-zinc-400">Name</span>
            <input
              value={displayName}
              autoFocus
              onChange={(e) => setDisplayName(e.target.value)}
              className="border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
            />
          </div>
        </div>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-[0.08em] text-zinc-400">Username</span>
          <div className="flex items-center border border-zinc-200 bg-white focus-within:border-zinc-400">
            <span className="shrink-0 pl-3 text-xs text-zinc-400">myfavoriteapp.com/</span>
            <input
              value={username}
              onChange={(e) =>
                setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 30))
              }
              className="w-full min-w-0 bg-transparent py-2 pr-3 text-xs text-zinc-900 focus:outline-none"
            />
          </div>
          <span className="min-h-4 text-[10px] leading-relaxed">
            {availability === "taken" ? (
              <span className="text-red-500">Taken — try another.</span>
            ) : availability === "reserved" ? (
              <span className="text-red-500">Reserved — try another.</span>
            ) : availability === "free" ? (
              <span className="save-appear text-emerald-600">Available ✓</span>
            ) : (
              <span className="text-zinc-400">Your public page.</span>
            )}
          </span>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-[10px] uppercase tracking-[0.08em] text-zinc-400">
            Bio <span className="normal-case">(optional)</span>
          </span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={2}
            placeholder="A line about your taste"
            className="resize-none border border-zinc-200 bg-white px-3 py-2 text-xs leading-relaxed text-zinc-900 placeholder:text-zinc-300 focus:border-zinc-400 focus:outline-none"
          />
        </label>

        <div className="mt-1 flex items-center gap-3">
          <button
            onClick={save}
            disabled={
              saving ||
              !username ||
              availability === "taken" ||
              availability === "reserved" ||
              availability === "checking"
            }
            className="h-9 cursor-pointer bg-zinc-900 px-4 text-xs font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-default disabled:bg-zinc-400"
          >
            {saving ? "Saving…" : "Continue"}
          </button>
          {error && <span className="text-[11px] text-red-500">{error}</span>}
        </div>
      </Rise>
    </div>
  );
}

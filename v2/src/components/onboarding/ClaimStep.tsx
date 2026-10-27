"use client";

import { useEffect, useRef, useState } from "react";
import { Camera } from "lucide-react";
import type { Profile } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { isReservedUsername } from "@/lib/reserved-usernames";
import { patchProfile, revalidate } from "@/lib/viewer";
import Avatar from "../ui/Avatar";
import { card, cn, field, fieldLabel, primaryButton, textarea } from "../ui/styles";
import BeatHeader from "./BeatHeader";

const NAME_RE = /^[a-z0-9_]{2,30}$/;

/**
 * Beat 1 — claim your page. The signup trigger already minted an
 * email-derived username; this is where it becomes theirs: name, handle
 * (checked live), an optional photo and a line of bio.
 */
export default function ClaimStep({ profile, onDone }: { profile: Profile; onDone: () => void }) {
  const [displayName, setDisplayName] = useState(profile.display_name);
  const [username, setUsername] = useState(profile.username);
  const [bio, setBio] = useState(profile.bio);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState(profile.avatar_url);
  const [lookup, setLookup] = useState<{ name: string; taken: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // format and reserved words are known locally; only a well-formed new
  // name costs a (debounced) lookup, and your current name is always fine
  const name = username.trim();
  const local =
    name === profile.username
      ? "idle"
      : name.length < 2
        ? "short"
        : !NAME_RE.test(name)
          ? "idle"
          : isReservedUsername(name)
            ? "reserved"
            : "lookup";
  useEffect(() => {
    if (local !== "lookup") return;
    let stale = false;
    const t = setTimeout(async () => {
      const { data } = await supabase()
        .from("profiles")
        .select("id")
        .eq("username", name)
        .neq("id", profile.id)
        .maybeSingle();
      if (!stale) setLookup({ name, taken: !!data });
    }, 350);
    return () => {
      stale = true;
      clearTimeout(t);
    };
  }, [local, name, profile.id]);
  const availability =
    local !== "lookup" ? local : lookup?.name !== name ? "checking" : lookup.taken ? "taken" : "free";

  const save = async () => {
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      if (!NAME_RE.test(name)) throw new Error("Usernames are 2–30 characters: a–z, 0–9 and _");
      if (isReservedUsername(name)) throw new Error("That username is reserved — try another.");
      const db = supabase();
      let avatarUrl = profile.avatar_url;
      if (avatarFile) {
        const path = `${profile.id}/avatar-${Date.now()}`;
        const { error: upErr } = await db.storage.from("media").upload(path, avatarFile, { upsert: true });
        if (upErr) throw new Error(upErr.message);
        avatarUrl = db.storage.from("media").getPublicUrl(path).data.publicUrl;
      }
      const patch = {
        username: name,
        display_name: displayName.trim() || name,
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
      patchProfile(patch);
      revalidate([`profile:${profile.id}`, `username:${profile.username}`, `username:${name}`, "feed"]);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save — try again.");
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-sm">
      <BeatHeader title="Claim your page" sub="This is where your taste lives." />
      <form
        className={cn(card, "mt-6 flex flex-col gap-4 p-6")}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="flex items-end gap-4">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            aria-label="Choose a photo"
            className="group relative shrink-0 cursor-pointer rounded-[30%] outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
          >
            <Avatar
              p={{ username: name || profile.username, display_name: displayName, avatar_url: avatarPreview }}
              className="size-16 text-2xl"
            />
            <span className="absolute -right-1 -bottom-1 flex size-6 items-center justify-center rounded-full bg-gray-900 text-white ring-2 ring-white transition-transform group-hover:scale-110 dark:bg-neutral-100 dark:text-neutral-900 dark:ring-neutral-800">
              <Camera className="size-3.5" />
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setAvatarFile(f);
              setAvatarPreview(URL.createObjectURL(f));
            }}
          />
          <label className="flex min-w-0 flex-1 flex-col gap-1.5">
            <span className={fieldLabel}>Name</span>
            <input
              value={displayName}
              autoFocus
              maxLength={60}
              onChange={(e) => setDisplayName(e.target.value)}
              autoComplete="name"
              className={field}
            />
          </label>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className={fieldLabel}>Username</span>
          <span className="flex h-10 w-full items-center rounded-lg bg-gray-200 text-base font-medium focus-within:ring-2 sm:text-sm focus-within:ring-gray-900 dark:bg-neutral-700 dark:focus-within:ring-neutral-400">
            <span className="shrink-0 pl-3 text-gray-500 dark:text-neutral-400">myfavoriteapp.com/</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 30))}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="h-full min-w-0 flex-1 bg-transparent pr-3 text-gray-900 outline-none dark:text-neutral-100"
            />
          </span>
          <span className="min-h-4 text-xs">
            {availability === "taken" ? (
              <span className="text-red-600 dark:text-red-400">Taken — try another.</span>
            ) : availability === "reserved" ? (
              <span className="text-red-600 dark:text-red-400">Reserved — try another.</span>
            ) : availability === "short" ? (
              <span className="text-gray-500 dark:text-neutral-400">At least 2 characters.</span>
            ) : availability === "free" ? (
              <span className="font-medium text-emerald-600 dark:text-emerald-400">Available</span>
            ) : availability === "checking" ? (
              <span className="text-gray-500 dark:text-neutral-400">Checking…</span>
            ) : (
              <span className="text-gray-500 dark:text-neutral-400">Letters, numbers and _ — your public link.</span>
            )}
          </span>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className={fieldLabel}>
            Bio <span className="font-normal">(optional)</span>
          </span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={2}
            maxLength={300}
            placeholder="A line about your taste"
            className={cn(textarea, "min-h-0")}
          />
        </label>

        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={
            saving || availability === "taken" || availability === "reserved" || availability === "short" || availability === "checking"
          }
          className={cn(primaryButton, "mt-1 w-full")}
        >
          {saving ? "Saving…" : "Continue"}
        </button>
      </form>
    </div>
  );
}

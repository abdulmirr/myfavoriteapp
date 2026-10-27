"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Download, ImagePlus, Puzzle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { isReservedUsername } from "@/lib/reserved-usernames";
import { socialHref } from "@/lib/social";
import { playUi, setSoundsEnabled, soundsEnabled } from "@/lib/sfx";
import { patchProfile, revalidate, signOut, useViewer } from "@/lib/viewer";
import Avatar from "@/components/ui/Avatar";
import Toggle from "@/components/ui/Toggle";
import SocialIcon from "@/components/profile/SocialIcon";
import ImportLibrary from "@/components/settings/ImportLibrary";
import HeaderSetting from "@/components/settings/HeaderSetting";
import {
  card,
  cn,
  destructiveButton,
  field,
  fieldLabel,
  pill,
  pillActive,
  pillIdle,
  primaryButton,
  quietButton,
  textarea,
} from "@/components/ui/styles";

const LINKS: { key: "x" | "instagram" | "music" | "pinterest" | "website"; label: string; placeholder: string }[] = [
  { key: "x", label: "X", placeholder: "X profile" },
  { key: "instagram", label: "Instagram", placeholder: "Instagram profile" },
  { key: "music", label: "Spotify", placeholder: "Spotify or Apple Music profile" },
  { key: "pinterest", label: "Pinterest", placeholder: "Pinterest profile" },
  { key: "website", label: "Website", placeholder: "Personal website" },
];

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className={cn(card, "p-4 sm:p-6")}>
      <h2 className="text-base font-semibold tracking-tight text-gray-900 dark:text-neutral-100">{title}</h2>
      {hint && <p className="mt-1 text-sm text-gray-500 dark:text-neutral-400">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Status({ state, ok, error }: { state: "idle" | "busy" | "done" | "error"; ok: string; error?: string }) {
  if (state === "done") return <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400">{ok}</span>;
  if (state === "error") return <span className="text-sm text-red-600 dark:text-red-400">{error || "Couldn't save — try again."}</span>;
  return null;
}

/** A destructive action behind a confirm step. */
function Danger({
  label,
  message,
  confirm,
  onConfirm,
}: {
  label: string;
  message: string;
  confirm: string;
  onConfirm: () => Promise<string | void>;
}) {
  const [step, setStep] = useState<"idle" | "confirm" | "busy">("idle");
  const [error, setError] = useState("");
  if (step === "idle") {
    return (
      <button type="button" onClick={() => setStep("confirm")} className={cn(destructiveButton, "w-full sm:w-auto")}>
        {label}
      </button>
    );
  }
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-red-50 p-3 dark:bg-red-950/30">
      <p className="text-sm text-red-700 dark:text-red-300">{message}</p>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={() => setStep("idle")} className={cn(quietButton, "flex-1")}>
          Cancel
        </button>
        <button
          type="button"
          disabled={step === "busy"}
          onClick={async () => {
            setStep("busy");
            setError("");
            const err = await onConfirm();
            if (err) {
              setError(err);
              setStep("confirm");
            }
          }}
          className={cn(destructiveButton, "flex-1 border-red-600 bg-red-600 text-white hover:bg-red-700")}
        >
          {step === "busy" ? "Working…" : confirm}
        </button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const v = useViewer();
  const me = v.profile;
  const fileRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [links, setLinks] = useState({ x: "", instagram: "", music: "", pinterest: "", website: "" });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [profileState, setProfileState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [profileError, setProfileError] = useState("");
  const [loaded, setLoaded] = useState(false);

  const [tasteNote, setTasteNote] = useState("");
  const [noteState, setNoteState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [digest, setDigest] = useState(false);
  const [dailyPicks, setDailyPicks] = useState(false);
  const [events, setEvents] = useState(true);
  const [emailError, setEmailError] = useState("");
  const [theme, setTheme] = useState<"light" | "dark" | "system">("system");
  const [sounds, setSounds] = useState(true);
  const [pw, setPw] = useState("");
  const [pwState, setPwState] = useState<"idle" | "busy" | "done" | "error">("idle");
  const [pwError, setPwError] = useState("");
  const [exportError, setExportError] = useState("");

  // signed out → sign in first, then come back
  useEffect(() => {
    if (v.status === "signed-out") router.replace("/signin?next=/settings");
  }, [v.status, router]);

  useEffect(() => {
    let t: string | null = null;
    try {
      t = localStorage.getItem("fav:theme");
    } catch {}
    const s = soundsEnabled();
    queueMicrotask(() => {
      setTheme(t === "dark" ? "dark" : t === "light" ? "light" : "system");
      setSounds(s);
    });
  }, []);

  // the editable copy + private settings, loaded once the profile is known
  useEffect(() => {
    if (!me || loaded) return;
    let stale = false;
    (async () => {
      const db = supabase();
      const [{ data: session }, { data: priv }, { data: picksStatus }] = await Promise.all([
        db.auth.getSession(),
        db
          .from("profile_private")
          .select("digest_opt_in, taste_note, email_events")
          .eq("profile_id", me.id)
          .maybeSingle<{ digest_opt_in: boolean; taste_note: string | null; email_events: boolean }>(),
        db.rpc("newsletter_me"),
      ]);
      if (stale) return;
      setEmail(session.session?.user.email ?? "");
      setDisplayName(me.display_name);
      setUsername(me.username);
      setBio(me.bio);
      const rest = [...(me.socials ?? [])];
      const take = (re: RegExp) => {
        const i = rest.findIndex((s) => re.test(`${s.label} ${s.url}`));
        return i < 0 ? "" : rest.splice(i, 1)[0].url;
      };
      setLinks({
        x: take(/twitter|x\.com|(^|\W)x(\W|$)/i),
        instagram: take(/instagram|(^|\W)ig(\W|$)/i),
        music: take(/spotify|apple|music/i),
        pinterest: take(/pinterest/i),
        website: rest.find((s) => s.url.trim())?.url ?? "",
      });
      setAvatarPreview(me.avatar_url);
      setDigest(priv?.digest_opt_in ?? false);
      setDailyPicks(picksStatus === "active");
      setEvents(priv?.email_events ?? true);
      setTasteNote(priv?.taste_note ?? "");
      setLoaded(true);
    })();
    return () => {
      stale = true;
    };
  }, [me, loaded]);

  const saveProfile = async () => {
    if (!me) return;
    setProfileState("busy");
    setProfileError("");
    try {
      if (!/^[a-z0-9_]{2,30}$/.test(username)) throw new Error("Usernames are 2–30 characters: a–z, 0–9 and _");
      if (isReservedUsername(username)) throw new Error("That username is reserved — try another.");
      const db = supabase();
      let avatarUrl = me.avatar_url;
      if (avatarFile) {
        const path = `${me.id}/avatar-${Date.now()}`;
        const { error } = await db.storage.from("media").upload(path, avatarFile, { upsert: true });
        if (error) throw new Error(error.message);
        avatarUrl = db.storage.from("media").getPublicUrl(path).data.publicUrl;
      }
      const music = links.music.trim();
      const socials = [
        { label: "X", url: links.x.trim() },
        { label: "Instagram", url: links.instagram.trim() },
        { label: /apple/i.test(music) ? "Apple Music" : "Spotify", url: music },
        { label: "Pinterest", url: links.pinterest.trim() },
        { label: "Website", url: socialHref(links.website.trim()) },
      ].filter((s) => s.url);
      const { error } = await db
        .from("profiles")
        .update({ username, display_name: displayName.trim(), bio: bio.trim(), socials, avatar_url: avatarUrl })
        .eq("id", me.id);
      if (error) {
        throw new Error(
          error.code === "23505"
            ? "That username is taken."
            : error.code === "23514"
              ? "That username is reserved — try another."
              : error.message
        );
      }
      const old = me.username;
      patchProfile({ username, display_name: displayName.trim(), bio: bio.trim(), socials, avatar_url: avatarUrl });
      revalidate([`profile:${me.id}`, `username:${old}`, `username:${username}`, "feed"]);
      setAvatarFile(null);
      setProfileState("done");
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : "Save failed");
      setProfileState("error");
    }
  };

  const setPrivate = async (patch: Record<string, unknown>) => {
    if (!me) return false;
    const { error } = await supabase()
      .from("profile_private")
      .upsert({ profile_id: me.id, ...patch }, { onConflict: "profile_id" });
    return !error;
  };

  const applyTheme = (t: "light" | "dark" | "system") => {
    setTheme(t);
    try {
      if (t === "system") localStorage.removeItem("fav:theme");
      else localStorage.setItem("fav:theme", t);
    } catch {}
    const dark = t === "dark" || (t === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
  };

  const exportLibrary = async (format: "json" | "csv") => {
    if (!me) return;
    setExportError("");
    const { data, error } = await supabase()
      .from("items")
      .select("media_type, title, creator, description, view_url, image_url, metadata, created_at")
      .eq("profile_id", me.id)
      .order("sort_order", { ascending: true });
    if (error) return setExportError("Export failed — try again.");
    const items = data ?? [];
    let body: string;
    let mime: string;
    if (format === "json") {
      body = JSON.stringify({ profile: me.username, exported_at: new Date().toISOString(), items }, null, 2);
      mime = "application/json";
    } else {
      // quote-escape, and defang leading =+-@ so a title can't run as a spreadsheet formula
      const esc = (val: unknown) => {
        let s = String(val ?? "").replace(/"/g, '""');
        if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
        return `"${s}"`;
      };
      const rows = items.map((i) =>
        [i.media_type, i.title, i.creator, (i.metadata as { year?: string })?.year ?? "", i.description, i.view_url ?? "", i.created_at]
          .map(esc)
          .join(",")
      );
      body = ["type,title,creator,year,thoughts,link,added", ...rows].join("\n");
      mime = "text/csv";
    }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([body], { type: mime }));
    a.download = `favorites-${me.username}.${format}`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (!me || !loaded) {
    return (
      <main className="mx-auto max-w-xl px-4 pt-6 pb-20 sm:px-6 sm:pt-10">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-neutral-100">Settings</h1>
        <div className="mt-6 flex flex-col gap-4" aria-busy>
          {[0, 1, 2].map((i) => (
            <div key={i} className={cn(card, "h-40 animate-pulse")} />
          ))}
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-xl px-4 pt-6 pb-20 sm:px-6 sm:pt-10">
      <div className="flex items-end justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-gray-900 dark:text-neutral-100">Settings</h1>
        <Link href={`/${me.username}`} className="text-sm font-medium text-gray-500 hover:text-gray-900 dark:text-neutral-400 dark:hover:text-neutral-100">
          View your profile →
        </Link>
      </div>

      <div className="mt-6 flex flex-col gap-4">
        <Section title="Profile" hint="How you appear on Favorite.">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <Avatar p={{ ...me, avatar_url: avatarPreview }} className="size-16 text-xl" />
              <button type="button" onClick={() => fileRef.current?.click()} className={cn(quietButton, "h-9")}>
                <ImagePlus className="size-4" /> Change photo
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
                  setAvatarPreview((prev) => {
                    if (prev?.startsWith("blob:")) URL.revokeObjectURL(prev);
                    return URL.createObjectURL(f);
                  });
                }}
              />
            </div>
            <HeaderSetting profileId={me.id} username={me.username} headerUrl={me.header_url ?? null} />
            <label className="flex flex-col gap-1.5">
              <span className={fieldLabel}>Name</span>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} className={field} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={fieldLabel}>Username</span>
              <div className="flex items-center rounded-lg bg-gray-200 pl-3 focus-within:ring-2 focus-within:ring-gray-900 dark:bg-neutral-700 dark:focus-within:ring-neutral-400">
                <span className="shrink-0 text-base text-gray-500 sm:text-sm dark:text-neutral-400">myfavoriteapp.com/</span>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 30))}
                  className="h-10 min-w-0 flex-1 bg-transparent pr-3 text-base font-medium text-gray-900 outline-none sm:text-sm dark:text-neutral-100"
                />
              </div>
              <span className="text-xs text-gray-500 dark:text-neutral-400">Old links redirect here automatically.</span>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={fieldLabel}>Bio</span>
              <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={300} className={cn(textarea, "min-h-20")} />
            </label>
            <div className="flex flex-col gap-1.5">
              <span className={fieldLabel}>Links</span>
              {LINKS.map((l) => (
                <div
                  key={l.key}
                  className="flex items-center rounded-lg bg-gray-200 pl-3 focus-within:ring-2 focus-within:ring-gray-900 dark:bg-neutral-700 dark:focus-within:ring-neutral-400"
                >
                  <span className="shrink-0 text-gray-500 dark:text-neutral-400">
                    <SocialIcon label={l.label} />
                  </span>
                  <input
                    value={links[l.key]}
                    onChange={(e) => setLinks((m) => ({ ...m, [l.key]: e.target.value }))}
                    placeholder={l.placeholder}
                    aria-label={l.placeholder}
                    className="h-10 min-w-0 flex-1 bg-transparent px-3 text-base font-medium text-gray-900 outline-none placeholder:font-normal placeholder:text-gray-400 sm:text-sm dark:text-neutral-100"
                  />
                </div>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <button type="button" onClick={saveProfile} disabled={profileState === "busy"} className={primaryButton}>
                {profileState === "busy" ? "Saving…" : "Save profile"}
              </button>
              <Status state={profileState} ok="Saved" error={profileError} />
            </div>
          </div>
        </Section>

        <Section title="Your daily picks" hint="A standing note to your picks — what to lean into, what to skip. It's read every day.">
          <textarea
            value={tasteNote}
            onChange={(e) => {
              setTasteNote(e.target.value.slice(0, 500));
              setNoteState("idle");
            }}
            placeholder="e.g. More quiet literary fiction, no self-help. Deep albums over singles."
            className={cn(textarea, "min-h-20")}
          />
          <div className="mt-3 flex items-center gap-3">
            <button
              type="button"
              disabled={noteState === "busy"}
              onClick={async () => {
                setNoteState("busy");
                setNoteState((await setPrivate({ taste_note: tasteNote.trim() })) ? "done" : "error");
              }}
              className={quietButton}
            >
              {noteState === "busy" ? "Saving…" : "Save note"}
            </button>
            <Status state={noteState} ok="Saved — shapes tomorrow's picks" />
          </div>
        </Section>

        <Section title="Import" hint="Bring your history — Goodreads and Letterboxd 4★+, Spotify and Last.fm top albums. You pick what makes your wall.">
          <ImportLibrary profileId={me.id} />
        </Section>

        <Section title="Appearance">
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm font-semibold text-gray-900 dark:text-neutral-100">Theme</span>
              <div className="flex gap-1">
                {(["light", "dark", "system"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => applyTheme(t)}
                    className={cn(pill, "px-2.5 py-1 text-[13px] capitalize", theme === t ? pillActive : pillIdle)}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <Toggle
              label="Sounds"
              hint="A whisper of foley when you open things, a soft chime when you favorite."
              checked={sounds}
              onChange={(on) => {
                setSounds(on);
                setSoundsEnabled(on);
                if (on) playUi("confirm");
              }}
            />
          </div>
        </Section>

        <Section title="Email">
          <div className="flex flex-col gap-3">
            <Toggle
              label="Daily picks"
              hint="Every morning: the day’s five favorites from people with taste, the same picks Home shows."
              checked={dailyPicks}
              onChange={async (on) => {
                setDailyPicks(on);
                const { error } = await supabase().rpc("newsletter_set_me", { p_on: on });
                if (error) {
                  setDailyPicks(!on);
                  setEmailError("Couldn't save — try again.");
                }
              }}
            />
            <Toggle
              label="Activity"
              hint="Your first follower, favorites spreading from your wall, taste approvals. At most one a day."
              checked={events}
              onChange={async (on) => {
                setEvents(on);
                if (!(await setPrivate({ email_events: on }))) {
                  setEvents(!on);
                  setEmailError("Couldn't save — try again.");
                }
              }}
            />
            <Toggle
              label="Weekly digest"
              hint="Mondays: who followed you, what spread from your wall, what the people you follow favorited."
              checked={digest}
              onChange={async (on) => {
                setDigest(on);
                if (!(await setPrivate({ digest_opt_in: on }))) {
                  setDigest(!on);
                  setEmailError("Couldn't save — try again.");
                }
              }}
            />
            {emailError && <p className="text-sm text-red-600 dark:text-red-400">{emailError}</p>}
          </div>
        </Section>

        <Section title="Browser extension" hint="Save any page you're on to Favorite in two clicks.">
          <Link href="/extension" className={quietButton}>
            <Puzzle className="size-4" /> Set up the extension
          </Link>
        </Section>

        <Section title="Account" hint={email}>
          <div className="flex flex-col gap-4">
            <form
              className="flex gap-2"
              onSubmit={async (e) => {
                e.preventDefault();
                if (pw.length < 6) {
                  setPwError("At least 6 characters.");
                  return setPwState("error");
                }
                setPwState("busy");
                const { error } = await supabase().auth.updateUser({ password: pw });
                if (error) {
                  setPwError(error.message);
                  setPwState("error");
                } else {
                  setPw("");
                  setPwState("done");
                }
              }}
            >
              <input
                type="password"
                value={pw}
                onChange={(e) => setPw(e.target.value)}
                placeholder="New password"
                autoComplete="new-password"
                aria-label="New password"
                className={cn(field, "min-w-0 flex-1")}
              />
              <button type="submit" disabled={!pw || pwState === "busy"} className={quietButton}>
                {pwState === "busy" ? "Saving…" : "Change password"}
              </button>
            </form>
            <Status state={pwState} ok="Password updated" error={pwError} />
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => exportLibrary("json")} className={quietButton}>
                <Download className="size-4" /> Export JSON
              </button>
              <button type="button" onClick={() => exportLibrary("csv")} className={quietButton}>
                <Download className="size-4" /> Export CSV
              </button>
              <button
                type="button"
                onClick={async () => {
                  await signOut();
                  router.replace("/");
                }}
                className={quietButton}
              >
                Log out
              </button>
            </div>
            {exportError && <p className="text-sm text-red-600 dark:text-red-400">{exportError}</p>}
          </div>
        </Section>

        <Section title="Danger zone">
          <div className="flex flex-col gap-3">
            <Danger
              label="Delete all favorites"
              message="This permanently erases everything on your wall. There is no undo."
              confirm="Delete everything"
              onConfirm={async () => {
                const { error } = await supabase().from("items").delete().eq("profile_id", me.id);
                if (error) return "Delete failed — nothing was removed. Try again.";
                revalidate([`profile:${me.id}`, "feed"]);
                router.push(`/${me.username}`);
              }}
            />
            <Danger
              label="Delete account"
              message="This deletes your page, your favorites, your lists, your follows and your account — permanently. Export first if you want a copy."
              confirm="Delete my account"
              onConfirm={async () => {
                const { error } = await supabase().rpc("delete_account");
                if (error) return error.message;
                await signOut();
                router.replace("/");
              }}
            />
          </div>
        </Section>
      </div>
      <p className="mt-8 flex justify-center gap-4 text-xs text-gray-500 dark:text-neutral-400">
        <Link href="/privacy" className="hover:text-gray-900 dark:hover:text-neutral-100">
          Privacy
        </Link>
        <Link href="/terms" className="hover:text-gray-900 dark:hover:text-neutral-100">
          Terms
        </Link>
      </p>
    </main>
  );
}

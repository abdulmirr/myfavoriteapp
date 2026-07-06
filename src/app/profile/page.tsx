"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { isReservedUsername } from "@/lib/reserved-usernames";
import type { Profile } from "@/lib/types";
import type { ViewMode } from "@/components/Sidebar";
import ImportLibrary from "@/components/ImportLibrary";
import { playUi, setSoundsEnabled, soundsEnabled } from "@/lib/sfx";

/** The hardwired profile links — fixed names, icon-labeled inputs. */
const LINK_SLOTS: {
  key: "x" | "instagram" | "music" | "pinterest" | "website";
  name: string;
  placeholder: string;
  icon: React.ReactNode;
}[] = [
  {
    key: "x",
    name: "X",
    placeholder: "X profile",
    icon: (
      <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
        <path d="M12.6 1h2.2L9.9 6.6 15.7 15h-4.6L7.6 9.9 3.5 15H1.3l5.3-6L1 1h4.7l3.2 4.6L12.6 1zm-.8 12.7h1.2L4.9 2.2H3.6l8.2 11.5z" />
      </svg>
    ),
  },
  {
    key: "instagram",
    name: "Instagram",
    placeholder: "Instagram profile",
    icon: (
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
        <rect x="1.5" y="1.5" width="13" height="13" rx="3.5" />
        <circle cx="8" cy="8" r="3" />
        <circle cx="11.8" cy="4.2" r="0.4" fill="currentColor" stroke="none" />
      </svg>
    ),
  },
  {
    key: "music",
    name: "Spotify / Apple Music",
    placeholder: "Spotify or Apple Music profile",
    icon: (
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M6 12.5V4l7.5-1.7v8.5" />
        <circle cx="4" cy="12.5" r="1.9" />
        <circle cx="11.6" cy="10.8" r="1.9" />
      </svg>
    ),
  },
  {
    key: "pinterest",
    name: "Pinterest",
    placeholder: "Pinterest profile",
    icon: (
      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.55.535 6.607 0 11.985-5.365 11.985-11.987C23.97 5.39 18.592.026 11.985.026L12.017 0z" />
      </svg>
    ),
  },
  {
    key: "website",
    name: "Personal website",
    placeholder: "Personal website",
    icon: (
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden>
        <circle cx="8" cy="8" r="6.3" />
        <ellipse cx="8" cy="8" rx="2.8" ry="6.3" />
        <path d="M1.7 8h12.6" />
      </svg>
    ),
  },
];

const SUBTLE_BTN = "cursor-pointer text-sm transition-colors";
const LINK_BTN = `${SUBTLE_BTN} text-zinc-500 hover:text-zinc-900`;
const FIELD_LABEL = "text-[10px] uppercase tracking-[0.08em] text-zinc-400";

/** Bordered, titled block — the shape shared by every settings group below the profile form. */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-10 border-t border-zinc-100 pt-6">
      <h2 className={FIELD_LABEL}>{title}</h2>
      {children}
    </div>
  );
}

/**
 * A destructive action gated behind a confirm step. "Delete all favorites" and
 * "Delete account" are the same idle → confirm → busy(→done) shape with different copy.
 */
function DangerAction({
  label,
  message,
  confirmLabel,
  busyLabel,
  successText,
  onConfirm,
}: {
  label: string;
  message: string;
  confirmLabel: string;
  busyLabel: string;
  /** Shown in place of the button on success; omit to just return to idle. */
  successText?: string;
  /** Return an error message to stay on the confirm step, or nothing to succeed. */
  onConfirm: () => Promise<string | void>;
}) {
  const [step, setStep] = useState<"idle" | "confirm" | "busy" | "done">("idle");
  const [error, setError] = useState("");

  if (step === "done") {
    return <p className="save-appear mt-3 text-xs text-zinc-500">{successText}</p>;
  }

  if (step === "idle") {
    return (
      <button onClick={() => setStep("confirm")} className={`mt-3 w-fit ${SUBTLE_BTN} text-zinc-500 hover:text-red-500`}>
        {label}
      </button>
    );
  }

  return (
    <div className="mt-3 flex flex-col gap-2">
      <p className="text-xs leading-relaxed text-zinc-500">{message}</p>
      {error && <p className="save-appear text-[11px] text-red-500">{error}</p>}
      <div className="flex items-center gap-4">
        <button
          onClick={async () => {
            setStep("busy");
            setError("");
            const err = await onConfirm();
            if (err) {
              setError(err);
              setStep("confirm");
            } else {
              setStep(successText ? "done" : "idle");
            }
          }}
          disabled={step === "busy"}
          className="w-fit cursor-pointer text-sm text-red-500 transition-colors hover:text-red-600 disabled:cursor-wait"
        >
          {step === "busy" ? busyLabel : confirmLabel}
        </button>
        <button
          onClick={() => setStep("idle")}
          className="w-fit cursor-pointer text-sm text-zinc-400 transition-colors hover:text-zinc-900"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

/**
 * Profile settings — a dedicated clean page (same shell as /signin).
 * Edits the signed-in user's own profile; signing out lives here too.
 */
export default function ProfileSettingsPage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  // fixed link slots — X, Instagram, music (Spotify / Apple Music), Pinterest, personal site
  const [links, setLinks] = useState({
    x: "",
    instagram: "",
    music: "",
    pinterest: "",
    website: "",
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [dark, setDark] = useState(false);
  const [defaultView, setDefaultView] = useState<ViewMode>("grid");
  const [sounds, setSounds] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  // weekly digest email opt-in
  const [digest, setDigest] = useState(false);
  const [digestBusy, setDigestBusy] = useState(false);

  // change password (reveals an inline field)
  const [pwOpen, setPwOpen] = useState(false);
  const [pw, setPw] = useState("");
  const [pwStatus, setPwStatus] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [pwError, setPwError] = useState("");

  const [loadFailed, setLoadFailed] = useState(false);
  const [digestError, setDigestError] = useState("");
  const [exportError, setExportError] = useState("");
  const [exportOpen, setExportOpen] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
    const v = localStorage.getItem("fav:view");
    if (v === "grid" || v === "freeform") setDefaultView(v);
    setSounds(soundsEnabled());
  }, []);

  const toggleTheme = () => {
    setDark((d) => {
      const next = !d;
      document.documentElement.classList.toggle("dark", next);
      localStorage.setItem("fav:theme", next ? "dark" : "light");
      return next;
    });
  };

  const changeDefaultView = (v: ViewMode) => {
    setDefaultView(v);
    localStorage.setItem("fav:view", v);
  };

  const toggleSounds = () => {
    const next = !sounds;
    setSounds(next);
    setSoundsEnabled(next);
    if (next) playUi("confirm"); // turning them on previews the sound itself
  };

  useEffect(() => {
    const db = supabase();
    db.auth.getSession().then(async ({ data }) => {
      const session = data.session;
      if (!session) {
        router.replace("/signin");
        return;
      }
      setEmail(session.user.email ?? "");
      // digest opt-in rides along as an embed — one round trip, not two
      const { data: p, error: loadErr } = await db
        .from("profiles")
        .select(
          "id, user_id, username, display_name, bio, avatar_url, socials, profile_private(digest_opt_in)"
        )
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (p) {
        type PrivRow = { digest_opt_in: boolean };
        const { profile_private: privRaw, ...profRow } = p as unknown as Profile & {
          profile_private: PrivRow | PrivRow[] | null;
        };
        // PostgREST returns an object for this one-to-one embed, but the
        // client's types say array — accept both shapes
        const priv = Array.isArray(privRaw) ? privRaw[0] : privRaw;
        const prof = profRow as Profile;
        setProfile(prof);
        setDisplayName(prof.display_name);
        setUsername(prof.username);
        setBio(prof.bio);
        // sort saved links into the fixed slots; anything unrecognized lands in Website
        const rest = [...(prof.socials ?? [])];
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
        setAvatarPreview(prof.avatar_url);
        setDigest(priv?.digest_opt_in ?? false);
      }
      // a transient query failure is not "no profile" — don't show a dead end
      setLoadFailed(!p && !!loadErr);
      setLoading(false);
    });
  }, [router]);

  const save = async () => {
    if (!profile) return;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      if (!/^[a-z0-9_]{2,30}$/.test(username)) {
        throw new Error("Usernames are 2–30 characters: a–z, 0–9 and _");
      }
      if (isReservedUsername(username)) {
        throw new Error("That username is reserved — try another.");
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

      // labels are hardwired per slot; the music one names the actual service
      const music = links.music.trim();
      const musicLabel = /apple/i.test(music) ? "Apple Music" : "Spotify";
      const cleanSocials = [
        { label: "X", url: links.x.trim() },
        { label: "Instagram", url: links.instagram.trim() },
        { label: musicLabel, url: music },
        { label: "Pinterest", url: links.pinterest.trim() },
        { label: "Website", url: links.website.trim() },
      ].filter((s) => s.url);
      const { error: updErr } = await db
        .from("profiles")
        .update({
          username,
          display_name: displayName,
          bio,
          socials: cleanSocials,
          avatar_url: avatarUrl,
        })
        .eq("id", profile.id);
      if (updErr) {
        throw new Error(
          updErr.code === "23505"
            ? "That username is taken."
            : updErr.code === "23514"
              ? "That username is reserved — try another."
              : updErr.message
        );
      }
      setProfile({ ...profile, username, avatar_url: avatarUrl });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const toggleDigest = async () => {
    if (!profile || digestBusy) return;
    setDigestBusy(true);
    setDigestError("");
    const next = !digest;
    const { error: err } = await supabase()
      .from("profile_private")
      .upsert({ profile_id: profile.id, digest_opt_in: next }, { onConflict: "profile_id" });
    if (err) setDigestError("Couldn't save — try again.");
    else setDigest(next);
    setDigestBusy(false);
  };

  const updatePassword = async () => {
    if (pw.length < 6) {
      setPwError("At least 6 characters.");
      setPwStatus("error");
      return;
    }
    setPwStatus("saving");
    setPwError("");
    const { error: err } = await supabase().auth.updateUser({ password: pw });
    if (err) {
      setPwError(err.message);
      setPwStatus("error");
    } else {
      setPw("");
      setPwOpen(false);
      setPwStatus("done");
    }
  };

  const signOut = async () => {
    await supabase().auth.signOut();
    router.replace("/");
  };

  // library export — the copy of your data the terms promise
  const download = (name: string, mime: string, body: string) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([body], { type: mime }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportLibrary = async (format: "json" | "csv") => {
    if (!profile) return;
    setExportError("");
    const { data, error: expErr } = await supabase()
      .from("items")
      .select("media_type, title, creator, description, view_url, image_url, metadata, created_at")
      .eq("profile_id", profile.id)
      .order("sort_order", { ascending: true });
    if (expErr) {
      // a silently empty file would read as a valid backup — never ship one
      setExportError("Export failed — try again.");
      return;
    }
    const items = data ?? [];
    if (format === "json") {
      download(
        `favorites-${profile.username}.json`,
        "application/json",
        JSON.stringify({ profile: profile.username, exported_at: new Date().toISOString(), items }, null, 2)
      );
    } else {
      const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const rows = items.map((i) =>
        [i.media_type, i.title, i.creator, (i.metadata as { year?: string })?.year ?? "",
         i.description, i.view_url ?? "", i.created_at].map(esc).join(",")
      );
      download(
        `favorites-${profile.username}.csv`,
        "text/csv",
        ["type,title,creator,year,thoughts,link,added", ...rows].join("\n")
      );
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <nav className="flex items-center px-5 pt-6 md:px-8 md:pt-8">
        {/* the mark goes home — the one nav convention nobody has to learn */}
        <Link href="/" aria-label="Home" className="w-fit transition-opacity hover:opacity-70">
          <img src="/favicon.svg" alt="Favorites" className="h-6 w-auto" />
        </Link>
      </nav>

      <div className="flex flex-1 justify-center px-5 pb-24 pt-14">
        <div className="w-full max-w-sm">
          {loading ? (
            <p className="text-xs text-zinc-400">Loading…</p>
          ) : !profile ? (
            <p className="text-xs text-zinc-400">
              {loadFailed ? (
                <>
                  Couldn&rsquo;t load your profile.{" "}
                  <button
                    onClick={() => window.location.reload()}
                    className="cursor-pointer text-zinc-900 underline underline-offset-2 transition-colors hover:text-zinc-500"
                  >
                    Try again
                  </button>
                </>
              ) : (
                "No profile found for this account."
              )}
            </p>
          ) : (
            <>
              <h1 className="text-sm font-semibold tracking-tight text-zinc-900">Profile</h1>

              <div className="mt-5 flex flex-col gap-3">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => fileRef.current?.click()}
                    className="flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center overflow-hidden bg-zinc-100 text-center text-[10px] uppercase leading-tight tracking-[0.08em] text-zinc-400 transition-colors hover:text-zinc-900"
                  >
                    {avatarPreview ? (
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
                    <span className={FIELD_LABEL}>Name</span>
                    <input
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-zinc-400 focus:outline-none"
                    />
                  </div>
                </div>

                <label className="flex flex-col gap-1">
                  <span className={FIELD_LABEL}>Username</span>
                  <div className="flex items-center border border-zinc-200 bg-white focus-within:border-zinc-400">
                    <span className="shrink-0 pl-3 text-xs text-zinc-400">
                      myfavoriteapp.com/
                    </span>
                    <input
                      value={username}
                      onChange={(e) =>
                        setUsername(
                          e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 30)
                        )
                      }
                      className="w-full min-w-0 bg-transparent py-2 pr-3 text-xs text-zinc-900 focus:outline-none"
                    />
                  </div>
                  <span className="text-[10px] leading-relaxed text-zinc-400">
                    Your public page. Old links redirect here automatically.
                  </span>
                </label>

                <label className="flex flex-col gap-1">
                  <span className={FIELD_LABEL}>Bio</span>
                  <textarea
                    value={bio}
                    onChange={(e) => setBio(e.target.value)}
                    rows={2}
                    className="resize-none border border-zinc-200 bg-white px-3 py-2 text-xs leading-relaxed text-zinc-900 focus:border-zinc-400 focus:outline-none"
                  />
                </label>

                <div className="flex flex-col gap-2">
                  <span className={FIELD_LABEL}>Links</span>
                  {LINK_SLOTS.map((slot) => (
                    <div
                      key={slot.key}
                      className="flex items-center border border-zinc-200 bg-white focus-within:border-zinc-400"
                    >
                      <span className="shrink-0 pl-3 text-zinc-400" title={slot.name}>
                        {slot.icon}
                      </span>
                      <input
                        value={links[slot.key]}
                        placeholder={slot.placeholder}
                        aria-label={slot.name}
                        onChange={(e) =>
                          setLinks((prev) => ({ ...prev, [slot.key]: e.target.value }))
                        }
                        className="w-full min-w-0 bg-transparent px-3 py-2 text-xs text-zinc-900 placeholder:text-zinc-300 focus:outline-none"
                      />
                    </div>
                  ))}
                </div>

                <div className="mt-1 flex items-center gap-3">
                  <button
                    onClick={save}
                    disabled={saving}
                    className="h-9 cursor-pointer bg-zinc-900 px-4 text-xs font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-wait disabled:bg-zinc-400"
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                  {saved && (
                    <span className="save-appear text-[11px] text-emerald-600">Saved</span>
                  )}
                  {error && <span className="text-[11px] text-red-500">{error}</span>}
                </div>
              </div>

              <ImportLibrary profileId={profile.id} />

              <Section title="Appearance">
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm text-zinc-500">Theme</span>
                  <button onClick={toggleTheme} className={LINK_BTN}>
                    {dark ? "Light →" : "Dark →"}
                  </button>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm text-zinc-500">Sounds</span>
                  <button onClick={toggleSounds} className={LINK_BTN}>
                    {sounds ? "On →" : "Off →"}
                  </button>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm text-zinc-500">Library opens in</span>
                  <div className="flex gap-4">
                    {(["grid", "freeform"] as const).map((v) => (
                      <button
                        key={v}
                        onClick={() => changeDefaultView(v)}
                        className={`${SUBTLE_BTN} ${
                          defaultView === v
                            ? "text-zinc-900"
                            : "text-zinc-400 hover:text-zinc-900"
                        }`}
                      >
                        {v === "grid" ? "Grid" : "Freeform"}
                      </button>
                    ))}
                  </div>
                </div>
              </Section>

              <Section title="Email">
                <div className="mt-3 flex items-center justify-between">
                  <div className="min-w-0 pr-4">
                    <span className="text-sm text-zinc-500">Weekly digest</span>
                    <p className="text-[11px] leading-relaxed text-zinc-400">
                      Mondays: new followers, favorites that spread from your library, fresh picks.
                    </p>
                  </div>
                  <button
                    onClick={toggleDigest}
                    disabled={digestBusy}
                    className={`shrink-0 disabled:cursor-wait ${LINK_BTN}`}
                  >
                    {digest ? "On →" : "Off →"}
                  </button>
                </div>
                {digestError && (
                  <p className="save-appear mt-2 text-[11px] text-red-500">{digestError}</p>
                )}
              </Section>

              <Section title="Account">
                <p className="mt-2 text-xs text-zinc-500">{email}</p>

                {pwOpen ? (
                  <div className="mt-3 flex flex-col gap-2">
                    <div className="flex items-center gap-3">
                      <input
                        type="password"
                        value={pw}
                        autoFocus
                        placeholder="new password"
                        onChange={(e) => setPw(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && updatePassword()}
                        className="flex-1 border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-900 placeholder:text-zinc-300 focus:border-zinc-400 focus:outline-none"
                      />
                      <button
                        onClick={updatePassword}
                        disabled={pwStatus === "saving"}
                        className={`disabled:cursor-wait ${LINK_BTN}`}
                      >
                        {pwStatus === "saving" ? "Saving…" : "Update"}
                      </button>
                    </div>
                    {pwStatus === "error" && (
                      <span className="save-appear text-[11px] text-red-500">{pwError}</span>
                    )}
                  </div>
                ) : (
                  <div className="mt-3 flex items-center gap-3">
                    <button
                      onClick={() => {
                        setPwOpen(true);
                        setPwStatus("idle");
                      }}
                      className={`w-fit ${LINK_BTN}`}
                    >
                      Change password
                    </button>
                    {pwStatus === "done" && (
                      <span className="save-appear text-[11px] text-emerald-600">
                        Password updated
                      </span>
                    )}
                  </div>
                )}

                {exportOpen ? (
                  <div className="mt-3 flex items-center gap-4">
                    <span className="text-sm text-zinc-500">Export library</span>
                    <button onClick={() => exportLibrary("json")} className={LINK_BTN}>
                      JSON
                    </button>
                    <button onClick={() => exportLibrary("csv")} className={LINK_BTN}>
                      CSV
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setExportOpen(true)} className={`mt-3 w-fit ${LINK_BTN}`}>
                    Export library
                  </button>
                )}
                {exportError && (
                  <p className="save-appear mt-2 text-[11px] text-red-500">{exportError}</p>
                )}

                <button onClick={signOut} className={`mt-3 w-fit ${LINK_BTN}`}>
                  Sign out
                </button>
              </Section>

              <Section title="Danger">
                <DangerAction
                  label="Delete all favorites"
                  message="This permanently erases everything you’ve saved. There is no undo."
                  confirmLabel="Yes, delete everything"
                  busyLabel="Deleting…"
                  successText="Library cleared."
                  onConfirm={async () => {
                    if (!profile) return "No profile loaded.";
                    const { error: err } = await supabase()
                      .from("items")
                      .delete()
                      .eq("profile_id", profile.id);
                    if (err) return "Delete failed — nothing was removed. Try again.";
                  }}
                />

                <DangerAction
                  label="Delete account"
                  message="This deletes your page, your library, your follows and your account — permanently. Export your library first if you want a copy."
                  confirmLabel="Yes, delete my account"
                  busyLabel="Deleting…"
                  onConfirm={async () => {
                    const db = supabase();
                    const { error: err } = await db.rpc("delete_account");
                    if (err) return err.message;
                    await db.auth.signOut();
                    router.replace("/");
                  }}
                />
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

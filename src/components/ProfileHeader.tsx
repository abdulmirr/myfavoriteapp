"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Profile } from "@/lib/types";
import { socialHref, type TasteMatch } from "@/lib/social";
import { ShareButton, SocialIcon, MoreButton, TasteNoteNudge, MATCH_TYPE } from "./Sidebar";

/** Followers/following, one tab at a time — a centered modal off the stat row. */
function PeopleModal({
  initialTab,
  followers,
  following,
  onClose,
}: {
  initialTab: "followers" | "following";
  followers: Profile[];
  following: Profile[];
  onClose: () => void;
}) {
  const [tab, setTab] = useState(initialTab);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const people = tab === "followers" ? followers : following;
  const empty = tab === "followers" ? "No followers yet." : "Not following anyone yet.";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-5">
      <button
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-zinc-900/20 backdrop-blur-[1px]"
      />
      <div className="save-appear relative flex max-h-[70vh] w-full max-w-sm flex-col border border-zinc-200 bg-white px-5 pb-4 pt-5 shadow-2xl">
        <div className="flex items-center justify-between">
          <div className="flex gap-4 text-xs">
            {(["followers", "following"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`cursor-pointer whitespace-nowrap transition-colors ${
                  tab === t ? "font-medium text-zinc-900" : "text-zinc-400 hover:text-zinc-900"
                }`}
              >
                {t === "followers"
                  ? `${followers.length} Follower${followers.length === 1 ? "" : "s"}`
                  : `${following.length} Following`}
              </button>
            ))}
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer text-zinc-400 transition-colors hover:text-zinc-900"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden>
              <path d="M2 2l8 8M10 2L2 10" />
            </svg>
          </button>
        </div>

        {people.length === 0 ? (
          <p className="mt-5 pb-2 text-xs text-zinc-400">{empty}</p>
        ) : (
          <ul className="mt-4 flex-1 overflow-y-auto overscroll-contain">
            {people.map((f) => (
              <li key={f.id}>
                <Link
                  href={`/${f.username}`}
                  onClick={onClose}
                  className="flex min-w-0 items-center gap-3 py-2 transition-opacity hover:opacity-60"
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden bg-zinc-100">
                    {f.avatar_url ? (
                      <img src={f.avatar_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-[10px] font-semibold text-zinc-300">
                        {(f.display_name || f.username).slice(0, 1)}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-xs text-zinc-900">{f.display_name}</div>
                    <div className="truncate text-[11px] text-zinc-400">@{f.username}</div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * The conventional profile header: identity on top, library below. This is
 * also where the viewer's relationship to the profile lives — follow state
 * and the taste-match line ("You share N favorites").
 */
export default function ProfileHeader({
  profile,
  itemCount,
  followers,
  following,
  isOwner,
  signedIn,
  canFollow,
  isFollowing,
  followBusy,
  onToggleFollow,
  tasteCount,
  tasteMatch,
  socialError,
  approved,
  approveBusy,
  onToggleApprove,
  noteOpen,
  onDismissNote,
  onSendTasteNote,
  blocked,
  blockBusy,
  onToggleBlock,
}: {
  profile: Profile;
  itemCount: number;
  followers: Profile[];
  following: Profile[];
  isOwner: boolean;
  /** signed-out visitors still see Follow — it routes to sign-in (look-but-don't-touch) */
  signedIn: boolean;
  canFollow: boolean;
  isFollowing: boolean;
  followBusy: boolean;
  onToggleFollow: () => void;
  /** how many people approve this profile's taste — public, person-level */
  tasteCount: number;
  /** shared canonical favorites between viewer and this profile — the compatibility read */
  tasteMatch: TasteMatch | null;
  /** a failed follow/block explains itself, briefly */
  socialError: string;
  approved: boolean;
  approveBusy: boolean;
  onToggleApprove: () => void;
  /** one-time nudge to attach a note right after approving */
  noteOpen: boolean;
  onDismissNote: () => void;
  onSendTasteNote: (note: string) => Promise<void>;
  blocked: boolean;
  blockBusy: boolean;
  onToggleBlock: () => void;
}) {
  const [people, setPeople] = useState<"followers" | "following" | null>(null);

  const stat = (label: string, count: number, onClick?: () => void) => {
    const inner = (
      <>
        <span className="font-medium text-zinc-900">{count}</span> {label}
      </>
    );
    return onClick ? (
      <button onClick={onClick} className="cursor-pointer whitespace-nowrap transition-colors hover:text-zinc-900">
        {inner}
      </button>
    ) : (
      <span className="whitespace-nowrap">{inner}</span>
    );
  };

  return (
    <header className="mx-auto w-full max-w-5xl px-5 pb-2 pt-8 sm:px-8 sm:pt-12">
      <div className="flex items-start gap-5 sm:gap-8">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden bg-zinc-100 sm:h-24 sm:w-24">
          {profile.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt={profile.display_name}
              className="h-full w-full object-cover"
            />
          ) : (
            <span className="text-xl font-semibold text-zinc-300">
              {(profile.display_name || profile.username).slice(0, 1)}
            </span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold leading-tight tracking-tight text-zinc-900">
                {profile.display_name}
              </h1>
              <p className="truncate text-xs text-zinc-400">@{profile.username}</p>
            </div>
            <div className="flex items-center gap-3">
              {isOwner ? (
                <Link
                  href="/profile"
                  className="flex h-7 shrink-0 items-center whitespace-nowrap border border-zinc-200 px-3 text-xs font-medium text-zinc-400 transition-colors hover:text-zinc-900"
                >
                  Edit profile
                </Link>
              ) : !signedIn ? (
                // look-but-don't-touch: the button exists, tapping it routes to sign-in
                <Link
                  href={`/signin?next=${encodeURIComponent(`/${profile.username}`)}`}
                  className="flex h-7 shrink-0 items-center whitespace-nowrap bg-zinc-900 px-3 text-xs font-medium text-white transition-colors hover:bg-zinc-700"
                >
                  Follow
                </Link>
              ) : (
                canFollow &&
                !blocked && (
                  <>
                    <button
                      onClick={onToggleFollow}
                      disabled={followBusy}
                      className={`flex h-7 shrink-0 cursor-pointer items-center whitespace-nowrap px-3 text-xs font-medium transition-colors disabled:cursor-wait ${
                        isFollowing
                          ? "border border-zinc-200 text-zinc-400 hover:text-zinc-900"
                          : "bg-zinc-900 text-white hover:bg-zinc-700"
                      }`}
                    >
                      {isFollowing ? "Following ✓" : "Follow"}
                    </button>
                    {/* approve taste — the quiet person-level gesture beside Follow */}
                    <button
                      onClick={onToggleApprove}
                      disabled={approveBusy}
                      aria-label={approved ? "Approved — tap to undo" : "Approve taste"}
                      title={approved ? "Approved" : "Approve taste"}
                      className={`flex h-7 shrink-0 cursor-pointer items-center transition-colors disabled:cursor-wait ${
                        approved ? "text-zinc-900" : "text-zinc-400 hover:text-zinc-900"
                      }`}
                    >
                      <svg width="14" height="14" viewBox="0 0 16 16" fill={approved ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden>
                        <path d="M2.5 7.5h2v6h-2z" />
                        <path d="M4.5 12.7c.4.5 1 .8 1.7.8h4.7c.6 0 1.1-.4 1.2-1l.9-4.2c.1-.7-.4-1.3-1.1-1.3H8.7l.6-2.6c.1-.6-.2-1.2-.8-1.4-.5-.2-1 0-1.2.5L4.5 7.5" />
                      </svg>
                    </button>
                  </>
                )
              )}
              <ShareButton username={profile.username} />
              {canFollow && (
                <MoreButton
                  username={profile.username}
                  blocked={blocked}
                  blockBusy={blockBusy}
                  onToggleBlock={onToggleBlock}
                />
              )}
            </div>
          </div>

          {/* stats — the relationship strip */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-400">
            {stat(`favorite${itemCount === 1 ? "" : "s"}`, itemCount)}
            {stat(`follower${followers.length === 1 ? "" : "s"}`, followers.length, () => setPeople("followers"))}
            {stat("following", following.length, () => setPeople("following"))}
          </div>

          {socialError && (
            <p className="save-appear text-[11px] text-red-500">{socialError}</p>
          )}
          {canFollow && !blocked && noteOpen && (
            <div className="max-w-xs">
              <TasteNoteNudge onSend={onSendTasteNote} onDismiss={onDismissNote} />
            </div>
          )}

          {profile.bio && (
            <p className="max-w-md text-xs leading-relaxed text-zinc-500">{profile.bio}</p>
          )}

          {(profile.socials?.length ?? 0) > 0 && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-0.5">
              {profile.socials?.map((s) => (
                <a
                  key={s.url}
                  href={socialHref(s.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={s.label}
                  className="text-zinc-400 transition-colors hover:text-zinc-900"
                >
                  <SocialIcon label={s.label} />
                </a>
              ))}
            </div>
          )}

          {/* taste stats — one quiet footnote, same sentence the notifications use */}
          {(tasteCount > 0 || (tasteMatch?.shared ?? 0) > 0) && (
            <p className="text-[11px] text-zinc-400">
              {tasteCount > 0 &&
                `${tasteCount} approve${tasteCount === 1 ? "s" : ""} ${isOwner ? "your" : "their"} taste`}
              {tasteCount > 0 && (tasteMatch?.shared ?? 0) > 0 && " · "}
              {(tasteMatch?.shared ?? 0) > 0 && (
                <span className="text-zinc-900">
                  {tasteMatch!.shared} shared favorite{tasteMatch!.shared === 1 ? "" : "s"}
                  {tasteMatch!.top_type
                    ? ` — mostly ${MATCH_TYPE[tasteMatch!.top_type] ?? tasteMatch!.top_type}`
                    : ""}
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      {people && (
        <PeopleModal
          initialTab={people}
          followers={followers}
          following={following}
          onClose={() => setPeople(null)}
        />
      )}
    </header>
  );
}

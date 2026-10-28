"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Ban, Check, Copy, Flag, MoreHorizontal, Settings, Share } from "lucide-react";
import type { Profile } from "@/lib/types";
import {
  approveTaste,
  blockProfile,
  friendlyError,
  hasApprovedTaste,
  hasBlocked,
  REPORT_EMAIL,
  unapproveTaste,
  unblockProfile,
} from "@/lib/social";
import { follow, unfollow, useViewer, viewer } from "@/lib/viewer";
import { playUi } from "@/lib/sfx";
import Star from "../ui/Star";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "../ui/Menu";
import { toast } from "../ui/Toast";
import { cn, iconButton, primaryButton, quietButton } from "../ui/styles";

const h9 = "h-9 px-3";

/**
 * Copy (or natively share) a link, flipping the label to "Copied" without a
 * width jump. `icon` makes it a bare share glyph that sits beside ★ and 🔖.
 */
export function ShareLinkButton({
  path,
  label = "Share",
  className,
  icon = false,
}: {
  path: string;
  label?: string;
  className?: string;
  icon?: boolean;
}) {
  const [done, setDone] = useState(false);
  const share = async () => {
    const url = `${window.location.origin}${path}`;
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setDone(true);
      if (icon) toast("Link copied");
      setTimeout(() => setDone(false), 1600);
    } catch {
      /* share sheet dismissed */
    }
  };
  if (icon) {
    return (
      <button type="button" onClick={share} aria-label={label} title={done ? "Copied" : label} className={className ?? iconButton}>
        {done ? <Check className="size-4" strokeWidth={2.2} /> : <Share className="size-4" strokeWidth={2.2} />}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={share}
      className={cn(quietButton, h9, className)}
    >
      <Share className="size-4" />
      <span className="grid">
        <span className={cn("col-start-1 row-start-1", done && "invisible")}>{label}</span>
        <span className={cn("col-start-1 row-start-1", !done && "invisible")}>Copied</span>
      </span>
    </button>
  );
}

/** a compact follow for people lists (Friends' suggestions) — its own full recipes, so nothing fights the size */
const chipFollow =
  "inline-flex h-8 shrink-0 cursor-pointer items-center justify-center rounded-full bg-gray-900 px-3.5 text-xs font-semibold text-white outline-none transition-colors hover:bg-gray-700 focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300";
const chipFollowing =
  "inline-flex h-8 shrink-0 cursor-pointer items-center justify-center rounded-full px-3 text-xs font-semibold text-gray-500 outline-none transition-colors hover:bg-gray-900/5 hover:text-gray-900 focus-visible:ring-2 focus-visible:ring-gray-900 disabled:cursor-default disabled:opacity-50 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-neutral-100";

export function FollowButton({
  profile,
  className,
  small = false,
  chip = false,
}: {
  profile: Profile;
  className?: string;
  small?: boolean;
  chip?: boolean;
}) {
  const v = useViewer();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const following = v.followingIds.has(profile.id);
  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        if (viewer().status !== "signed-in") {
          router.push(`/signin?next=${encodeURIComponent(location.pathname)}`);
          return;
        }
        setBusy(true);
        try {
          if (following) await unfollow(profile.id);
          else {
            await follow(profile);
            playUi("confirm");
          }
        } catch (e) {
          toast(e instanceof Error ? e.message : "Couldn't update — try again.");
        } finally {
          setBusy(false);
        }
      }}
      className={
        chip
          ? cn(following ? chipFollowing : chipFollow, className)
          : cn(following ? quietButton : primaryButton, small ? "h-8 px-3 text-xs" : h9, className)
      }
    >
      {following ? "Following" : "Follow"}
    </button>
  );
}

function MoreMenu({ profile }: { profile: Profile }) {
  const v = useViewer();
  const me = v.profile;
  const [approved, setApproved] = useState<boolean | null>(null);
  const [blocked, setBlocked] = useState<boolean | null>(null);
  const router = useRouter();

  return (
    <Menu
      onOpenChange={(o) => {
        if (!o || !me) return;
        hasApprovedTaste(me.id, profile.id).then(setApproved);
        hasBlocked(me.id, profile.id).then(setBlocked);
      }}
    >
      <MenuTrigger aria-label="More options" className={cn(quietButton, "size-9 px-0")}>
        <MoreHorizontal className="size-4" />
      </MenuTrigger>
      <MenuContent>
        {me && (
          <MenuItem
            onSelect={async (e) => {
              e.preventDefault();
              if (approved === null) return;
              try {
                if (approved) {
                  await unapproveTaste(me.id, profile.id);
                  setApproved(false);
                } else {
                  await approveTaste(me.id, profile.id);
                  playUi("confirm");
                  setApproved(true);
                  toast(`You approve ${profile.display_name || "@" + profile.username}'s taste`);
                }
              } catch (err) {
                toast(err instanceof Error ? friendlyError(err.message) : "Couldn't update — try again.");
              }
            }}
          >
            <Star className={cn("size-4", approved ? "text-star" : "")} />
            {approved ? "You approve their taste" : "Approve their taste"}
          </MenuItem>
        )}
        <MenuItem
          onSelect={() => {
            void navigator.clipboard.writeText(`${window.location.origin}/${profile.username}`);
            toast("Link copied");
          }}
        >
          <Copy /> Copy link
        </MenuItem>
        {me && (
          <>
            <MenuSeparator />
            <MenuItem
              destructive
              onSelect={async () => {
                if (blocked === null) return;
                try {
                  if (blocked) {
                    await unblockProfile(profile.id);
                    toast("Unblocked");
                  } else {
                    await blockProfile(profile.id);
                    toast(`Blocked @${profile.username}`);
                  }
                  router.refresh();
                } catch (err) {
                  toast(err instanceof Error ? friendlyError(err.message) : "Couldn't update — try again.");
                }
              }}
            >
              <Ban /> {blocked ? "Unblock" : "Block"}
            </MenuItem>
          </>
        )}
        <MenuItem asChild>
          <a href={`mailto:${REPORT_EMAIL}?subject=${encodeURIComponent(`Report: @${profile.username}`)}`}>
            <Flag /> Report
          </a>
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

/** Follow · Share · ⋯ for visitors; Share and the settings gear on your own page. */
export default function ProfileActions({ profile, stretch = false }: { profile: Profile; stretch?: boolean }) {
  const v = useViewer();
  const own = v.status === "signed-in" && v.profile?.id === profile.id;

  if (v.status === "unknown") {
    return (
      <div className={cn("flex items-center gap-1.5", stretch && "w-full")} aria-hidden>
        <span className={cn("h-9 animate-pulse rounded-lg bg-gray-200 dark:bg-neutral-700", stretch ? "flex-1" : "w-20")} />
        <span className="h-9 w-24 animate-pulse rounded-lg bg-gray-200 dark:bg-neutral-700" />
      </div>
    );
  }
  if (own) {
    return (
      <div className={cn("flex items-center gap-1.5", stretch && "w-full")}>
        <ShareLinkButton path={`/${profile.username}`} className={stretch ? "flex-1" : undefined} />
        <Link href="/settings" aria-label="Settings" title="Settings" className={cn(quietButton, h9, "w-9 px-0")}>
          <Settings className="size-4" />
        </Link>
      </div>
    );
  }
  return (
    <div className={cn("flex items-center gap-1.5", stretch && "w-full")}>
      <FollowButton profile={profile} className={stretch ? "flex-1" : undefined} />
      <ShareLinkButton path={`/${profile.username}`} className={stretch ? "flex-1" : undefined} />
      {v.status === "signed-in" && <MoreMenu profile={profile} />}
    </div>
  );
}

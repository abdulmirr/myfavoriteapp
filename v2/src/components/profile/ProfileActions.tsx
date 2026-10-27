"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Ban, Copy, Flag, MoreHorizontal, Settings, Share } from "lucide-react";
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
import { cn, primaryButton, quietButton } from "../ui/styles";

const h9 = "h-9 px-3";

/** Copy (or natively share) a link, flipping the label to "Copied" without a width jump. */
export function ShareLinkButton({ path, label = "Share", className }: { path: string; label?: string; className?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        const url = `${window.location.origin}${path}`;
        try {
          if (navigator.share && matchMedia("(pointer: coarse)").matches) {
            await navigator.share({ url });
            return;
          }
          await navigator.clipboard.writeText(url);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch {
          /* share sheet dismissed */
        }
      }}
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

export function FollowButton({ profile, className, small = false }: { profile: Profile; className?: string; small?: boolean }) {
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
      className={cn(
        following ? quietButton : primaryButton,
        small ? "h-8 px-3 text-xs" : h9,
        className
      )}
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

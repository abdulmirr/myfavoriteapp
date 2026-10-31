"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { BROWSE } from "@/lib/discover";
import { setUnread, useViewer } from "@/lib/viewer";
import { unreadCount } from "@/lib/social";
import { cn, headerIcon, pill, pillActive, pillIdle } from "./ui/styles";
import Avatar from "./ui/Avatar";
import AccountMenu, { AccountMenuSkeleton } from "./AccountMenu";

// the add flow (catalog search, links) loads on first open only
const AddDialog = dynamic(() => import("./add/AddDialog"));

const RESOURCES = "/discover/resources";

const NAV: { href: string; label: string; hideOnPhone: boolean; only?: "members" | "visitors" }[] = [
  { href: "/", label: "Home", hideOnPhone: true },
  // Discover, or the feed when it's switched back (lib/discover.ts)
  { href: BROWSE.href, label: BROWSE.label, hideOnPhone: false },
  // visitors get Resources as a page of its own; members find it inside Discover
  { href: RESOURCES, label: "Resources", hideOnPhone: false, only: "visitors" },
  // what your people are up to + your notifications (members only)
  { href: "/friends", label: "Friends", hideOnPhone: false, only: "members" },
];

// a visitor's phone bar holds three pills beside the wordmark: a size down to fit
const visitorPhone = "max-sm:px-2.5 [html:not([data-auth=in])_&]:max-sm:text-[13px]";

// Discover lit for members only, until the session check says who's looking
const pillActiveIfIn =
  "in-data-[auth=in]:bg-gray-900 in-data-[auth=in]:text-white dark:in-data-[auth=in]:bg-neutral-100 dark:in-data-[auth=in]:text-neutral-900";

/**
 * Home · Discover · Friends for members, Home · Discover · Resources for
 * visitors — centered in the bar from tablet width up. While the session
 * check runs, the pre-paint auth switch decides which. Friends' badge is the
 * unread notification count.
 */
function NavPills({ pathname, status, unread }: { pathname: string | null; status: string; unread: number }) {
  return (
    <nav aria-label="Main" className="ml-auto flex items-center gap-1 sm:ml-0 sm:gap-1.5 sm:justify-self-center">
      {NAV.map((n) => {
        if (n.only === "members" && status === "signed-out") return null;
        if (n.only === "visitors" && status === "signed-in") return null;
        // Discover stays lit inside it — on Resources, for members only (visitors have its own pill)
        const inside = n.href !== "/" && !!pathname?.startsWith(`${n.href}/`);
        const theirs = inside && pathname === RESOURCES && status !== "signed-in";
        const active = pathname === n.href || (inside && !theirs);
        const badge = n.only === "members" && unread > 0;
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            aria-label={badge ? `${n.label}, ${unread} new` : undefined}
            className={cn(
              pill,
              "relative",
              visitorPhone,
              active ? pillActive : pillIdle,
              theirs && status === "unknown" && pillActiveIfIn,
              n.hideOnPhone && "max-sm:hidden",
              status === "unknown" && n.only === "members" && "signed-in-only",
              status === "unknown" && n.only === "visitors" && "signed-out-only"
            )}
          >
            {n.label}
            {badge && (
              <span className="absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold leading-none text-white ring-2 ring-gray-100 dark:ring-neutral-900">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}

/** The unread count behind the Friends badge — refreshed each minute while the tab is visible. */
function useUnreadPoll(profileId: string | null) {
  useEffect(() => {
    if (!profileId) return;
    const poll = () => {
      if (document.visibilityState === "visible") void unreadCount(profileId).then(setUnread);
    };
    const t = setInterval(poll, 60_000);
    document.addEventListener("visibilitychange", poll);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", poll);
    };
  }, [profileId]);
}

/** Pre-hydration skeleton for the personal zone (antislop pulses here too). */
function PersonalSkeleton() {
  return (
    <div className="flex items-center gap-1 sm:gap-1.5" aria-hidden>
      <span className="size-8 animate-pulse rounded-lg bg-gray-200 dark:bg-neutral-800" />
      <span className="flex items-center gap-0.5">
        <span className="size-8 animate-pulse rounded-[30%] bg-gray-200 dark:bg-neutral-800" />
        <AccountMenuSkeleton />
      </span>
    </div>
  );
}

/** Your avatar goes straight to your page; the arrow beside it opens the menu. */
function YouLink({ pathname }: { pathname: string | null }) {
  const p = useViewer().profile;
  const href = p ? `/${p.username}` : "/settings";
  return (
    <Link
      href={href}
      aria-label="Your profile"
      title="Your profile"
      aria-current={pathname === href ? "page" : undefined}
      className="rounded-[30%] outline-none transition-opacity hover:opacity-85 focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 dark:focus-visible:ring-neutral-400 dark:focus-visible:ring-offset-neutral-900"
    >
      <Avatar p={p} className="size-8" eager />
    </Link>
  );
}

function LogIn({ pathname }: { pathname: string | null }) {
  const next = pathname && pathname !== "/signin" ? `?next=${encodeURIComponent(pathname)}` : "";
  return (
    <Link href={`/signin${next}`} className={cn(pill, visitorPhone, pathname === "/signin" ? pillActive : pillIdle)}>
      Log in
    </Link>
  );
}

/**
 * The bar's middle and right: two grid cells of Header's three (logo · nav ·
 * you), so the pills sit dead center whatever the sides measure. On phones
 * the bar is a row and everything after the logo hugs the right edge.
 */
export default function HeaderNav() {
  const pathname = usePathname();
  const v = useViewer();
  const [adding, setAdding] = useState(false);
  useUnreadPoll(v.status === "signed-in" ? (v.profile?.id ?? null) : null);

  // members: fetch the add dialog's code once the page settles, so ＋ opens instantly
  useEffect(() => {
    if (v.status !== "signed-in") return;
    const t = setTimeout(() => void import("./add/AddDialog"), 1500);
    return () => clearTimeout(t);
  }, [v.status]);

  return (
    <>
      <NavPills pathname={pathname} status={v.status} unread={v.unread} />
      <div className="flex items-center gap-1 sm:gap-1.5 sm:justify-self-end">
        {v.status === "unknown" ? (
          // first frame: the pre-paint data-auth attribute picks the right one
          <>
            <span className="signed-out-only">
              <LogIn pathname={pathname} />
            </span>
            <span className="signed-in-only">
              <PersonalSkeleton />
            </span>
          </>
        ) : v.status === "signed-out" ? (
          <LogIn pathname={pathname} />
        ) : (
          <>
            <button
              type="button"
              onClick={() => setAdding(true)}
              aria-label="Add a favorite"
              title="Add something"
              className={headerIcon}
            >
              <Plus className="size-4" strokeWidth={2.25} />
            </button>
            <span className="flex items-center gap-0.5">
              <YouLink pathname={pathname} />
              <AccountMenu />
            </span>
            {adding && <AddDialog open={adding} onOpenChange={setAdding} />}
          </>
        )}
      </div>
    </>
  );
}

/** Suspense fallback while the pathname resolves during prerender. */
export function HeaderNavFallback() {
  return (
    <>
      <NavPills pathname={null} status="unknown" unread={0} />
      <div className="flex items-center gap-1 sm:gap-1.5 sm:justify-self-end">
        <span className="signed-out-only">
          <LogIn pathname={null} />
        </span>
        <span className="signed-in-only">
          <PersonalSkeleton />
        </span>
      </div>
    </>
  );
}

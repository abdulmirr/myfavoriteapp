"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useViewer } from "@/lib/viewer";
import { cn, headerIcon, pill, pillActive, pillIdle } from "./ui/styles";
import Avatar from "./ui/Avatar";
import NotificationsButton from "./NotificationsButton";

// the add flow (catalog search, links, uploads) loads on first open only
const AddDialog = dynamic(() => import("./add/AddDialog"));

const NAV = [
  { href: "/", label: "Home", hideOnPhone: true },
  { href: "/feed", label: "Feed", hideOnPhone: false },
];

function NavPills({ pathname }: { pathname: string | null }) {
  return (
    <nav aria-label="Main" className="flex items-center gap-1 sm:gap-1.5">
      {NAV.map((n) => {
        const active = pathname === n.href;
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? "page" : undefined}
            className={cn(pill, active ? pillActive : pillIdle, n.hideOnPhone && "max-sm:hidden")}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** Pre-hydration skeleton for the personal zone (antislop pulses here too). */
function PersonalSkeleton() {
  return (
    <div className="flex items-center gap-1 sm:gap-1.5" aria-hidden>
      <span className="size-8 animate-pulse rounded-xl bg-gray-200 dark:bg-neutral-800" />
      <span className="size-8 animate-pulse rounded-xl bg-gray-200 dark:bg-neutral-800" />
      <span className="size-8 animate-pulse rounded-[30%] bg-gray-200 dark:bg-neutral-800" />
    </div>
  );
}

/** Your avatar goes straight to your page; settings live behind its gear. */
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
    <Link href={`/signin${next}`} className={cn(pill, pathname === "/signin" ? pillActive : pillIdle)}>
      Log in
    </Link>
  );
}

export default function HeaderNav() {
  const pathname = usePathname();
  const v = useViewer();
  const [adding, setAdding] = useState(false);

  // members: fetch the add dialog's code once the page settles, so ＋ opens instantly
  useEffect(() => {
    if (v.status !== "signed-in") return;
    const t = setTimeout(() => void import("./add/AddDialog"), 1500);
    return () => clearTimeout(t);
  }, [v.status]);

  return (
    <div className="flex items-center gap-1 sm:gap-1.5">
      <NavPills pathname={pathname} />
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
        <div className="flex items-center gap-1 sm:gap-1.5">
          <button
            type="button"
            onClick={() => setAdding(true)}
            aria-label="Add a favorite"
            title="Add something"
            className={headerIcon}
          >
            <Plus className="size-4" strokeWidth={2.25} />
          </button>
          <NotificationsButton />
          <YouLink pathname={pathname} />
          {adding && <AddDialog open={adding} onOpenChange={setAdding} />}
        </div>
      )}
    </div>
  );
}

/** Suspense fallback while the pathname resolves during prerender. */
export function HeaderNavFallback() {
  return (
    <div className="flex items-center gap-1 sm:gap-1.5">
      <NavPills pathname={null} />
      <span className="signed-out-only">
        <LogIn pathname={null} />
      </span>
      <span className="signed-in-only">
        <PersonalSkeleton />
      </span>
    </div>
  );
}

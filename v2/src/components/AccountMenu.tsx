"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronDown, List, Lock, LogOut, Moon, Plus, Settings, Sun } from "lucide-react";
import { signOut, useViewer } from "@/lib/viewer";
import { thumbCover } from "@/lib/img";
import Avatar from "./ui/Avatar";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "./ui/Menu";
import { cn } from "./ui/styles";

const NewListDialog = dynamic(() => import("./lists/NewListDialog"));

/** how many lists the menu shows before "See all" */
const SHOWN = 5;

/** Flip the theme and remember the choice (the layout's pre-paint script reads it). */
function toggleTheme(): boolean {
  const dark = !document.documentElement.classList.contains("dark");
  document.documentElement.classList.toggle("dark", dark);
  try {
    localStorage.setItem("fav:theme", dark ? "dark" : "light");
  } catch {}
  return dark;
}

/**
 * antislop's arrow beside the profile button: your lists (newest first, one
 * tap to any of them), Settings, the theme, Log out. The avatar next to it
 * still goes straight to your page.
 */
export default function AccountMenu() {
  const v = useViewer();
  const router = useRouter();
  const [dark, setDark] = useState(false);
  const [creating, setCreating] = useState(false);
  const p = v.profile;
  const lists = v.lists;

  return (
    <>
      <Menu
        onOpenChange={(o) => {
          if (o) setDark(document.documentElement.classList.contains("dark"));
        }}
      >
        <MenuTrigger
          aria-label="Account menu"
          className="group flex h-8 w-6 cursor-pointer items-center justify-center rounded-md text-gray-500 outline-none transition-colors hover:text-gray-900 focus-visible:ring-2 focus-visible:ring-gray-900 data-[state=open]:text-gray-900 dark:text-neutral-400 dark:hover:text-neutral-100 dark:focus-visible:ring-neutral-400 dark:data-[state=open]:text-neutral-100"
        >
          <ChevronDown className="size-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
        </MenuTrigger>
        <MenuContent className="w-64">
          {p && (
            <Link
              href={`/${p.username}`}
              className="flex items-center gap-2.5 rounded-lg px-2.5 pt-1.5 pb-2 outline-none hover:bg-gray-100 dark:hover:bg-neutral-700"
            >
              <Avatar p={p} className="size-9" />
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-gray-900 dark:text-neutral-100">
                  {p.display_name || p.username}
                </span>
                <span className="block truncate text-xs text-gray-500 dark:text-neutral-400">@{p.username}</span>
              </span>
            </Link>
          )}
          <MenuSeparator />
          <MenuLabel>
            <span className="text-xs font-semibold text-gray-500 dark:text-neutral-400">Your lists</span>
          </MenuLabel>
          {p &&
            lists.slice(0, SHOWN).map((l) => {
              const cover = l.cover_image_url ?? l.covers[0];
              return (
                <MenuItem key={l.id} asChild>
                  <Link href={`/${p.username}/lists/${l.slug}`}>
                    <span className="flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-[5px] bg-gray-200 dark:bg-neutral-700">
                      {cover ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumbCover(cover, 100)} alt="" className="size-full object-cover" />
                      ) : (
                        <List className="size-3.5" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{l.title}</span>
                    {!l.is_public && <Lock className="size-3 shrink-0" aria-label="Private" />}
                    <span className="shrink-0 text-xs text-gray-400 tabular-nums dark:text-neutral-500">{l.count}</span>
                  </Link>
                </MenuItem>
              );
            })}
          {p && lists.length > SHOWN && (
            <MenuItem asChild>
              <Link href={`/${p.username}/lists`} className="text-gray-500">
                <span className="w-7" aria-hidden />
                See all {lists.length} lists
              </Link>
            </MenuItem>
          )}
          {lists.length === 0 && (
            <p className="px-2.5 pb-1.5 text-xs leading-relaxed text-gray-500 dark:text-neutral-400">
              Tap 🔖 on anything you want to check out later.
            </p>
          )}
          <MenuItem onSelect={() => setTimeout(() => setCreating(true), 0)}>
            <span className="flex size-7 shrink-0 items-center justify-center">
              <Plus />
            </span>
            New list
          </MenuItem>
          <MenuSeparator />
          <MenuItem asChild>
            <Link href="/settings">
              <Settings /> Settings
            </Link>
          </MenuItem>
          <MenuItem
            onSelect={(e) => {
              e.preventDefault();
              setDark(toggleTheme());
            }}
          >
            {dark ? <Sun /> : <Moon />} {dark ? "Light mode" : "Dark mode"}
          </MenuItem>
          <MenuSeparator />
          <MenuItem
            onSelect={async () => {
              await signOut();
              router.push("/");
              router.refresh();
            }}
          >
            <LogOut /> Log out
          </MenuItem>
        </MenuContent>
      </Menu>
      {creating && <NewListDialog open={creating} onOpenChange={setCreating} />}
    </>
  );
}

/** The trigger's footprint while the session check runs. */
export function AccountMenuSkeleton({ className }: { className?: string }) {
  return <span className={cn("h-8 w-6", className)} aria-hidden />;
}

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronDown, List, LogOut, Moon, Settings, Sun, UserRound } from "lucide-react";
import { signOut, useViewer } from "@/lib/viewer";
import Avatar from "./ui/Avatar";
import { Menu, MenuContent, MenuFinePrint, MenuItem, MenuSeparator, MenuTrigger } from "./ui/Menu";

/** Flip the theme and remember the choice (read pre-paint by the layout). */
function toggleTheme(): boolean {
  const dark = !document.documentElement.classList.contains("dark");
  document.documentElement.classList.toggle("dark", dark);
  try {
    localStorage.setItem("fav:theme", dark ? "dark" : "light");
  } catch {}
  return dark;
}

export default function AccountMenu() {
  const v = useViewer();
  const router = useRouter();
  const [dark, setDark] = useState(false);
  const p = v.profile;

  return (
    <Menu
      onOpenChange={(o) => {
        if (o) setDark(document.documentElement.classList.contains("dark"));
      }}
    >
      <MenuTrigger
        aria-label="Account menu"
        className="flex h-8 cursor-pointer items-center gap-1 rounded-xl pr-1 pl-0.5 outline-none transition-colors hover:bg-gray-200 focus-visible:ring-2 focus-visible:ring-gray-900 data-[state=open]:bg-gray-200 dark:hover:bg-neutral-800 dark:data-[state=open]:bg-neutral-800"
      >
        <Avatar p={p} className="size-7" eager />
        <ChevronDown className="size-3.5 text-gray-500 dark:text-neutral-400" />
      </MenuTrigger>
      <MenuContent>
        {p && (
          <div className="flex items-center gap-2.5 px-2.5 pt-1.5 pb-2">
            <Avatar p={p} className="size-9" />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-gray-900 dark:text-neutral-100">
                {p.display_name || p.username}
              </p>
              <p className="truncate text-xs text-gray-500 dark:text-neutral-400">@{p.username}</p>
            </div>
          </div>
        )}
        <MenuSeparator />
        {p && (
          <>
            <MenuItem asChild>
              <Link href={`/${p.username}`}>
                <UserRound /> Your profile
              </Link>
            </MenuItem>
            <MenuItem asChild>
              <Link href={`/${p.username}/lists`}>
                <List /> Your lists
              </Link>
            </MenuItem>
          </>
        )}
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
        <MenuSeparator />
        <div className="flex gap-2 px-1.5 pb-0.5">
          <MenuFinePrint href="/privacy">Privacy</MenuFinePrint>
          <MenuFinePrint href="/terms">Terms</MenuFinePrint>
        </div>
      </MenuContent>
    </Menu>
  );
}

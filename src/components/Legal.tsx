"use client";

import Link from "next/link";
import { useSystemTheme } from "@/lib/use-system-theme";

/**
 * Shell + typography for the legal pages (/privacy, /terms). Explicit zinc
 * classes on every element so the .dark remap in globals.css applies.
 */

export function LegalPage({
  eyebrow,
  title,
  updated,
  children,
}: {
  eyebrow: string;
  title: string;
  updated: string;
  children: React.ReactNode;
}) {
  useSystemTheme();
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <header className="sticky top-0 z-30 bg-white/85 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
          <Link href="/" aria-label="Home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/favicon.svg" alt="Favorites" className="h-6 w-auto" />
          </Link>
          <Link
            href="/signin"
            className="text-xs text-zinc-400 transition-colors hover:text-zinc-900"
          >
            Sign in
          </Link>
        </div>
      </header>

      <main className="mx-auto w-full max-w-2xl flex-1 px-5 pb-24 pt-14 sm:px-8">
        <p className="text-[10px] uppercase tracking-[0.08em] text-zinc-400">{eyebrow}</p>
        <h1 className="mt-2 text-lg font-semibold leading-snug tracking-tight text-zinc-900">
          {title}
        </h1>
        <p className="mt-1.5 text-[10px] uppercase tracking-[0.08em] text-zinc-400">
          Last updated {updated}
        </p>
        <div className="mt-10 flex flex-col gap-4">{children}</div>
      </main>

    </div>
  );
}

export function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="pt-4 text-[13px] font-semibold tracking-tight text-zinc-900">{children}</h2>
  );
}

export function P({ children }: { children: React.ReactNode }) {
  return <p className="text-xs leading-relaxed text-zinc-500">{children}</p>;
}

export function UL({ children }: { children: React.ReactNode }) {
  return <ul className="flex list-disc flex-col gap-2 pl-5">{children}</ul>;
}

export function LI({ children }: { children: React.ReactNode }) {
  return <li className="text-xs leading-relaxed text-zinc-500">{children}</li>;
}

export function Strong({ children }: { children: React.ReactNode }) {
  return <strong className="font-medium text-zinc-900">{children}</strong>;
}

export function Mail() {
  return (
    <a
      href="mailto:builtbyabdul@gmail.com"
      className="text-zinc-900 transition-colors hover:text-zinc-400"
    >
      builtbyabdul@gmail.com
    </a>
  );
}

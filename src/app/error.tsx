"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  // first-deploy debugging is otherwise blind at the client boundary
  useEffect(() => {
    console.error("app error boundary:", error);
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="px-5 pt-6 md:px-8 md:pt-8">
        <Link href="/" className="text-base font-semibold tracking-tight text-zinc-900">
          Favorites
        </Link>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 pb-24 text-center">
        <p className="text-sm font-semibold tracking-tight text-zinc-900">
          Something went wrong loading this page.
        </p>
        <p className="max-w-xs text-xs leading-relaxed text-zinc-400">
          It&rsquo;s us, not you. Try again in a moment.
        </p>
        <button
          onClick={reset}
          className="mt-2 cursor-pointer text-xs text-zinc-400 transition-colors hover:text-zinc-900"
        >
          Try again →
        </button>
      </div>
    </div>
  );
}

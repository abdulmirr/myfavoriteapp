import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="px-5 pt-6 md:px-8 md:pt-8">
        <Link href="/" className="text-base font-semibold tracking-tight text-zinc-900">
          Favorites
        </Link>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-5 pb-24 text-center">
        <p className="text-sm font-semibold tracking-tight text-zinc-900">
          Nothing lives at this address.
        </p>
        <p className="max-w-xs text-xs leading-relaxed text-zinc-400">
          The page may have moved, or the username you followed may have changed.
        </p>
        <Link
          href="/"
          className="mt-2 text-xs text-zinc-400 transition-colors hover:text-zinc-900"
        >
          ← Home
        </Link>
      </div>
    </div>
  );
}

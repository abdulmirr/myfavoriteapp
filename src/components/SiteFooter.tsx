import Link from "next/link";

/** shared footer for the signed-out surfaces: landing, privacy, terms */
export default function SiteFooter() {
  return (
    <footer className="mx-auto flex w-full max-w-6xl items-center justify-center px-5 py-8 sm:px-8">
      <div className="flex gap-6">
        <Link
          href="/privacy"
          className="text-xs text-zinc-400 transition-colors hover:text-zinc-900"
        >
          Privacy
        </Link>
        <a
          href="mailto:builtbyabdul@gmail.com"
          className="text-xs text-zinc-400 transition-colors hover:text-zinc-900"
        >
          Contact
        </a>
        <Link
          href="/terms"
          className="text-xs text-zinc-400 transition-colors hover:text-zinc-900"
        >
          Terms
        </Link>
      </div>
    </footer>
  );
}

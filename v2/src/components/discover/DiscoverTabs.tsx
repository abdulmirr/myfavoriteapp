import Link from "next/link";
import { cn } from "../ui/styles";

const TABS = [
  { key: "for-you", href: "/discover", label: "For you" },
  { key: "resources", href: "/discover/resources", label: "Resources" },
] as const;

/** Discover's two views — what people love, and antislop's resources — as the profile's underlined tabs, centered. */
export default function DiscoverTabs({ current }: { current: (typeof TABS)[number]["key"] }) {
  return (
    <nav aria-label="Discover" className="flex justify-center gap-7 border-b border-gray-200 dark:border-neutral-800">
      {TABS.map((t) => {
        const on = t.key === current;
        return (
          <Link
            key={t.key}
            href={t.href}
            prefetch={true}
            aria-current={on ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 pb-3 text-[15px] font-semibold outline-none transition-colors focus-visible:text-gray-900",
              on
                ? "border-gray-900 text-gray-900 dark:border-neutral-100 dark:text-neutral-100"
                : "border-transparent text-gray-500 hover:text-gray-900 dark:text-neutral-400 dark:hover:text-neutral-100"
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

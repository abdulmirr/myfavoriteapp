import Link from "next/link";
import Star from "./ui/Star";

/**
 * The gold star beside a lowercase `favorite` wordmark — set like antislop's
 * logo (heavy, tight grotesk), sized to its 130px desktop / 96px phone width.
 */
export default function Logo() {
  return (
    <Link
      href="/"
      aria-label="Favorite — home"
      className="group flex shrink-0 items-center gap-1.5 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-gray-900 sm:gap-2 dark:focus-visible:ring-neutral-400"
    >
      <Star className="size-[22px] text-star transition-transform duration-300 group-hover:rotate-[22deg] sm:size-[27px]" />
      <span className="text-[25px] font-bold leading-none tracking-[-0.055em] text-gray-950 sm:text-[31px] dark:text-white">
        favorite
      </span>
    </Link>
  );
}

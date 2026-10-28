import { thumbCover } from "@/lib/img";
import { cn } from "./ui/styles";

/**
 * A page's color, taken from its covers: a few thumbnails blurred into one
 * soft wash behind the top of the page, fading into the gray below (the
 * profile banner's glow, unboxed). Small thumbnails — the blur hides the
 * resolution, so this costs a few KB.
 */
export default function CoverGlow({ covers, className }: { covers: string[]; className?: string }) {
  const shown = [...new Set(covers)].slice(0, 3);
  if (!shown.length) return null;
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-x-0 top-0 h-[460px] overflow-hidden sm:h-[520px]", className)}>
      <div className="absolute -inset-16 flex scale-110 opacity-70 blur-3xl saturate-[1.7] dark:opacity-45">
        {shown.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={i} src={thumbCover(src, 120)} alt="" className="h-full min-w-0 flex-1 object-cover" />
        ))}
      </div>
      <div className="absolute inset-0 bg-gradient-to-b from-gray-100/20 via-gray-100/65 to-gray-100 dark:from-neutral-900/30 dark:via-neutral-900/70 dark:to-neutral-900" />
    </div>
  );
}

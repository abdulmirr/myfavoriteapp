import { thumbCover } from "@/lib/img";
import { cn } from "./ui/styles";

/**
 * A list's 16:9 cover, playlist-style: an uploaded image fills it; otherwise
 * the newest covers fan out across a soft backdrop of the first one. Empty →
 * antislop's black card.
 */
export default function ListCover({
  coverImage,
  covers,
  title,
  className,
  small = false,
  priority = false,
}: {
  coverImage?: string | null;
  covers: string[];
  title?: string;
  className?: string;
  /** dialog thumbnail (≈85px wide) */
  small?: boolean;
  priority?: boolean;
}) {
  const box = cn("relative aspect-video w-full overflow-hidden rounded-md", className);
  const loading = priority ? ("eager" as const) : ("lazy" as const);

  if (coverImage) {
    return (
      <div className={cn(box, "bg-gray-200 dark:bg-neutral-700")}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={thumbCover(coverImage, small ? 200 : 800)} alt="" loading={loading} decoding="async" className="absolute inset-0 size-full object-cover" />
      </div>
    );
  }
  if (!covers.length) {
    return (
      <div className={cn(box, "flex flex-col justify-center bg-black px-3", small && "px-1.5")}>
        {title && !small && <p className="line-clamp-2 text-base font-semibold leading-snug text-white">{title}</p>}
      </div>
    );
  }
  const shown = covers.slice(0, small ? 3 : 4).map((c) => thumbCover(c, small ? 100 : 300));
  return (
    <div className={cn(box, "bg-gray-200 dark:bg-neutral-700")}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={shown[0]}
        alt=""
        aria-hidden
        loading={loading}
        decoding="async"
        className="absolute inset-0 size-full scale-125 object-cover opacity-60 blur-xl saturate-150 dark:opacity-40"
      />
      <span className="absolute inset-0 bg-white/25 dark:bg-black/30" />
      <div className="absolute inset-0 flex items-center justify-center">
        {shown.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={src + i}
            src={src}
            alt=""
            loading={loading}
            decoding="async"
            style={{ zIndex: shown.length - i }}
            className={cn(
              "aspect-square h-[62%] w-auto rounded-[3px] object-cover shadow-[0_4px_14px_rgba(0,0,0,0.25)]",
              i > 0 && (small ? "-ml-[9%]" : "-ml-[7%]")
            )}
          />
        ))}
      </div>
    </div>
  );
}

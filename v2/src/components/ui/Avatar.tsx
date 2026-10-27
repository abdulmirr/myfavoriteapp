import type { ProfileLite } from "@/lib/types";
import { avatarSrc } from "@/lib/img";
import { cn } from "./styles";

/**
 * antislop's squircle avatar (rounded-[30%]). Falls back to the first letter
 * of the name on a gray tile — never a broken image.
 */
export default function Avatar({
  p,
  className = "size-8",
  eager = false,
  px = 128,
}: {
  p: Pick<ProfileLite, "username" | "display_name" | "avatar_url"> | null | undefined;
  className?: string;
  eager?: boolean;
  /** source width to fetch (128 covers 64px slots at 2x) */
  px?: number;
}) {
  const name = p?.display_name || p?.username || "";
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center overflow-hidden rounded-[30%] bg-gray-200 [container-type:inline-size] dark:bg-neutral-700",
        className
      )}
    >
      {p?.avatar_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarSrc(p.avatar_url, px)}
          alt=""
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          className="aspect-square size-full object-cover"
        />
      ) : (
        // the letter scales with the tile, whatever size the caller picked
        <span className="text-[42cqi] leading-none font-semibold uppercase text-gray-500 dark:text-neutral-300">
          {name.slice(0, 1)}
        </span>
      )}
    </span>
  );
}

/** Up to three overlapping avatars — the people strip on feed cards. */
export function AvatarStack({
  people,
  size = "size-5",
}: {
  people: Pick<ProfileLite, "id" | "username" | "display_name" | "avatar_url">[];
  size?: string;
}) {
  return (
    <span className="flex shrink-0 -space-x-1.5">
      {people.slice(0, 3).map((p) => (
        <Avatar
          key={p.id}
          p={p}
          className={cn(size, "ring-2 ring-gray-50 dark:ring-neutral-800")}
        />
      ))}
    </span>
  );
}

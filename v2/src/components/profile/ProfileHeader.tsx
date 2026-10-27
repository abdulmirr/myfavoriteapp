import type { ProfilePageData } from "@/lib/data";
import { socialHref } from "@/lib/social";
import Avatar from "../ui/Avatar";
import { card, cn } from "../ui/styles";
import SocialIcon from "./SocialIcon";
import ProfileActions from "./ProfileActions";
import ProfileStats from "./ProfileStats";
import ProfileTabs from "./ProfileTabs";

/**
 * antislop's account header — squircle avatar, name, @handle — with
 * Favorite's person layer: bio, links, the stats line, and the actions
 * (Follow / Share / ⋯, or Edit profile / Share on your own page). The tabs
 * tuck under it in antislop's drawer.
 */
export default function ProfileHeader({ profile }: { profile: ProfilePageData }) {
  const name = profile.display_name || profile.username;
  const socials = (profile.socials ?? []).filter((s) => s.url?.trim());
  return (
    <div className="relative">
      <section className={cn(card, "relative z-10 overflow-hidden")}>
        <div className="relative p-4 sm:p-6">
          <div className="flex items-center gap-4">
            <Avatar p={profile} className="size-14 text-xl sm:size-16" eager />
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <h1 className="truncate pb-0.5 text-xl font-semibold leading-none tracking-tight text-gray-900 sm:text-2xl dark:text-neutral-100">
                {name}
              </h1>
              <p className="truncate pb-0.5 text-sm leading-none text-gray-500 dark:text-neutral-400">
                @{profile.username}
              </p>
            </div>
            <div className="hidden shrink-0 sm:block">
              <ProfileActions profile={profile} />
            </div>
          </div>

          {profile.bio?.trim() && (
            <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-gray-700 dark:text-neutral-300">
              {profile.bio.trim()}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2.5">
            {socials.length > 0 && (
              <div className="flex items-center gap-1">
                {socials.map((s) => (
                  <a
                    key={s.label + s.url}
                    href={socialHref(s.url)}
                    target="_blank"
                    rel="noopener noreferrer me"
                    aria-label={s.label}
                    title={s.label}
                    className="inline-flex size-8 items-center justify-center rounded-lg text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-900 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-100"
                  >
                    <SocialIcon label={s.label} />
                  </a>
                ))}
              </div>
            )}
            <ProfileStats profile={profile} />
          </div>

          <div className="mt-4 sm:hidden">
            <ProfileActions profile={profile} stretch />
          </div>
        </div>
      </section>
      <ProfileTabs username={profile.username} />
    </div>
  );
}

export function ProfileHeaderSkeleton() {
  return (
    <div className="relative" aria-busy>
      <section className={cn(card, "relative z-10 p-4 sm:p-6")}>
        <div className="flex items-center gap-4">
          <span className="size-14 animate-pulse rounded-[30%] bg-gray-200 sm:size-16 dark:bg-neutral-700" />
          <div className="flex flex-col gap-2">
            <span className="h-5 w-40 animate-pulse rounded bg-gray-200 dark:bg-neutral-700" />
            <span className="h-3.5 w-24 animate-pulse rounded bg-gray-200 dark:bg-neutral-700" />
          </div>
        </div>
        <span className="mt-5 block h-3.5 w-3/5 animate-pulse rounded bg-gray-200 dark:bg-neutral-700" />
      </section>
      <div className="relative z-0 -mt-4 h-[66px] rounded-b-2xl border border-t-0 border-gray-200 bg-gray-50 dark:border-neutral-700 dark:bg-neutral-800/60" />
    </div>
  );
}

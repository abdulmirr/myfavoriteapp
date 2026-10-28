import type { ProfilePageData } from "@/lib/data";
import { socialHref } from "@/lib/social";
import Avatar from "../ui/Avatar";
import SocialIcon from "./SocialIcon";
import ProfileActions from "./ProfileActions";
import ProfileBanner from "./ProfileBanner";
import ProfileStats from "./ProfileStats";
import ProfileTabs from "./ProfileTabs";

/**
 * A person's page, opening on them: the banner edge to edge (their header,
 * or their covers' color), the avatar over its fading edge, then name,
 * handle, bio, counts and links straight on the page — no card — with the
 * actions on the right (Follow / Share / ⋯, or Share and the settings gear on
 * your own page). The tabs underline beneath.
 */
export default function ProfileHeader({ profile }: { profile: ProfilePageData }) {
  const name = profile.display_name || profile.username;
  const socials = (profile.socials ?? []).filter((s) => s.url?.trim());
  return (
    <header className="relative">
      <ProfileBanner
        profileId={profile.id}
        username={profile.username}
        headerUrl={profile.header_url}
        ambient={profile.ambient}
      />
      <div className="relative mx-auto max-w-5xl px-4 sm:px-6">
        <div className="flex items-end justify-between gap-4">
          <Avatar
            p={profile}
            px={256}
            className="-mt-12 size-24 text-3xl shadow-[0_8px_30px_rgba(0,0,0,0.12)] ring-4 ring-gray-100 sm:-mt-16 sm:size-32 sm:text-4xl dark:ring-neutral-900"
            eager
          />
          <div className="hidden shrink-0 pb-1 sm:block">
            <ProfileActions profile={profile} />
          </div>
        </div>

        <h1 className="mt-4 text-[28px] font-bold leading-[1.1] tracking-[-0.03em] break-words text-gray-950 sm:text-[38px] dark:text-white">
          {name}
        </h1>
        <p className="mt-1 truncate text-[15px] text-gray-500 dark:text-neutral-400">@{profile.username}</p>

        {profile.bio?.trim() && (
          <p className="mt-3 max-w-2xl whitespace-pre-line text-[15px] leading-relaxed text-gray-800 dark:text-neutral-200">
            {profile.bio.trim()}
          </p>
        )}

        <div className="mt-4 flex flex-col gap-1">
          <ProfileStats profile={profile} />
        </div>

        {socials.length > 0 && (
          <div className="-ml-2 mt-3 flex flex-wrap items-center gap-0.5">
            {socials.map((s) => (
              <a
                key={s.label + s.url}
                href={socialHref(s.url)}
                target="_blank"
                rel="noopener noreferrer me"
                aria-label={s.label}
                title={s.label}
                className="inline-flex size-9 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-900/5 hover:text-gray-900 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-neutral-100"
              >
                <SocialIcon label={s.label} />
              </a>
            ))}
          </div>
        )}

        <div className="mt-5 sm:hidden">
          <ProfileActions profile={profile} stretch />
        </div>

        <ProfileTabs username={profile.username} />
      </div>
    </header>
  );
}

export function ProfileHeaderSkeleton() {
  return (
    <div className="relative" aria-busy>
      <div className="h-[150px] w-full animate-pulse bg-gray-200 sm:h-[230px] lg:h-[270px] dark:bg-neutral-800" />
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <span className="-mt-12 block size-24 rounded-[30%] bg-gray-300 ring-4 ring-gray-100 sm:-mt-16 sm:size-32 dark:bg-neutral-700 dark:ring-neutral-900" />
        <span className="mt-5 block h-8 w-56 animate-pulse rounded bg-gray-200 dark:bg-neutral-800" />
        <span className="mt-2 block h-4 w-28 animate-pulse rounded bg-gray-200 dark:bg-neutral-800" />
        <span className="mt-4 block h-4 w-3/5 animate-pulse rounded bg-gray-200 dark:bg-neutral-800" />
        <div className="mt-8 h-px bg-gray-200 dark:bg-neutral-800" />
      </div>
    </div>
  );
}

import type { ProfilePageData } from "@/lib/data";
import { socialHref } from "@/lib/social";
import Avatar from "../ui/Avatar";
import { card, cn } from "../ui/styles";
import SocialIcon from "./SocialIcon";
import ProfileActions from "./ProfileActions";
import ProfileBanner from "./ProfileBanner";
import ProfileStats from "./ProfileStats";
import ProfileTabs from "./ProfileTabs";

/**
 * A person's page header: their banner (a header image, or their top covers
 * blurred), the avatar over its edge, name and handle with the actions
 * (Follow / Share / ⋯, or Share and the settings gear on your own page),
 * then bio → counts → links. The tabs tuck under it in antislop's drawer.
 */
export default function ProfileHeader({ profile }: { profile: ProfilePageData }) {
  const name = profile.display_name || profile.username;
  const socials = (profile.socials ?? []).filter((s) => s.url?.trim());
  return (
    <div className="relative">
      <section className={cn(card, "relative z-10 overflow-hidden")}>
        <ProfileBanner
          profileId={profile.id}
          username={profile.username}
          headerUrl={profile.header_url}
          ambient={profile.ambient}
        />
        <div className="relative px-4 pb-5 sm:px-6 sm:pb-6">
          <div className="flex items-end justify-between gap-3">
            <Avatar
              p={profile}
              px={256}
              className="-mt-10 size-20 text-2xl ring-4 ring-white sm:-mt-12 sm:size-24 sm:text-3xl dark:ring-neutral-800"
              eager
            />
            <div className="hidden shrink-0 pt-3 sm:block">
              <ProfileActions profile={profile} />
            </div>
          </div>

          <h1 className="mt-3 truncate pb-0.5 text-2xl font-semibold leading-tight tracking-tight text-gray-900 sm:text-[28px] dark:text-neutral-100">
            {name}
          </h1>
          <p className="truncate text-sm text-gray-500 dark:text-neutral-400">@{profile.username}</p>

          {profile.bio?.trim() && (
            <p className="mt-3 max-w-2xl whitespace-pre-line text-[15px] leading-relaxed text-gray-800 dark:text-neutral-200">
              {profile.bio.trim()}
            </p>
          )}

          <div className="mt-3 flex flex-col gap-1">
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
      <section className={cn(card, "relative z-10 overflow-hidden")}>
        <div className="aspect-[5/2] w-full animate-pulse bg-gray-200 sm:aspect-[4/1] dark:bg-neutral-700" />
        <div className="px-4 pb-5 sm:px-6 sm:pb-6">
          <span className="-mt-10 block size-20 rounded-[30%] bg-gray-300 ring-4 ring-white sm:-mt-12 sm:size-24 dark:bg-neutral-600 dark:ring-neutral-800" />
          <span className="mt-4 block h-6 w-48 animate-pulse rounded bg-gray-200 dark:bg-neutral-700" />
          <span className="mt-2 block h-3.5 w-24 animate-pulse rounded bg-gray-200 dark:bg-neutral-700" />
          <span className="mt-4 block h-3.5 w-3/5 animate-pulse rounded bg-gray-200 dark:bg-neutral-700" />
        </div>
      </section>
      <div className="relative z-0 -mt-4 h-[66px] rounded-b-2xl border border-t-0 border-gray-200 bg-gray-50 dark:border-neutral-700 dark:bg-neutral-800/60" />
    </div>
  );
}

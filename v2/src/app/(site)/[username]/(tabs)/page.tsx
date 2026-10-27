import type { Metadata } from "next";
import { Suspense } from "react";
import { getFavorites } from "@/lib/data";
import { resolveProfile } from "@/lib/profile-route";
import Wall from "@/components/profile/Wall";

type Params = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { username } = await params;
  const p = await resolveProfile(username);
  const name = p.display_name || `@${p.username}`;
  const description = p.bio?.trim() || `${p.counts.favorites} favorites on Favorite.`;
  return {
    title: name,
    description,
    openGraph: { title: `${name} — Favorite`, description },
    alternates: { canonical: `/${p.username}` },
  };
}

async function Favorites({ params }: Params) {
  const { username } = await params;
  const profile = await resolveProfile(username);
  const items = await getFavorites(profile.id);
  return <Wall items={items} profileId={profile.id} username={profile.username} />;
}

function WallSkeleton() {
  return (
    <div className="pt-2 sm:pt-4" aria-busy>
      <span className="mb-4 block h-5 w-24 animate-pulse rounded bg-gray-200 sm:mb-6 dark:bg-neutral-700" />
      <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4 sm:gap-x-8 lg:gap-x-12">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i}>
            <span className="block aspect-square animate-pulse rounded-md bg-gray-200 dark:bg-neutral-700" />
            <span className="mx-auto mt-2.5 block h-3 w-3/4 animate-pulse rounded bg-gray-200 dark:bg-neutral-700" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function FavoritesPage({ params }: Params) {
  return (
    <Suspense fallback={<WallSkeleton />}>
      <Favorites params={params} />
    </Suspense>
  );
}

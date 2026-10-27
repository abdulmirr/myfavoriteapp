import type { Metadata } from "next";
import { Suspense } from "react";
import { getFavorites } from "@/lib/data";
import { resolveProfile } from "@/lib/profile-route";
import Wall from "@/components/profile/Wall";
import { card, cn } from "@/components/ui/styles";

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
    <div className={cn(card, "p-4 sm:p-6")} aria-busy>
      <div className="mb-5 flex gap-1.5">
        {[56, 64, 56, 80].map((w, i) => (
          <span key={i} className="h-7 animate-pulse rounded-xl bg-gray-200 dark:bg-neutral-700" style={{ width: w }} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-x-3 gap-y-6 sm:grid-cols-4 sm:gap-x-5 sm:gap-y-8">
        {Array.from({ length: 8 }, (_, i) => (
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

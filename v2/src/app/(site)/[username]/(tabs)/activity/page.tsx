import type { Metadata } from "next";
import { Suspense } from "react";
import { getActivity } from "@/lib/data";
import { resolveProfile } from "@/lib/profile-route";
import ActivityFeed from "@/components/profile/ActivityFeed";

type Params = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { username } = await params;
  const p = await resolveProfile(username, "/activity");
  return { title: `${p.display_name || "@" + p.username} — activity`, alternates: { canonical: `/${p.username}/activity` } };
}

async function Activity({ params }: Params) {
  const { username } = await params;
  const p = await resolveProfile(username, "/activity");
  const { events, hasMore } = await getActivity(p.id);
  return (
    <ActivityFeed
      who={{ id: p.id, username: p.username, display_name: p.display_name, avatar_url: p.avatar_url }}
      initial={events}
      hasMore={hasMore}
    />
  );
}

function ActivitySkeleton() {
  return (
    <div className="flex flex-col gap-4 sm:gap-5" aria-busy>
      {[0, 1, 2].map((i) => (
        <div key={i}>
          <div className="mx-2 -mb-4 h-[52px] rounded-t-2xl border border-b-0 border-gray-200 bg-gray-50 dark:border-neutral-700 dark:bg-neutral-800/60" />
          <div className="relative z-10 flex gap-4 rounded-2xl border border-gray-200 bg-white p-3.5 dark:border-neutral-700 dark:bg-neutral-800">
            <span className="aspect-video w-[36%] max-w-56 animate-pulse rounded-md bg-gray-200 dark:bg-neutral-700" />
            <div className="flex flex-1 flex-col gap-2">
              <span className="h-4 w-3/4 animate-pulse rounded bg-gray-200 dark:bg-neutral-700" />
              <span className="h-3 w-1/3 animate-pulse rounded bg-gray-200 dark:bg-neutral-700" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ActivityPage({ params }: Params) {
  return (
    <Suspense fallback={<ActivitySkeleton />}>
      <Activity params={params} />
    </Suspense>
  );
}

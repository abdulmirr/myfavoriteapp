import type { Metadata } from "next";
import { Suspense } from "react";
import { getPublicLists } from "@/lib/data";
import { resolveProfile } from "@/lib/profile-route";
import ListsGrid from "@/components/lists/ListsGrid";

type Params = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { username } = await params;
  const p = await resolveProfile(username, "/lists");
  return { title: `${p.display_name || "@" + p.username} — lists`, alternates: { canonical: `/${p.username}/lists` } };
}

async function Lists({ params }: Params) {
  const { username } = await params;
  const p = await resolveProfile(username, "/lists");
  const lists = await getPublicLists(p.id);
  return <ListsGrid lists={lists} profileId={p.id} username={p.username} />;
}

function ListsSkeleton() {
  return (
    <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4" aria-busy>
      {[0, 1].map((i) => (
        <li key={i} className="rounded-2xl border border-gray-200 bg-white p-3.5 dark:border-neutral-700 dark:bg-neutral-800">
          <span className="block aspect-video animate-pulse rounded-md bg-gray-200 dark:bg-neutral-700" />
          <span className="mt-3 block h-4 w-1/2 animate-pulse rounded bg-gray-200 dark:bg-neutral-700" />
          <span className="mt-2 block h-3 w-1/3 animate-pulse rounded bg-gray-200 dark:bg-neutral-700" />
        </li>
      ))}
    </ul>
  );
}

export default function ListsPage({ params }: Params) {
  return (
    <Suspense fallback={<ListsSkeleton />}>
      <Lists params={params} />
    </Suspense>
  );
}

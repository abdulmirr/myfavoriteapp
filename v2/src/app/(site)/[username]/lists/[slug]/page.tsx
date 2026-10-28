import type { Metadata } from "next";
import { Suspense } from "react";
import { getList, getPublicListParams } from "@/lib/data";
import ListView from "@/components/lists/ListView";
import ListGate from "@/components/lists/ListGate";
import { WorkRowSkeleton } from "@/components/WorkRow";

type Params = { params: Promise<{ username: string; slug: string }> };

/** Public lists prerender; private ones resolve client-side for their owner. */
export async function generateStaticParams() {
  const lists = await getPublicListParams();
  // Cache Components needs at least one sample to build the shell
  return lists.length ? lists : [{ username: "_", slug: "_" }];
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { username, slug } = await params;
  const data = await getList(decodeURIComponent(username), decodeURIComponent(slug));
  if (!data) return { title: "List", robots: { index: false } };
  const { list, owner } = data;
  const description = list.description?.trim() || `${list.count} ${list.count === 1 ? "item" : "items"} by @${owner.username} on Favorite.`;
  // the image is this folder's opengraph-image (file-based metadata wins)
  return {
    title: `${list.title} by @${owner.username}`,
    description,
    openGraph: { title: list.title, description },
    alternates: { canonical: `/${owner.username}/lists/${list.slug}` },
  };
}

async function List({ params }: Params) {
  const { username, slug } = await params;
  const u = decodeURIComponent(username);
  const s = decodeURIComponent(slug);
  const data = await getList(u, s);
  if (!data) return <ListGate username={u} slug={s} />;
  return <ListView list={data.list} owner={data.owner} items={data.items} />;
}

/** The hero's shape (cover, title, meta) and a few rows, while the list loads. */
function ListSkeleton() {
  return (
    <div className="mx-auto max-w-3xl px-4 pt-4 sm:px-6 sm:pt-10" aria-busy>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:gap-8">
        <span className="aspect-video w-full shrink-0 animate-pulse rounded-md bg-gray-200 sm:w-72 dark:bg-neutral-800" />
        <div className="flex flex-1 flex-col gap-3 sm:pb-1">
          <span className="h-3 w-12 animate-pulse rounded bg-gray-200 dark:bg-neutral-800" />
          <span className="h-9 w-3/4 animate-pulse rounded bg-gray-200 dark:bg-neutral-800" />
          <span className="h-4 w-1/2 animate-pulse rounded bg-gray-200 dark:bg-neutral-800" />
        </div>
      </div>
      <div className="mt-10 flex flex-col">
        {[0, 1, 2, 3].map((i) => (
          <WorkRowSkeleton key={i} lead />
        ))}
      </div>
    </div>
  );
}

export default function ListPage({ params }: Params) {
  return (
    <main className="relative pb-20">
      <Suspense fallback={<ListSkeleton />}>
        <List params={params} />
      </Suspense>
    </main>
  );
}

import type { Metadata } from "next";
import { Suspense } from "react";
import { getList, getPublicListParams } from "@/lib/data";
import ListView from "@/components/lists/ListView";
import ListGate from "@/components/lists/ListGate";

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
  const { list, owner, items } = data;
  const description = list.description?.trim() || `${list.count} ${list.count === 1 ? "item" : "items"} by @${owner.username} on Favorite.`;
  // an openGraph block without images would drop the site card, so fall back
  // to the newest cover in the list, then to the site card itself
  const image = list.cover_image_url ?? items.find((i) => i.image_url)?.image_url ?? "/opengraph-image";
  return {
    title: `${list.title} by @${owner.username}`,
    description,
    openGraph: { title: list.title, description, images: [image] },
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

export default function ListPage({ params }: Params) {
  return (
    <main className="mx-auto max-w-2xl px-4 pt-2 pb-16 sm:px-6 sm:pt-8">
      <Suspense
        fallback={
          <div className="h-44 animate-pulse rounded-2xl border border-gray-200 bg-white dark:border-neutral-700 dark:bg-neutral-800" />
        }
      >
        <List params={params} />
      </Suspense>
    </main>
  );
}

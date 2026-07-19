import type { Metadata } from "next";
import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import type { Item, Profile } from "@/lib/types";
import Library from "@/components/Library";

// generateMetadata and the page both need this row — cache() collapses the
// two lookups into one query per request
const getProfile = cache(async (username: string) => {
  const { data } = await supabaseServer()
    .from("profiles")
    .select("id, user_id, username, display_name, bio, avatar_url, socials")
    .eq("username", username)
    .single<Profile>();
  return data;
});

export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ username: string }>;
  searchParams: Promise<{ item?: string }>;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** "12 favorites — books, films, music" */
function librarySummary(items: Pick<Item, "media_type">[]): string {
  const label: Record<string, string> = {
    book: "books", movie: "films", tv: "shows", music: "music",
    podcast: "podcasts", video: "videos", article: "links",
  };
  const kinds = [...new Set(items.map((i) => label[i.media_type]).filter(Boolean))].slice(0, 3);
  const count = `${items.length} favorite${items.length === 1 ? "" : "s"}`;
  return kinds.length ? `${count} — ${kinds.join(", ")}` : count;
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const [{ username }, { item: itemId }] = await Promise.all([params, searchParams]);
  const db = supabaseServer();

  const profile = await getProfile(username);
  if (!profile) return {};

  const name = profile.display_name || `@${profile.username}`;

  // deep link to a single favorite → item-specific card
  if (itemId && UUID_RE.test(itemId)) {
    const { data: item } = await db
      .from("items")
      .select("title, creator, description, image_url")
      .eq("id", itemId)
      .eq("profile_id", profile.id)
      .maybeSingle<Pick<Item, "title" | "creator" | "description" | "image_url">>();
    if (item) {
      const title = `${item.title}${item.creator ? ` by ${item.creator}` : ""}`;
      const description = item.description || `A favorite of ${name}.`;
      return {
        title,
        description,
        openGraph: {
          title,
          description,
          ...(item.image_url ? { images: [item.image_url] } : {}),
        },
        twitter: item.image_url ? { card: "summary", images: [item.image_url] } : undefined,
        alternates: { canonical: `/${profile.username}` },
      };
    }
  }

  // the items summary is only the fallback description — skip the query
  // entirely when the profile has a bio
  const bio = profile.bio?.trim();
  let description = bio || "";
  if (!bio) {
    const { data: items } = await db
      .from("items")
      .select("media_type")
      .eq("profile_id", profile.id);
    description = librarySummary(items ?? []);
  }

  return {
    title: name,
    description,
    openGraph: { title: `${name} — Favorites`, description },
    alternates: { canonical: `/${profile.username}` },
  };
}

export default async function ProfilePage({ params, searchParams }: Props) {
  const [{ username }, { item: itemId }] = await Promise.all([params, searchParams]);
  const db = supabaseServer();

  const profile = await getProfile(username);

  if (!profile) {
    // renamed profiles leave a redirect behind, so shared links keep working
    const { data: moved } = await db
      .from("username_history")
      .select("profile_id")
      .eq("old_username", username.toLowerCase())
      .maybeSingle();
    if (moved) {
      const { data: current } = await db
        .from("profiles")
        .select("username")
        .eq("id", moved.profile_id)
        .maybeSingle();
      if (current) {
        redirect(
          `/${current.username}${itemId && UUID_RE.test(itemId) ? `?item=${itemId}` : ""}`
        );
      }
    }
    notFound();
  }

  const { data: items, error: itemsError } = await db
    .from("items")
    .select("*")
    .eq("profile_id", profile.id)
    .order("sort_order", { ascending: true });

  // a query failure must not masquerade as an empty library
  if (itemsError) throw new Error(itemsError.message);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ProfilePage",
    mainEntity: {
      "@type": "Person",
      name: profile.display_name || profile.username,
      alternateName: `@${profile.username}`,
      description: profile.bio || undefined,
      url: `https://myfavoriteapp.com/${profile.username}`,
    },
    hasPart: {
      "@type": "ItemList",
      numberOfItems: items?.length ?? 0,
      itemListElement: (items ?? []).slice(0, 20).map((i, idx) => ({
        "@type": "ListItem",
        position: idx + 1,
        name: i.title,
        ...(i.view_url ? { url: i.view_url } : {}),
      })),
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Library
        profile={profile}
        initialItems={(items ?? []) as Item[]}
        initialItemId={itemId && UUID_RE.test(itemId) ? itemId : null}
      />
    </>
  );
}

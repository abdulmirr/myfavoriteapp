import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase";
import type { Item, Profile } from "@/lib/types";

/**
 * The Four Favorites page — the evergreen, bio-linkable answer to "what are
 * your four favorites?" across every medium. Pinned picks lead; a library
 * that hasn't pinned yet falls back to its top row so the link always shows
 * taste, never an empty room.
 */

// ISR, not force-dynamic: these pages are sitemap-advertised and bio-linked —
// an hour of staleness beats a fresh DB render per crawler/visitor hit
export const revalidate = 3600;

const getProfile = cache(async (username: string) => {
  const { data } = await supabaseServer()
    .from("profiles")
    .select("id, user_id, username, display_name, bio, avatar_url, socials")
    .eq("username", username)
    .single<Profile>();
  return data;
});

const getFour = cache(async (profileId: string) => {
  const { data } = await supabaseServer()
    .from("items")
    .select("id, title, creator, image_url, media_type, pinned_order, view_url")
    .eq("profile_id", profileId)
    .order("pinned_order", { ascending: true, nullsFirst: false })
    .order("sort_order", { ascending: true })
    .limit(4);
  return (data ?? []) as Pick<
    Item,
    "id" | "title" | "creator" | "image_url" | "media_type" | "pinned_order" | "view_url"
  >[];
});

type Props = { params: Promise<{ username: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { username } = await params;
  const profile = await getProfile(username);
  if (!profile) return {};
  const name = profile.display_name || `@${profile.username}`;
  const four = await getFour(profile.id);
  const titles = four.map((i) => i.title).join(" · ");
  return {
    title: `The four favorites of ${name}`,
    description: titles || `Four favorites, any medium — ${name} on Favorites.`,
    openGraph: {
      title: `The four favorites of ${name}`,
      description: titles,
    },
    alternates: { canonical: `/${profile.username}/four` },
  };
}

const TYPE_LABEL: Record<string, string> = {
  book: "Book", movie: "Film", tv: "TV", music: "Album",
  podcast: "Podcast", video: "Video", article: "Read", photo: "Photo", other: "",
};

export default async function FourPage({ params }: Props) {
  const { username } = await params;
  const profile = await getProfile(username);

  if (!profile) {
    // renamed profiles leave a redirect behind, so shared links keep working
    const db = supabaseServer();
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
      if (current) redirect(`/${current.username}/four`);
    }
    notFound();
  }

  const four = await getFour(profile.id);
  const name = profile.display_name || `@${profile.username}`;
  const pinnedFour = four.filter((i) => i.pinned_order).length === 4;

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <nav className="flex items-center px-5 pt-6 md:px-8 md:pt-8">
        <Link href="/" aria-label="Home" className="w-fit transition-opacity hover:opacity-70">
          <img src="/favicon.svg" alt="Favorites" className="h-6 w-auto" />
        </Link>
      </nav>

      <main className="flex flex-1 flex-col items-center justify-center px-5 py-16">
        <p className="text-[10px] uppercase tracking-[0.14em] text-zinc-400">
          The four favorites of
        </p>
        <h1 className="mt-2 text-center text-2xl font-semibold tracking-tight text-zinc-900 sm:text-3xl">
          {name}
        </h1>
        <Link
          href={`/${profile.username}`}
          className="mt-1 text-xs text-zinc-400 transition-colors hover:text-zinc-900"
        >
          @{profile.username}
        </Link>

        {four.length ? (
          <div className="mt-12 grid w-full max-w-3xl grid-cols-2 gap-6 sm:grid-cols-4 sm:gap-8">
            {four.map((item) => (
              <div key={item.id} className="flex flex-col">
                <div className="aspect-[2/3] w-full overflow-hidden bg-zinc-100 shadow-[0_8px_32px_rgba(0,0,0,0.14)]">
                  {item.image_url && (
                    <img
                      src={item.image_url}
                      alt={item.title}
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                {TYPE_LABEL[item.media_type] && (
                  <p className="mt-3 text-[9px] uppercase tracking-[0.12em] text-zinc-300">
                    {TYPE_LABEL[item.media_type]}
                  </p>
                )}
                <h2 className="mt-0.5 text-[13px] leading-snug tracking-[-0.01em] text-zinc-900">
                  {item.title}
                </h2>
                {item.creator && (
                  <p className="truncate text-xs text-zinc-400">{item.creator}</p>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-12 text-xs text-zinc-400">Nothing here yet.</p>
        )}

        {!pinnedFour && four.length > 0 && (
          <p className="mt-8 text-[11px] text-zinc-300">
            Showing the top of the wall — pinning a Top 4 makes this page yours.
          </p>
        )}

        <div className="mt-12 flex items-center gap-6 text-xs">
          <Link
            href={`/${profile.username}`}
            className="text-zinc-900 underline underline-offset-4 transition-colors hover:text-zinc-500"
          >
            Full library →
          </Link>
          {four.length > 0 && (
            <a
              href={`/${profile.username}/four/story`}
              download={`four-favorites-${profile.username}.png`}
              className="text-zinc-400 transition-colors hover:text-zinc-900"
            >
              Story card ↓
            </a>
          )}
          <Link
            href="/signin"
            className="text-zinc-400 transition-colors hover:text-zinc-900"
          >
            What are your four?
          </Link>
        </div>
      </main>
    </div>
  );
}

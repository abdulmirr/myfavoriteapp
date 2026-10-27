import { Suspense } from "react";
import { getAllUsernames } from "@/lib/data";
import { resolveProfile } from "@/lib/profile-route";
import ProfileHeader, { ProfileHeaderSkeleton } from "@/components/profile/ProfileHeader";

/** Every profile is prerendered; new ones get an instant shell, then cache. */
export async function generateStaticParams() {
  const names = await getAllUsernames();
  return names.map((username) => ({ username }));
}

async function Header({ params }: { params: Promise<{ username: string }> }) {
  const { username } = await params;
  return <ProfileHeader profile={await resolveProfile(username)} />;
}

export default function ProfileLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ username: string }>;
}) {
  return (
    <main className="mx-auto max-w-5xl px-4 pt-2 pb-16 sm:px-6 sm:pt-8">
      <Suspense fallback={<ProfileHeaderSkeleton />}>
        <Header params={params} />
      </Suspense>
      <div className="mt-6">{children}</div>
    </main>
  );
}

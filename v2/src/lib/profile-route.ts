import "server-only";
import { notFound, redirect } from "next/navigation";
import { getProfile, getRenamedHandle, type ProfilePageData } from "./data";

/**
 * Resolve a /[username] param to a profile — following renames (old links
 * keep working) and 404ing unknown handles. Cached reads underneath.
 */
export async function resolveProfile(raw: string, suffix = ""): Promise<ProfilePageData> {
  const username = decodeURIComponent(raw);
  const profile = (await getProfile(username)) ?? (username !== username.toLowerCase() ? await getProfile(username.toLowerCase()) : null);
  if (profile) return profile;
  const moved = await getRenamedHandle(username);
  if (moved) redirect(`/${moved}${suffix}`);
  notFound();
}

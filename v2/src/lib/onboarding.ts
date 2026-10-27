"use client";

import { supabase } from "./supabase";
import { createList, markOnboarded, viewer } from "./viewer";

/** Where /welcome remembers its beat, so a reload resumes instead of restarting. */
export const welcomeBeatKey = (profileId: string) => `fav2:welcome:${profileId}`;

/**
 * Close out onboarding: stamp profile_private.onboarded_at (retried once — a
 * silent miss would send the next visit to Home straight back to /welcome),
 * give the account its private "Check later" list, then flip the viewer
 * store. Returns false only when the stamp itself failed.
 */
export async function finishOnboarding(): Promise<boolean> {
  const me = viewer().profile;
  if (!me) return false;
  const stamp = () =>
    supabase()
      .from("profile_private")
      .upsert({ profile_id: me.id, onboarded_at: new Date().toISOString() }, { onConflict: "profile_id" });
  let { error } = await stamp();
  if (error) {
    await new Promise((r) => setTimeout(r, 1200));
    ({ error } = await stamp());
  }
  if (error) return false;
  try {
    sessionStorage.removeItem(welcomeBeatKey(me.id));
  } catch {}
  // a unique slug per person makes a double run (two tabs, Strict Mode) a no-op
  if (!viewer().lists.length) await createList({ title: "Check later", isPublic: false }).catch(() => {});
  markOnboarded();
  return true;
}

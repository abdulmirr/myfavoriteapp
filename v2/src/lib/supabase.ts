import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

let browserClient: SupabaseClient | null = null;

/** Browser singleton — holds the auth session (localStorage). */
export function supabase(): SupabaseClient {
  if (!browserClient) browserClient = createClient(url, anon);
  return browserClient;
}

/** Stateless client for server components (public reads only). */
export function supabaseServer(): SupabaseClient {
  return createClient(url, anon, { auth: { persistSession: false } });
}

/** Authorization header for calls to our own API routes ({} when signed out). */
export async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase().auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

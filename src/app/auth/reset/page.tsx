"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useSystemTheme } from "@/lib/use-system-theme";

/**
 * Password-reset landing page. The email link carries a recovery token that
 * supabase-js exchanges for a session on load; once it lands, the user picks
 * a new password here.
 */
export default function ResetPasswordPage() {
  useSystemTheme();
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [expired, setExpired] = useState(false);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const db = supabase();
    db.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    const { data: sub } = db.auth.onAuthStateChange((event, session) => {
      if (session) setReady(true);
    });
    // the token exchange is quick — if no session shows up, the link is dead
    const timer = setTimeout(() => setExpired(true), 4000);
    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  const submit = async () => {
    if (pw.length < 6) {
      setError("At least 6 characters.");
      return;
    }
    setBusy(true);
    setError("");
    const { error: err } = await supabase().auth.updateUser({ password: pw });
    if (err) {
      setError(err.message);
      setBusy(false);
    } else {
      router.replace("/");
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="px-5 pt-6 md:px-8 md:pt-8">
        <Link href="/" className="text-base font-semibold tracking-tight text-zinc-900">
          Favorites
        </Link>
      </div>

      <div className="flex flex-1 items-center justify-center px-5 pb-24">
        <div className="w-full max-w-xs">
          {ready ? (
            <>
              <h1 className="text-sm font-semibold tracking-tight text-zinc-900">
                Choose a new password
              </h1>
              <div className="mt-6 flex flex-col gap-2">
                <input
                  type="password"
                  value={pw}
                  autoFocus
                  onChange={(e) => setPw(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && submit()}
                  placeholder="new password"
                  className="h-9 border border-zinc-200 bg-white px-3 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none"
                />
                <button
                  onClick={submit}
                  disabled={busy || !pw}
                  className="h-9 cursor-pointer bg-zinc-900 px-4 text-xs font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-wait disabled:bg-zinc-400"
                >
                  {busy ? "..." : "Update password"}
                </button>
              </div>
              {error && <p className="save-appear mt-3 text-[11px] text-red-500">{error}</p>}
            </>
          ) : expired ? (
            <>
              <h1 className="text-sm font-semibold tracking-tight text-zinc-900">
                That link didn&rsquo;t work
              </h1>
              <p className="mt-2 text-xs leading-relaxed text-zinc-500">
                Reset links expire quickly and only work once. Request a new one from the
                sign-in page.
              </p>
              <Link
                href="/signin"
                className="mt-4 inline-block text-xs text-zinc-400 transition-colors hover:text-zinc-900"
              >
                ← Back to sign in
              </Link>
            </>
          ) : (
            <p className="text-xs text-zinc-400">Checking your link…</p>
          )}
        </div>
      </div>
    </div>
  );
}

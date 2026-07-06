"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { safeNext } from "@/lib/safe-next";

/**
 * OAuth / email-confirmation landing. Supabase can hand us:
 *  - a `code` (PKCE) to exchange,
 *  - tokens in the URL hash (implicit flow) that supabase-js parses on init,
 *  - or an error, as `?error=…` or `#error=…` (expired link, denied consent).
 * We wait for a real session before forwarding, and surface failures instead
 * of bouncing silently to the landing page.
 */
function Callback() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState("");

  useEffect(() => {
    const db = supabase();
    const next = safeNext(params.get("next"));

    // errors can arrive in the query OR the hash fragment
    const hash = new URLSearchParams(
      typeof window !== "undefined" ? window.location.hash.replace(/^#/, "") : ""
    );
    const errCode = params.get("error_code") || hash.get("error_code");
    const errDesc =
      params.get("error_description") ||
      hash.get("error_description") ||
      params.get("error") ||
      hash.get("error");
    if (errCode || errDesc) {
      setError(
        /expired|otp/i.test(`${errCode} ${errDesc}`)
          ? "This link has expired. Request a new one from the sign-in page."
          : decodeURIComponent(errDesc || "Sign-in failed.").replace(/\+/g, " ")
      );
      return;
    }

    let settled = false;
    const go = () => {
      if (settled) return;
      settled = true;
      router.replace(next);
    };

    const run = async () => {
      const code = params.get("code");
      if (code) {
        const { error } = await db.auth.exchangeCodeForSession(code);
        if (error) {
          setError("This link has expired. Request a new one from the sign-in page.");
          return;
        }
        go();
        return;
      }
      // implicit flow: tokens live in the hash and are parsed asynchronously —
      // wait for the session rather than navigating and stripping the hash.
      const { data } = await db.auth.getSession();
      if (data.session) return go();
    };

    const { data: sub } = db.auth.onAuthStateChange((_e, session) => {
      if (session) go();
    });
    // if nothing lands, the link was already consumed or invalid
    const timer = setTimeout(() => {
      if (!settled) {
        setError("This link has expired. Request a new one from the sign-in page.");
      }
    }, 5000);

    run();
    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      {error ? (
        <div className="w-full max-w-xs text-center">
          <p className="text-xs leading-relaxed text-zinc-500">{error}</p>
          <Link
            href="/signin"
            className="mt-4 inline-block text-xs text-zinc-400 transition-colors hover:text-zinc-900"
          >
            ← Back to sign in
          </Link>
        </div>
      ) : (
        <p className="text-xs text-zinc-400">Signing you in…</p>
      )}
    </div>
  );
}

export default function AuthCallback() {
  return (
    <Suspense>
      <Callback />
    </Suspense>
  );
}

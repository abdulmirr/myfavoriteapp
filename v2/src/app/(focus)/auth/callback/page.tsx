"use client";

import Link from "next/link";
import { Suspense, useEffect, useState, useSyncExternalStore } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { safeNext } from "@/lib/safe-next";

const EXPIRED = "This link has expired. Request a new one from the sign-in page.";
const noop = () => () => {};

/** An expired or denied link says so in the query or the hash. */
function linkError(params: URLSearchParams, rawHash: string): string {
  const hash = new URLSearchParams(rawHash.replace(/^#/, ""));
  const code = params.get("error_code") || hash.get("error_code");
  const desc = params.get("error_description") || hash.get("error_description") || params.get("error") || hash.get("error");
  if (!code && !desc) return "";
  return /expired|otp/i.test(`${code} ${desc}`) ? EXPIRED : decodeURIComponent(desc || "Sign-in failed.").replace(/\+/g, " ");
}

/**
 * OAuth / email-confirmation landing (logic unchanged from v1): exchange a
 * PKCE `code`, or wait for hash tokens; surface expired/denied links instead
 * of bouncing silently.
 */
function Callback() {
  const router = useRouter();
  const params = useSearchParams();
  const hash = useSyncExternalStore(noop, () => window.location.hash, () => "");
  const urlError = linkError(params, hash);
  const [failed, setFailed] = useState(false);
  const error = urlError || (failed ? EXPIRED : "");

  useEffect(() => {
    if (urlError) return;
    const db = supabase();
    const next = safeNext(params.get("next"));
    let settled = false;
    const go = () => {
      if (settled) return;
      settled = true;
      router.replace(next);
    };
    const run = async () => {
      const code = params.get("code");
      if (code) {
        const { error: err } = await db.auth.exchangeCodeForSession(code);
        if (err) return setFailed(true);
        return go();
      }
      const { data } = await db.auth.getSession();
      if (data.session) go();
    };
    const { data: sub } = db.auth.onAuthStateChange((_e, session) => session && go());
    const timer = setTimeout(() => {
      if (!settled) setFailed(true);
    }, 5000);
    void run();
    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one exchange per landing
  }, [urlError]);

  return (
    <div className="mx-auto mt-24 w-full max-w-sm px-4 text-center">
      {error ? (
        <>
          <p className="text-sm leading-relaxed text-gray-600 dark:text-neutral-300">{error}</p>
          <Link href="/signin" className="mt-4 inline-block text-sm font-semibold text-gray-900 underline underline-offset-4 dark:text-neutral-100">
            Back to sign in
          </Link>
        </>
      ) : (
        <p className="animate-pulse text-sm text-gray-500 dark:text-neutral-400">Signing you in…</p>
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

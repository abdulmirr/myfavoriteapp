"use client";

import Star from "@/components/Star";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useSystemTheme } from "@/lib/use-system-theme";
import { safeNext } from "@/lib/safe-next";

/**
 * Dedicated sign-in screen — a clean empty page, no library behind it.
 * Email + password (account auto-created on first use) or Google.
 * `?next=/path` survives the whole round trip (incl. OAuth and the
 * confirmation email), so a shared library or item is never lost.
 */

function SignIn() {
  useSystemTheme();
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<"confirm" | "reset" | null>(null);

  // already signed in → straight home
  useEffect(() => {
    supabase()
      .auth.getSession()
      .then(({ data }) => {
        if (data.session) router.replace(next);
      });
  }, [router, next]);

  const submit = async () => {
    if (!email.trim() || !password) return;
    setBusy(true);
    setError("");
    const db = supabase();

    const { error: signInErr } = await db.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (!signInErr) {
      router.replace(next);
      return;
    }

    if (/email not confirmed/i.test(signInErr.message)) {
      setSent("confirm");
      setBusy(false);
      return;
    }

    if (/invalid login credentials/i.test(signInErr.message)) {
      const { data, error: signUpErr } = await db.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
      });
      if (signUpErr) {
        setError(
          /already registered/i.test(signUpErr.message)
            ? "Wrong password for this account."
            : signUpErr.message
        );
      } else if (data.session) {
        router.replace(next);
        return;
      } else if (data.user && data.user.identities?.length === 0) {
        // with confirmations on, signUp for an existing email "succeeds"
        // with no identities — so the password above was simply wrong
        setError("Wrong password for this account.");
      } else {
        setSent("confirm");
      }
    } else {
      setError(signInErr.message);
    }
    setBusy(false);
  };

  const forgot = async () => {
    if (!email.trim()) {
      setError("Enter your email above first.");
      return;
    }
    setBusy(true);
    setError("");
    const { error: err } = await supabase().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/reset`,
    });
    if (err) setError(err.message);
    else setSent("reset");
    setBusy(false);
  };

  const google = async () => {
    setError("");
    const { error: err } = await supabase().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    if (err) setError(err.message);
  };

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <div className="px-5 pt-6 md:px-8 md:pt-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-base font-semibold tracking-tight text-zinc-900"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <Star className="h-5 w-5 text-zinc-900" />
          Favorites
        </Link>
      </div>

      <div className="flex flex-1 items-center justify-center px-5 pb-24">
        {sent ? (
          <div className="w-full max-w-xs save-appear">
            <h1 className="text-sm font-semibold tracking-tight text-zinc-900">
              Check your email
            </h1>
            <p className="mt-2 text-xs leading-relaxed text-zinc-500">
              {sent === "confirm"
                ? `We sent a confirmation link to ${email.trim()}. Open it to finish signing up.`
                : `We sent a password reset link to ${email.trim()}.`}
            </p>
            <button
              onClick={() => setSent(null)}
              className="mt-4 cursor-pointer text-xs text-zinc-400 transition-colors hover:text-zinc-900"
            >
              ← Back
            </button>
          </div>
        ) : (
        <div className="w-full max-w-xs">
          <h1 className="text-sm font-semibold tracking-tight text-zinc-900">Sign in</h1>
          <p className="mt-1 text-xs text-zinc-500">
            New here? Same form — your account is created automatically.
          </p>

          <div className="mt-6 flex flex-col gap-2">
            <input
              type="email"
              value={email}
              autoFocus
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="h-9 border border-zinc-200 bg-white px-3 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none"
            />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
              placeholder="password"
              className="h-9 border border-zinc-200 bg-white px-3 text-xs text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-400 focus:outline-none"
            />
            <button
              onClick={submit}
              disabled={busy || !email.trim() || !password}
              className="h-9 cursor-pointer bg-zinc-900 px-4 text-xs font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-wait disabled:bg-zinc-400"
            >
              {busy ? "..." : "Continue"}
            </button>
            <button
              onClick={forgot}
              disabled={busy}
              className="w-fit cursor-pointer text-[11px] text-zinc-400 transition-colors hover:text-zinc-900"
            >
              Forgot password?
            </button>
          </div>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-zinc-200" />
            <span className="text-[10px] uppercase tracking-[0.08em] text-zinc-400">or</span>
            <div className="h-px flex-1 bg-zinc-200" />
          </div>

          <button
            onClick={google}
            className="flex h-9 w-full cursor-pointer items-center justify-center gap-2 border border-zinc-200 bg-white text-xs text-zinc-900 transition-colors hover:border-zinc-400"
          >
            <svg width="13" height="13" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.2C12.4 13.4 17.7 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.4 6.9-17.7z" />
              <path fill="#FBBC05" d="M10.5 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.9-6.2C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.8l7.9-6.2z" />
              <path fill="#34A853" d="M24 48c6.3 0 11.6-2.1 15.5-5.7l-7.7-6c-2.1 1.4-4.8 2.3-7.8 2.3-6.3 0-11.6-3.9-13.5-9.4l-7.9 6.2C6.5 42.6 14.6 48 24 48z" />
            </svg>
            Continue with Google
          </button>

          {error && <p className="save-appear mt-3 text-[11px] text-red-500">{error}</p>}
        </div>
        )}
      </div>
    </div>
  );
}

export default function SignInPage() {
  return (
    <Suspense>
      <SignIn />
    </Suspense>
  );
}

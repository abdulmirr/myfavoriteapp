"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { safeNext } from "@/lib/safe-next";
import { card, cn, field, fieldLabel, primaryButton } from "@/components/ui/styles";

/**
 * antislop's login card. Email + password (an account is created on first
 * use, then confirmed by email) or Google. `?next=/path` survives the whole
 * round trip — OAuth and the confirmation email included.
 */
function SignIn() {
  const router = useRouter();
  const next = safeNext(useSearchParams().get("next"));
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState<"confirm" | "reset" | null>(null);

  useEffect(() => {
    supabase()
      .auth.getSession()
      .then(({ data }) => data.session && router.replace(next));
  }, [router, next]);

  const confirmUrl = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  const submit = async () => {
    if (!email.trim() || !password) return;
    setBusy(true);
    setError("");
    const db = supabase();
    const { error: signInErr } = await db.auth.signInWithPassword({ email: email.trim(), password });
    if (!signInErr) return router.replace(next);
    if (/email not confirmed/i.test(signInErr.message)) {
      setSent("confirm");
      return setBusy(false);
    }
    if (/invalid login credentials/i.test(signInErr.message)) {
      // first time here — this creates the account (confirmed by email)
      const { data, error: signUpErr } = await db.auth.signUp({
        email: email.trim(),
        password,
        options: { emailRedirectTo: confirmUrl() },
      });
      if (signUpErr) {
        setError(/already registered/i.test(signUpErr.message) ? "Wrong password for this account." : signUpErr.message);
      } else if (data.session) {
        return router.replace(next);
      } else if (data.user && data.user.identities?.length === 0) {
        // an existing email "signs up" with no identities — the password was wrong
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
    if (!email.trim()) return setError("Enter your email first.");
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
      options: { redirectTo: confirmUrl() },
    });
    if (err) setError(err.message);
  };

  if (sent) {
    return (
      <div className="mx-auto mt-16 w-full max-w-sm px-4 text-center sm:mt-24">
        <h1 className="text-[28px] font-semibold tracking-tight text-gray-900 dark:text-neutral-100">Check your inbox</h1>
        <p className="mt-3 text-sm leading-relaxed text-gray-500 dark:text-neutral-400">
          {sent === "confirm"
            ? `We sent a confirmation link to ${email.trim()}. Open it to finish — you'll land right back here.`
            : `We sent a password reset link to ${email.trim()}.`}
        </p>
        <button
          type="button"
          onClick={() => setSent(null)}
          className="mt-6 cursor-pointer text-sm font-semibold text-gray-900 underline underline-offset-4 dark:text-neutral-100"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto mt-10 w-full max-w-sm px-4 pb-16 sm:mt-20">
      <h1 className="text-center text-[28px] font-semibold tracking-tight text-gray-900 sm:text-[32px] dark:text-neutral-100">
        {mode === "login" ? "Welcome back" : "Join Favorite"}
      </h1>
      {mode === "signup" && (
        <p className="mt-2 text-center text-sm text-gray-500 dark:text-neutral-400">
          Your favorites, your lists, and picks chosen from your taste.
        </p>
      )}
      <div className={cn(card, "mt-6 p-6")}>
        <button
          type="button"
          onClick={google}
          className="flex h-10 w-full cursor-pointer items-center justify-center gap-2.5 rounded-lg border border-gray-300 bg-white text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden>
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Continue with Google
        </button>
        <div className="my-5 flex items-center gap-3 text-xs text-gray-400 dark:text-neutral-500">
          <span className="h-px flex-1 bg-gray-200 dark:bg-neutral-700" />
          or
          <span className="h-px flex-1 bg-gray-200 dark:bg-neutral-700" />
        </div>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className={fieldLabel}>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@email.com"
              autoComplete="email"
              className={field}
            />
          </label>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="password" className={fieldLabel}>
                Password
              </label>
              {mode === "login" && (
                <button
                  type="button"
                  onClick={forgot}
                  className="cursor-pointer text-xs text-gray-900 underline underline-offset-2 dark:text-neutral-100"
                >
                  Forgot?
                </button>
              )}
            </div>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              className={field}
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy || !email.trim() || !password} className={cn(primaryButton, "mt-1 w-full")}>
            {busy ? "…" : mode === "login" ? "Log in" : "Create account"}
          </button>
        </form>
      </div>
      <p className="mt-6 text-center text-sm text-gray-500 dark:text-neutral-400">
        {mode === "login" ? "Don't have an account? " : "Already have an account? "}
        <button
          type="button"
          onClick={() => {
            setMode((m) => (m === "login" ? "signup" : "login"));
            setError("");
          }}
          className="cursor-pointer font-semibold text-gray-900 underline underline-offset-2 dark:text-neutral-100"
        >
          {mode === "login" ? "Sign up" : "Log in"}
        </button>
      </p>
      <p className="mt-8 text-center text-xs text-gray-400 dark:text-neutral-500">
        By continuing you agree to the <Link href="/terms" className="underline">terms</Link> and{" "}
        <Link href="/privacy" className="underline">privacy policy</Link>.
      </p>
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

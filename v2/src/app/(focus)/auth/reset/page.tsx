"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { card, cn, field, fieldLabel, primaryButton } from "@/components/ui/styles";

/** Password-reset landing: the email link's token becomes a session, then a new password. */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [expired, setExpired] = useState(false);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const db = supabase();
    db.auth.getSession().then(({ data }) => data.session && setReady(true));
    const { data: sub } = db.auth.onAuthStateChange((_e, session) => session && setReady(true));
    const timer = setTimeout(() => setExpired(true), 4000);
    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timer);
    };
  }, []);

  const submit = async () => {
    if (pw.length < 6) return setError("At least 6 characters.");
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
    <div className="mx-auto mt-10 w-full max-w-sm px-4 pb-16 sm:mt-20">
      <h1 className="text-center text-[28px] font-semibold tracking-tight text-gray-900 dark:text-neutral-100">
        Choose a new password
      </h1>
      {ready ? (
        <form
          className={cn(card, "mt-6 flex flex-col gap-4 p-6")}
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <label className="flex flex-col gap-1.5">
            <span className={fieldLabel}>New password</span>
            <input type="password" value={pw} autoFocus onChange={(e) => setPw(e.target.value)} autoComplete="new-password" className={field} />
          </label>
          {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
          <button type="submit" disabled={busy || !pw} className={cn(primaryButton, "w-full")}>
            {busy ? "…" : "Update password"}
          </button>
        </form>
      ) : expired ? (
        <p className="mt-6 text-center text-sm text-gray-500 dark:text-neutral-400">
          This reset link has expired.{" "}
          <Link href="/signin" className="font-semibold text-gray-900 underline underline-offset-4 dark:text-neutral-100">
            Request a new one
          </Link>
        </p>
      ) : (
        <p className="mt-6 animate-pulse text-center text-sm text-gray-500 dark:text-neutral-400">Checking your link…</p>
      )}
    </div>
  );
}

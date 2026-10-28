"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useViewer } from "@/lib/viewer";
import { toast } from "../ui/Toast";
import { card, cn, field, primaryButton } from "../ui/styles";

// this browser already subscribed (visitors) — survives reloads
const KEY = "fav:newsletter";
const EVENT = "fav:newsletter";
const readFlag = () => {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
};
const remember = (value: string) => {
  try {
    localStorage.setItem(KEY, value);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
};
const onFlag = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
};

function Note({ title, note, compact }: { title: string; note: string; compact?: boolean }) {
  if (compact) {
    return (
      <p className="flex items-center justify-center gap-2 text-sm text-gray-600 dark:text-neutral-300" aria-live="polite">
        <Check className="size-4" strokeWidth={2.5} /> {title} {note}
      </p>
    );
  }
  return (
    <section className={cn(card, "mt-14 px-6 py-8 text-center sm:mt-16")} aria-live="polite">
      <span className="mx-auto flex size-9 items-center justify-center rounded-full bg-gray-900 text-white dark:bg-neutral-100 dark:text-neutral-900">
        <Check className="size-4" strokeWidth={2.5} />
      </span>
      <h2 className="mt-3 text-lg font-semibold tracking-tight text-gray-900 dark:text-neutral-100">{title}</h2>
      <p className="mt-1 text-sm text-gray-500 dark:text-neutral-400">{note}</p>
    </section>
  );
}

/**
 * antislop's newsletter, folded into Home: today's picks by email every
 * morning. Visitors type an address and confirm by email; members subscribe
 * their account email in one click. Subscribers never see it.
 */
export default function NewsletterCTA({ compact = false }: { compact?: boolean }) {
  const v = useViewer();
  const flag = useSyncExternalStore(onFlag, readFlag, () => "ssr");
  const [member, setMember] = useState<{ id: string; status: string; email: string } | null>(null);
  const [email, setEmail] = useState("");
  const [phase, setPhase] = useState<"idle" | "busy" | "pending" | "done">("idle");
  const [error, setError] = useState("");
  const uid = v.status === "signed-in" ? v.profile?.id : undefined;

  // the confirmation email's link lands on /?subscribed=1
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("subscribed") !== "1") return;
    remember("active");
    toast("You’re subscribed — today’s picks land in your inbox every morning.");
    params.delete("subscribed");
    history.replaceState(null, "", location.pathname + (params.size ? `?${params}` : "") + location.hash);
  }, []);

  useEffect(() => {
    if (!uid) return;
    let live = true;
    const db = supabase();
    Promise.all([db.rpc("newsletter_me"), db.auth.getSession()]).then(([{ data }, { data: s }]) => {
      if (live) setMember({ id: uid, status: (data as string | null) ?? "none", email: s.session?.user.email ?? "" });
    });
    return () => {
      live = false;
    };
  }, [uid]);

  if (flag === "ssr" || v.status === "unknown") return null;
  if (phase === "pending") return <Note compact={compact} title="Check your inbox." note="One click on the link we just sent and you’re in." />;
  if (phase === "done") return <Note compact={compact} title="You’re in." note="Today’s picks land in your inbox every morning." />;
  if (uid) {
    if (!member || member.id !== uid || member.status === "active") return null;
  } else if (flag === "active" || flag === "pending") {
    return null;
  }

  const subscribeVisitor = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhase("busy");
    setError("");
    try {
      const res = await fetch("/api/newsletter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error || "Couldn’t subscribe — try again.");
      remember("pending");
      setPhase("pending");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn’t subscribe — try again.");
      setPhase("idle");
    }
  };

  const subscribeMember = async () => {
    setPhase("busy");
    setError("");
    const { error: err } = await supabase().rpc("newsletter_set_me", { p_on: true });
    if (err) {
      setError("Couldn’t subscribe — try again.");
      setPhase("idle");
      return;
    }
    setPhase("done");
  };

  if (compact && !uid) {
    // one quiet line for the landing page: the lighter way in
    return (
      <div className="flex flex-col items-center gap-3 lg:flex-row lg:justify-center lg:gap-5">
        <p className="text-center text-sm text-gray-600 dark:text-neutral-300">Not ready yet? Get five picks by email every morning.</p>
        <form onSubmit={subscribeVisitor} className="flex w-full max-w-sm gap-2">
          <input
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder="you@email.com"
            aria-label="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={cn(field, "min-w-0 flex-1")}
          />
          <button type="submit" disabled={phase === "busy"} className={primaryButton}>
            {phase === "busy" ? "…" : "Subscribe"}
          </button>
        </form>
        {error && (
          <p role="alert" className="text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <section className={cn(card, "mt-14 px-6 py-8 text-center sm:mt-16 sm:px-10 sm:py-10")}>
      <h2 className="text-xl font-semibold tracking-tight text-gray-900 sm:text-2xl dark:text-neutral-100">
        Today&rsquo;s picks, in your inbox.
      </h2>
      <p className="mx-auto mt-2 max-w-sm text-[15px] leading-relaxed text-gray-500 dark:text-neutral-400">
        Five favorites from people with taste, and why they love them. Every morning.
      </p>
      {uid ? (
        <>
          <button
            type="button"
            onClick={subscribeMember}
            disabled={phase === "busy"}
            className={cn(primaryButton, "mt-6")}
          >
            {phase === "busy" ? "Subscribing…" : "Email me the picks"}
          </button>
          {member?.email && (
            <p className="mt-2.5 text-xs text-gray-500 dark:text-neutral-400">Sent to {member.email}</p>
          )}
        </>
      ) : (
        <form onSubmit={subscribeVisitor} className="mx-auto mt-6 flex max-w-sm flex-col gap-2 sm:flex-row">
          <input
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            placeholder="you@email.com"
            aria-label="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={cn(field, "min-w-0 bg-gray-100 sm:flex-1 dark:bg-neutral-700")}
          />
          <button type="submit" disabled={phase === "busy"} className={primaryButton}>
            {phase === "busy" ? "Subscribing…" : "Subscribe"}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}

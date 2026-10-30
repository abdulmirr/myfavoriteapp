"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { Check } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useViewer } from "@/lib/viewer";
import { toast } from "../ui/Toast";

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

// the landing's line: a white field and a button with the landing's tighter corners
const lineField =
  "h-10 min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-3 text-base text-gray-900 outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400 disabled:opacity-50 sm:text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-neutral-500";
const lineButton =
  "inline-flex h-10 cursor-pointer items-center justify-center rounded-md bg-gray-900 px-4 text-sm font-semibold text-white outline-none transition-colors hover:bg-gray-800 focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 dark:focus-visible:ring-neutral-400";

// Home's version is antislop's own: one white field with the button inside it
const inlineField =
  "h-11 w-full rounded-lg border border-gray-200 bg-white pr-32 pl-4 text-sm text-gray-900 shadow-xs outline-none placeholder:text-gray-400 focus-visible:ring-1 focus-visible:ring-gray-900/10 read-only:text-gray-500 dark:border-neutral-700/60 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus-visible:ring-white/10 dark:read-only:text-neutral-400";
const inlineButton =
  "absolute top-1.5 right-1.5 inline-flex h-8 cursor-pointer items-center justify-center rounded-md bg-gray-900 px-5 text-sm font-semibold text-white outline-none transition-colors hover:bg-gray-800 focus-visible:ring-2 focus-visible:ring-gray-900 disabled:cursor-default disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 dark:focus-visible:ring-neutral-400";

function Note({ title, note, compact }: { title: string; note: string; compact?: boolean }) {
  if (compact) {
    return (
      <p className="flex items-center justify-center gap-2 text-sm text-gray-600 dark:text-neutral-300" aria-live="polite">
        <Check className="size-4" strokeWidth={2.5} /> {title} {note}
      </p>
    );
  }
  return (
    <section className="mt-16 text-center sm:mt-20" aria-live="polite">
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
 * morning — a line, a sentence and antislop's field, no card. Visitors type
 * an address and confirm by email; members see their account email in the
 * field and subscribe in one click. Subscribers never see it.
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
            className={lineField}
          />
          <button type="submit" disabled={phase === "busy"} className={lineButton}>
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
    <section className="mt-16 text-center sm:mt-20">
      <h2 className="text-2xl font-semibold tracking-tight text-gray-900 sm:text-3xl dark:text-neutral-100">
        Today&rsquo;s picks, in your inbox.
      </h2>
      <p className="mx-auto mt-3 max-w-md text-[15px] leading-relaxed text-gray-500 sm:text-base dark:text-neutral-400">
        Five favorites from people with taste, and why they love them. Every morning.
      </p>
      <form
        onSubmit={(e) => {
          if (!uid) return void subscribeVisitor(e);
          e.preventDefault();
          void subscribeMember();
        }}
        className="relative mx-auto mt-6 max-w-sm"
      >
        <input
          type="email"
          required
          autoComplete="email"
          inputMode="email"
          placeholder="name@email.com"
          aria-label="Email address"
          readOnly={!!uid}
          value={uid ? (member?.email ?? "") : email}
          onChange={(e) => setEmail(e.target.value)}
          className={inlineField}
        />
        <button type="submit" disabled={phase === "busy"} className={inlineButton}>
          {phase === "busy" ? "…" : "Subscribe"}
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-3 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}

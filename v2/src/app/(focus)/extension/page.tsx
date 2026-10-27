"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Star from "@/components/ui/Star";
import { card, cn, primaryButton } from "@/components/ui/styles";

/**
 * /extension — the Chrome extension's connect handshake (logic unchanged
 * from v1). The extension can't share the web session (Supabase would rotate
 * the refresh token out from under one of the two), so this page mints a
 * personal save token and hands it to the extension's content script over
 * window.postMessage:
 *
 *   content script → { type: "favorites-ext-ready" }      (I'm listening)
 *   page           → { type: "favorites-ext-token", token }
 *   content script → { type: "favorites-ext-connected" }  (stored, all set)
 *
 * Both sides announce themselves so load order never matters. Opened by the
 * extension with ?connect=1 the handshake starts on its own; visited by hand
 * there's a button, plus disconnect for every browser at once.
 */

type Phase =
  | "loading" // session resolving
  | "signedout"
  | "idle" // signed in, waiting for the user
  | "connecting" // token minted, waving at the content script
  | "connected"
  | "missing" // no ack — extension probably not installed
  | "error";

function ExtensionConnect() {
  const router = useRouter();
  const params = useSearchParams();
  const autoConnect = params.get("connect") === "1";

  const [phase, setPhase] = useState<Phase>("loading");
  const [tokenCount, setTokenCount] = useState<number | null>(null);
  const tokenRef = useRef<string | null>(null);

  // one listener for the whole handshake; the token it reposts lives in a ref
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.source !== window || e.origin !== window.location.origin) return;
      const t = (e.data as { type?: string } | null)?.type;
      if (t === "favorites-ext-ready" && tokenRef.current) {
        window.postMessage({ type: "favorites-ext-token", token: tokenRef.current }, window.location.origin);
      }
      if (t === "favorites-ext-connected") {
        tokenRef.current = null; // delivered — stop reposting
        setPhase("connected");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const connect = useCallback(async () => {
    setPhase("connecting");
    const { data, error } = await supabase().rpc("create_extension_token");
    if (error || typeof data !== "string") {
      setPhase("error");
      return;
    }
    tokenRef.current = data;
    window.postMessage({ type: "favorites-ext-token", token: data }, window.location.origin);
    // the content script may still be loading; it pings ready when it is.
    // If nothing acks, the extension isn't here.
    setTimeout(() => {
      setPhase((p) => (p === "connecting" ? "missing" : p));
    }, 6000);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const db = supabase();
      const { data } = await db.auth.getSession();
      if (cancelled) return;
      if (!data.session) {
        setPhase("signedout");
        return;
      }
      const { data: rows } = await db.from("extension_tokens").select("id");
      if (cancelled) return;
      setTokenCount(rows?.length ?? 0);
      if (autoConnect) void connect();
      else setPhase("idle");
    })();
    return () => {
      cancelled = true;
    };
  }, [autoConnect, connect]);

  const disconnect = async () => {
    await supabase().from("extension_tokens").delete().gte("created_at", "1970-01-01");
    setTokenCount(0);
  };

  const title = "text-base font-semibold tracking-tight text-gray-900 dark:text-neutral-100";
  const body = "mt-1.5 text-sm leading-relaxed text-gray-500 dark:text-neutral-400";

  return (
    <div className="mx-auto w-full max-w-sm px-4 pt-10 pb-16 sm:pt-20">
      <h1 className="text-center text-[28px] font-semibold tracking-tight text-gray-900 sm:text-[32px] dark:text-neutral-100">
        Chrome extension
      </h1>
      <div className={cn(card, "mt-6 p-6")} aria-live="polite">
        {phase === "loading" && <p className="animate-pulse text-sm text-gray-500 dark:text-neutral-400">Checking…</p>}

        {phase === "signedout" && (
          <>
            <p className={title}>Sign in to connect the extension.</p>
            <p className={body}>It saves pages straight to your favorites — it needs to know whose they are.</p>
            <button
              type="button"
              onClick={() => router.push(`/signin?next=${encodeURIComponent("/extension?connect=1")}`)}
              className={cn(primaryButton, "mt-4 w-full")}
            >
              Log in
            </button>
          </>
        )}

        {(phase === "idle" || phase === "error") && (
          <>
            <p className={title}>Connect the extension to your account.</p>
            <p className={body}>One click and any page you&apos;re on becomes a favorite.</p>
            {phase === "error" && (
              <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-400">
                Couldn&apos;t create a connection — try again.
              </p>
            )}
            <button type="button" onClick={() => void connect()} className={cn(primaryButton, "mt-4 w-full")}>
              <Star className="size-4 text-star" />
              Connect
            </button>
          </>
        )}

        {phase === "connecting" && <p className="animate-pulse text-sm text-gray-900 dark:text-neutral-100">Connecting…</p>}

        {phase === "connected" && (
          <>
            <p className={title}>Connected.</p>
            <p className={body}>You can close this tab — the extension is ready wherever you browse.</p>
          </>
        )}

        {phase === "missing" && (
          <>
            <p className={title}>Couldn&apos;t reach the extension.</p>
            <p className={body}>Is it installed and enabled in this browser? Install it, then try again.</p>
            <button type="button" onClick={() => void connect()} className={cn(primaryButton, "mt-4 w-full")}>
              Try again
            </button>
          </>
        )}
      </div>

      {tokenCount !== null && tokenCount > 0 && phase !== "signedout" && (
        <button
          type="button"
          onClick={disconnect}
          className="mx-auto mt-4 block cursor-pointer text-sm font-medium text-gray-500 underline underline-offset-2 hover:text-gray-900 dark:text-neutral-400 dark:hover:text-neutral-100"
        >
          Disconnect all browsers
        </button>
      )}
    </div>
  );
}

export default function ExtensionPage() {
  return (
    <Suspense>
      <ExtensionConnect />
    </Suspense>
  );
}

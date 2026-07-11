"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";

/**
 * /extension — the Chrome extension's connect handshake. The extension can't
 * share the web session (Supabase would rotate the refresh token out from
 * under one of the two), so this page mints a personal save token and hands
 * it to the extension's content script over window.postMessage:
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
  | "loading"     // session resolving
  | "signedout"
  | "idle"        // signed in, waiting for the user
  | "connecting"  // token minted, waving at the content script
  | "connected"
  | "missing"     // no ack — extension probably not installed
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
        window.postMessage(
          { type: "favorites-ext-token", token: tokenRef.current },
          window.location.origin,
        );
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
    window.postMessage(
      { type: "favorites-ext-token", token: data },
      window.location.origin,
    );
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
      if (autoConnect) connect();
      else setPhase("idle");
    })();
    return () => {
      cancelled = true;
    };
  }, [autoConnect, connect]);

  const disconnect = async () => {
    await supabase()
      .from("extension_tokens")
      .delete()
      .gte("created_at", "1970-01-01");
    setTokenCount(0);
  };

  const signIn = () =>
    router.push(`/signin?next=${encodeURIComponent("/extension?connect=1")}`);

  return (
    <div className="min-h-screen bg-white">
      <div className="mx-auto flex max-w-md flex-col px-4 pt-[22vh] pb-16">
        <h1 className="mb-3 text-[10px] uppercase tracking-[0.08em] text-zinc-400">
          Chrome extension
        </h1>

        <div className="border border-zinc-200 bg-white p-5">
          {phase === "loading" && (
            <p className="text-xs text-zinc-400">…</p>
          )}

          {phase === "signedout" && (
            <>
              <p className="text-sm text-zinc-900">Sign in to connect the extension.</p>
              <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">
                The extension saves links straight to your library — it needs to
                know whose library that is.
              </p>
              <button
                onClick={signIn}
                className="mt-4 flex h-9 cursor-pointer items-center bg-zinc-900 px-4 text-xs font-medium text-white transition-colors hover:bg-zinc-700"
              >
                Sign in
              </button>
            </>
          )}

          {(phase === "idle" || phase === "error") && (
            <>
              <p className="text-sm text-zinc-900">Connect the extension to your library.</p>
              <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">
                One click and any page you&apos;re on becomes a favorite.
              </p>
              {phase === "error" && (
                <p className="mt-2 text-[11px] text-red-500">
                  Couldn&apos;t create a connection — try again.
                </p>
              )}
              <button
                onClick={connect}
                className="mt-4 flex h-9 cursor-pointer items-center gap-2 bg-zinc-900 px-4 text-xs font-medium text-white transition-colors hover:bg-zinc-700"
              >
                <img src="/favicon.svg" alt="" className="h-4.5 w-auto" />
                Connect
              </button>
            </>
          )}

          {phase === "connecting" && (
            <p className="text-sm text-zinc-900">Connecting…</p>
          )}

          {phase === "connected" && (
            <>
              <p className="text-sm font-medium text-zinc-900">Connected.</p>
              <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">
                You can close this tab — the extension is ready wherever you
                browse.
              </p>
            </>
          )}

          {phase === "missing" && (
            <>
              <p className="text-sm text-zinc-900">Couldn&apos;t reach the extension.</p>
              <p className="mt-1.5 text-xs leading-relaxed text-zinc-400">
                Is it installed and enabled in this browser? Install it, then
                try again.
              </p>
              <button
                onClick={connect}
                className="mt-4 flex h-9 cursor-pointer items-center bg-zinc-900 px-4 text-xs font-medium text-white transition-colors hover:bg-zinc-700"
              >
                Try again
              </button>
            </>
          )}
        </div>

        {tokenCount !== null && tokenCount > 0 && phase !== "signedout" && (
          <button
            onClick={disconnect}
            className="mt-3 cursor-pointer self-start text-[10px] uppercase tracking-[0.08em] text-zinc-400 transition-colors hover:text-zinc-900"
          >
            Disconnect all browsers
          </button>
        )}
      </div>
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

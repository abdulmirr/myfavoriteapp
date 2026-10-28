"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Sparkles } from "lucide-react";
import type { Item, Profile } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { thumbCover } from "@/lib/img";
import { finishOnboarding } from "@/lib/onboarding";
import { playUi } from "@/lib/sfx";
import Framed from "../profile/Framed";
import Avatar from "../ui/Avatar";
import Star from "../ui/Star";
import Toggle from "../ui/Toggle";
import { toast } from "../ui/Toast";
import { bigButton, cn } from "../ui/styles";
import BeatHeader from "./BeatHeader";

type Cover = Pick<Item, "id" | "media_type" | "title" | "image_url" | "view_url">;

const quietBig =
  "inline-flex h-12 cursor-pointer items-center justify-center rounded-xl bg-gray-200 px-6 text-base font-semibold text-gray-900 outline-none transition-colors hover:bg-gray-300 focus-visible:ring-2 focus-visible:ring-gray-900 disabled:cursor-default disabled:opacity-50 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700";

/**
 * Beat 5 — the reveal. Stamps onboarding done (and makes "Check later"),
 * then shows the page they just built — its color, their face, their Top
 * four in frames — the three things to do next, and the daily email.
 */
export default function RevealStep({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [state, setState] = useState<"saving" | "done" | "error">("saving");
  const [covers, setCovers] = useState<Cover[] | null>(null);
  const [email, setEmail] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  // one stamp per visit, even when Strict Mode replays the effect
  const job = useRef<Promise<boolean> | null>(null);

  useEffect(() => {
    let stale = false;
    job.current ??= finishOnboarding();
    void job.current.then((ok) => {
      if (stale) return;
      setState(ok ? "done" : "error");
      if (ok) playUi("reveal");
    });
    supabase()
      .from("items")
      .select("id, media_type, title, image_url, view_url")
      .eq("profile_id", profile.id)
      .order("sort_order", { ascending: true })
      .limit(4)
      .then(({ data }) => !stale && setCovers((data ?? []) as Cover[]));
    supabase()
      .rpc("newsletter_me")
      .then(({ data }) => !stale && setEmail(data === "active" || data === "pending"));
    return () => {
      stale = true;
    };
  }, [profile.id]);

  const retry = () => {
    setState("saving");
    job.current = finishOnboarding();
    void job.current.then((ok) => {
      setState(ok ? "done" : "error");
      if (ok) playUi("reveal");
    });
  };

  const setDaily = async (on: boolean) => {
    if (emailBusy) return;
    setEmailBusy(true);
    setEmail(on);
    const { error } = await supabase().rpc("newsletter_set_me", { p_on: on });
    setEmailBusy(false);
    if (error) {
      setEmail(!on);
      toast("Couldn't update — try again from Settings.");
    } else if (on) toast("Today's picks will be in your inbox each morning");
  };

  const glow = (covers ?? []).map((c) => c.image_url).filter((u): u is string => !!u).slice(0, 3);

  return (
    <div className="mx-auto w-full max-w-2xl">
      <BeatHeader
        title="Your page is live"
        sub={
          <a href={`/${profile.username}`} target="_blank" rel="noopener" className="font-medium text-gray-700 underline-offset-4 hover:underline dark:text-neutral-200">
            myfavoriteapp.com/{profile.username}
          </a>
        }
      />

      {/* their page, small */}
      <div className="mt-10 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_12px_40px_rgba(0,0,0,0.07)] dark:border-neutral-800 dark:bg-neutral-800/70">
        <div className="relative h-24 overflow-hidden bg-gradient-to-br from-amber-100 via-rose-100 to-sky-100 sm:h-28 dark:from-amber-900/40 dark:via-rose-900/30 dark:to-sky-900/40">
          {glow.length > 0 && (
            <div aria-hidden className="absolute -inset-10 flex scale-110 opacity-80 blur-2xl saturate-[1.6] dark:opacity-50">
              {glow.map((src, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={thumbCover(src, 120)} alt="" className="h-full min-w-0 flex-1 object-cover" />
              ))}
            </div>
          )}
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-3/4 bg-gradient-to-b from-transparent to-white dark:to-neutral-800" />
        </div>
        <div className="relative px-5 pb-7 sm:px-7">
          <Avatar p={profile} className="-mt-10 size-20 text-2xl ring-4 ring-white dark:ring-neutral-800" eager />
          <p className="mt-3 truncate text-2xl font-bold tracking-tight text-gray-950 dark:text-white">
            {profile.display_name || profile.username}
          </p>
          <p className="truncate text-sm text-gray-500 dark:text-neutral-400">@{profile.username}</p>
          {covers && covers.length > 0 && (
            <>
              <p className="mt-6 text-sm font-semibold text-gray-900 dark:text-neutral-100">Top four</p>
              <div className="mt-3 grid grid-cols-4 gap-3 sm:gap-5">
                {covers.map((c) => (
                  <Framed key={c.id} item={c} eager sizes="(max-width: 639px) 22vw, 140px" />
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <ul className="mt-10 grid gap-6 sm:grid-cols-3 sm:gap-5">
        {[
          {
            icon: <Star className="size-[18px] text-star" />,
            name: "Favorite",
            body: "What's part of you. It goes on your page.",
          },
          {
            icon: <Bookmark className="size-[18px]" strokeWidth={2.2} />,
            name: "Save",
            body: "What you want to get to. “Check later” is ready.",
          },
          {
            icon: <Sparkles className="size-[18px]" />,
            name: "Discover",
            body: "Five picks every morning — soon, from your taste.",
          },
        ].map((v) => (
          <li key={v.name}>
            <p className="flex items-center gap-2 text-[15px] font-semibold text-gray-900 dark:text-neutral-100">
              {v.icon} {v.name}
            </p>
            <p className="mt-1 text-sm leading-relaxed text-gray-500 dark:text-neutral-400">{v.body}</p>
          </li>
        ))}
      </ul>

      <div className="mt-10 rounded-xl border border-gray-200 bg-white px-4 py-3 dark:border-neutral-800 dark:bg-neutral-800/70">
        <Toggle
          label="Today's picks, by email"
          hint="Five favorites from people with taste, every morning. Turn it off any time."
          checked={email}
          onChange={(on) => void setDaily(on)}
          disabled={emailBusy || state !== "done"}
        />
      </div>

      {state === "error" && (
        <p role="alert" className="mt-6 text-center text-sm text-red-600 dark:text-red-400">
          Couldn&apos;t finish setting up.{" "}
          <button type="button" onClick={retry} className="cursor-pointer font-semibold underline underline-offset-2">
            Try again
          </button>
        </p>
      )}
      <div className="mt-8 flex gap-2">
        <button
          type="button"
          disabled={state !== "done"}
          onClick={() => router.replace(`/${profile.username}`)}
          className={cn(quietBig, "flex-1")}
        >
          View your page
        </button>
        <button
          type="button"
          disabled={state !== "done"}
          onClick={() => router.replace("/")}
          className={cn(bigButton, "flex-1")}
        >
          Start exploring
        </button>
      </div>
    </div>
  );
}

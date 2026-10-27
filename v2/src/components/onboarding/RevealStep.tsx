"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark } from "lucide-react";
import type { Item, Profile } from "@/lib/types";
import { supabase } from "@/lib/supabase";
import { finishOnboarding } from "@/lib/onboarding";
import { playUi } from "@/lib/sfx";
import Framed from "../profile/Framed";
import Avatar from "../ui/Avatar";
import Star from "../ui/Star";
import { card, cn, primaryButton, quietButton } from "../ui/styles";
import BeatHeader from "./BeatHeader";

type Cover = Pick<Item, "id" | "media_type" | "title" | "image_url" | "view_url">;

/**
 * Beat 5 — the reveal. Stamps onboarding done (and makes "Check later"),
 * then shows the page they just built and how the two buttons work.
 */
export default function RevealStep({ profile }: { profile: Profile }) {
  const router = useRouter();
  const [state, setState] = useState<"saving" | "done" | "error">("saving");
  const [covers, setCovers] = useState<Cover[] | null>(null);
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

  return (
    <div className="mx-auto w-full max-w-md">
      <BeatHeader title="Your page is live" sub={`myfavoriteapp.com/${profile.username}`} />

      <div className={cn(card, "mt-6 p-5 sm:p-6")}>
        <div className="flex items-center gap-3">
          <Avatar p={profile} className="size-14 text-xl" eager />
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold tracking-tight text-gray-900 dark:text-neutral-100">
              {profile.display_name || profile.username}
            </p>
            <p className="truncate text-sm text-gray-500 dark:text-neutral-400">@{profile.username}</p>
          </div>
        </div>
        {covers && covers.length > 0 && (
          <div className="mt-5 grid grid-cols-4 gap-3">
            {covers.map((c) => (
              <Framed key={c.id} item={c} eager sizes="96px" />
            ))}
          </div>
        )}
      </div>

      <ul className="mt-6 flex flex-col gap-3 text-sm leading-relaxed text-gray-600 dark:text-neutral-300">
        <li className="flex gap-3">
          <Star className="mt-0.5 size-4.5 shrink-0 text-star" />
          <span>
            <b className="font-semibold text-gray-900 dark:text-neutral-100">Favorite</b> what&apos;s part of you — it
            goes on your page.
          </span>
        </li>
        <li className="flex gap-3">
          <Bookmark className="mt-0.5 size-4.5 shrink-0" />
          <span>
            <b className="font-semibold text-gray-900 dark:text-neutral-100">Save</b> anything you want to get to —
            &ldquo;Check later&rdquo; is ready, or make lists of your own.
          </span>
        </li>
      </ul>

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
          className={cn(quietButton, "flex-1")}
        >
          View your page
        </button>
        <button
          type="button"
          disabled={state !== "done"}
          onClick={() => router.replace("/")}
          className={cn(primaryButton, "flex-1")}
        >
          Start exploring
        </button>
      </div>
    </div>
  );
}

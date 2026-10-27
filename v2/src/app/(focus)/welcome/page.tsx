"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useViewer } from "@/lib/viewer";
import { finishOnboarding, welcomeBeatKey } from "@/lib/onboarding";
import ClaimStep from "@/components/onboarding/ClaimStep";
import PicksStep from "@/components/onboarding/PicksStep";
import ImportStep from "@/components/onboarding/ImportStep";
import PeopleStep from "@/components/onboarding/PeopleStep";
import RevealStep from "@/components/onboarding/RevealStep";
import { cn } from "@/components/ui/styles";

const BEATS = 5;

function savedBeat(profileId: string): number {
  try {
    const n = Number(sessionStorage.getItem(welcomeBeatKey(profileId)));
    return n >= 1 && n <= BEATS ? n : 1;
  } catch {
    return 1;
  }
}

/**
 * First-run onboarding — five beats, about a minute, all skippable:
 * claim your page → first favorites → import → people → reveal. Home sends
 * members who haven't finished here; the reveal (or "Skip for now") stamps
 * profile_private.onboarded_at so it never shows again.
 */
export default function WelcomePage() {
  const router = useRouter();
  const v = useViewer();
  const me = v.profile;
  const meId = me?.id;
  // 0 until the viewer is known to be mid-onboarding. Latched once open, so
  // the final stamp (which flips `onboarded`) can't bounce the reveal away.
  const [beat, setBeat] = useState(0);
  const [skip, setSkip] = useState<"idle" | "busy" | "error">("idle");

  if (beat === 0 && v.status === "signed-in" && !v.stale && me && !v.onboarded) {
    setBeat(savedBeat(me.id));
  }

  useEffect(() => {
    if (beat !== 0) return;
    if (v.status === "signed-out") router.replace("/signin?next=/welcome");
    // already through (or no profile to set up) — nothing to do here
    else if (v.status === "signed-in" && !v.stale && (!me || v.onboarded)) router.replace("/");
  }, [beat, v.status, v.stale, v.onboarded, me, router]);

  // remember the beat: a reload, or the logo → Home → back here, resumes it.
  // Each beat starts at the top (the picks wall leaves you scrolled deep).
  useEffect(() => {
    if (!beat || !meId) return;
    window.scrollTo(0, 0);
    try {
      sessionStorage.setItem(welcomeBeatKey(meId), String(beat));
    } catch {}
  }, [beat, meId]);

  const skipForNow = async () => {
    if (skip === "busy") return;
    setSkip("busy");
    if (await finishOnboarding()) router.replace("/");
    else setSkip("error");
  };

  if (!beat || !me) return <div className="min-h-[60vh]" aria-busy />;

  return (
    <>
      <div className="absolute top-0 right-0 flex h-[57px] items-center gap-4 px-4 sm:h-[63px] sm:px-6 lg:px-8">
        <span className="flex items-center gap-1" role="img" aria-label={`Step ${beat} of ${BEATS}`}>
          {Array.from({ length: BEATS }, (_, i) => (
            <span
              key={i}
              className={cn(
                "h-1 w-3.5 rounded-full transition-colors duration-300 sm:w-5",
                i < beat ? "bg-gray-900 dark:bg-neutral-100" : "bg-gray-300 dark:bg-neutral-700"
              )}
            />
          ))}
        </span>
        {beat < BEATS && (
          <button
            type="button"
            onClick={skipForNow}
            disabled={skip === "busy"}
            className="cursor-pointer text-sm font-medium text-gray-500 transition-colors hover:text-gray-900 disabled:cursor-wait dark:text-neutral-400 dark:hover:text-neutral-100"
          >
            {skip === "error" ? "Couldn't save — retry" : "Skip for now"}
          </button>
        )}
      </div>
      <main key={beat} className="rise-in px-4 pt-6 pb-16 sm:px-6 sm:pt-12">
        {beat === 1 && <ClaimStep profile={me} onDone={() => setBeat(2)} />}
        {beat === 2 && <PicksStep profile={me} onNext={() => setBeat(3)} />}
        {beat === 3 && <ImportStep profileId={me.id} onNext={() => setBeat(4)} />}
        {beat === 4 && <PeopleStep profile={me} onNext={() => setBeat(5)} />}
        {beat === 5 && <RevealStep profile={me} />}
      </main>
    </>
  );
}

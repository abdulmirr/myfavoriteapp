"use client";

import ImportLibrary from "../settings/ImportLibrary";
import { bigButton, cn } from "../ui/styles";
import BeatHeader from "./BeatHeader";

/**
 * Beat 3 — bring a library over. The same engine as Settings → Import,
 * minus Spotify: its OAuth round trip would leave the flow mid-beat (and
 * Last.fm pulls the same albums for anyone).
 */
export default function ImportStep({ profileId, onNext }: { profileId: string; onNext: () => void }) {
  return (
    <div className="mx-auto w-full max-w-lg">
      <BeatHeader
        title="Bring your library"
        sub="Rated things on Goodreads or Letterboxd, or scrobble on Last.fm? Pull them in and pick what makes your page."
      />
      <div className="mt-10">
        <ImportLibrary profileId={profileId} spotify={false} />
      </div>
      <div className="mt-10 flex flex-col items-center gap-3">
        <button type="button" onClick={onNext} className={cn(bigButton, "min-w-48")}>
          Continue
        </button>
        <p className="text-xs text-gray-500 dark:text-neutral-400">Nothing to import? Continue — you can do it later in Settings.</p>
      </div>
    </div>
  );
}

"use client";

import ImportLibrary from "../settings/ImportLibrary";
import { card, cn, primaryButton } from "../ui/styles";
import BeatHeader from "./BeatHeader";

/**
 * Beat 3 — bring a library over. The same engine as Settings → Import,
 * minus Spotify: its OAuth round trip would leave the flow mid-beat (and
 * Last.fm pulls the same albums for anyone).
 */
export default function ImportStep({ profileId, onNext }: { profileId: string; onNext: () => void }) {
  return (
    <div className="mx-auto w-full max-w-md">
      <BeatHeader
        title="Bring your library"
        sub="Rated things on Goodreads or Letterboxd, or scrobble on Last.fm? Pull them in and pick what makes your page."
      />
      <div className={cn(card, "mt-6 p-4 sm:p-6")}>
        <ImportLibrary profileId={profileId} spotify={false} />
      </div>
      <div className="mt-6 flex justify-center">
        <button type="button" onClick={onNext} className={cn(primaryButton, "min-w-32")}>
          Continue
        </button>
      </div>
    </div>
  );
}

"use client";

import { useEffect } from "react";
import Logo from "@/components/Logo";
import StatusView from "@/components/StatusView";
import { primaryButton } from "@/components/ui/styles";

/** Anything outside the app shell threw (focus pages, a layout). */
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error("app error:", error);
  }, [error]);
  return (
    <>
      <div className="px-4 py-4 sm:px-6 lg:px-8">
        <Logo />
      </div>
      <StatusView title="Something went wrong" body="It's us, not you. Try again in a moment.">
        <button type="button" onClick={() => retry()} className={primaryButton}>
          Try again
        </button>
      </StatusView>
    </>
  );
}

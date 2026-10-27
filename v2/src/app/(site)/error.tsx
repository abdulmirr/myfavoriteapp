"use client";

import { useEffect } from "react";
import StatusView from "@/components/StatusView";
import { primaryButton } from "@/components/ui/styles";

/** A page inside the app threw — the header stays, the page offers a retry. */
export default function Error({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error("page error:", error);
  }, [error]);
  return (
    <StatusView title="Something went wrong" body="It's us, not you. Try again in a moment.">
      <button type="button" onClick={() => retry()} className={primaryButton}>
        Try again
      </button>
    </StatusView>
  );
}

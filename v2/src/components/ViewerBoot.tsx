"use client";

import { useEffect } from "react";
import { startViewer } from "@/lib/viewer";
import { warmSfx } from "@/lib/sfx";

/**
 * Starts the viewer store once for the whole app, and warms the sound layer
 * only after the page is idle — the foley never competes with covers for the
 * network.
 */
export default function ViewerBoot() {
  useEffect(() => {
    startViewer();

    const idle =
      "requestIdleCallback" in window
        ? window.requestIdleCallback(() => warmSfx(), { timeout: 4000 })
        : (setTimeout(() => warmSfx(), 2500) as unknown as number);

    return () => {
      if ("cancelIdleCallback" in window) window.cancelIdleCallback(idle);
      else clearTimeout(idle);
    };
  }, []);
  return null;
}

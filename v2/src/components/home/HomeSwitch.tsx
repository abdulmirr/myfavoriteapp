"use client";

import { useViewer } from "@/lib/viewer";

/**
 * "/" is two pages: the landing for visitors, Home for members. Both are in
 * the static shell; until the session check lands, the pre-paint auth switch
 * shows the right one (no flash), then the other one unmounts.
 */
export default function HomeSwitch({ landing, home }: { landing: React.ReactNode; home: React.ReactNode }) {
  const v = useViewer();
  if (v.status === "signed-in") return home;
  if (v.status === "signed-out") return landing;
  return (
    <>
      <div className="signed-out-only">{landing}</div>
      <div className="signed-in-only">{home}</div>
    </>
  );
}

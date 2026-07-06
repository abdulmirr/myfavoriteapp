"use client";

import { useEffect, useState } from "react";

/**
 * A quiet one-time hint — one line of zinc, dismissed by its ✕ or by first
 * use of the feature it points at (via markHintSeen). No tour overlays.
 */

const KEY = (id: string) => `fav:hint:${id}`;

export function markHintSeen(id: string) {
  try {
    localStorage.setItem(KEY(id), "1");
  } catch {}
}

export default function Hint({
  id,
  children,
  className,
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY(id))) setShow(true);
    } catch {}
  }, [id]);

  if (!show) return null;
  return (
    <span
      className={`save-appear inline-flex items-baseline gap-2 text-[11px] text-zinc-400 ${
        className ?? ""
      }`}
    >
      {children}
      <button
        onClick={() => {
          setShow(false);
          markHintSeen(id);
        }}
        aria-label="Dismiss hint"
        className="cursor-pointer transition-colors hover:text-zinc-900"
      >
        ✕
      </button>
    </span>
  );
}

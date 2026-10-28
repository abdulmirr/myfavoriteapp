"use client";

import { useState } from "react";
import { Check, UserPlus } from "lucide-react";
import { useViewer } from "@/lib/viewer";
import { cn, primaryButton, quietButton } from "../ui/styles";

/**
 * "Invite a friend" — the old Friends tab's button, back. Apple devices get
 * Messages (sms: opens Messages.app on macOS too), other phones the share
 * sheet, everything else a copied message. The link is your own page, so a
 * friend lands on your taste and can follow you in one tap.
 */
export default function InviteButton({ className, quiet = false }: { className?: string; quiet?: boolean }) {
  const me = useViewer().profile;
  const [copied, setCopied] = useState(false);

  const invite = async () => {
    const url = `${window.location.origin}${me ? `/${me.username}` : ""}`;
    const text = `been putting all my favorite movies, books + music on this app. make yours, i'll show you mine ${url}`;
    if (/iPhone|iPad|iPod|Macintosh/.test(navigator.userAgent)) {
      window.location.href = `sms:&body=${encodeURIComponent(text)}`;
      return;
    }
    try {
      if (navigator.share && matchMedia("(pointer: coarse)").matches) {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* share sheet dismissed */
    }
  };

  return (
    <button type="button" onClick={invite} className={cn(quiet ? quietButton : primaryButton, "h-10 px-5", className)}>
      {copied ? <Check className="size-4" /> : <UserPlus className="size-4" />}
      {copied ? "Invite copied" : "Invite a friend"}
    </button>
  );
}

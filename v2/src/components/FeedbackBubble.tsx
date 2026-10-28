"use client";

import { useState } from "react";
import { Popover } from "radix-ui";
import { Check, MessageCircle } from "lucide-react";
import { authHeaders } from "@/lib/supabase";
import { useViewer } from "@/lib/viewer";
import { cn, field, pill, pillActive, pillIdle, primaryButton, textarea } from "./ui/styles";

const TOPICS = [
  { key: "idea", label: "Idea" },
  { key: "bug", label: "Bug" },
  { key: "other", label: "Other" },
] as const;

/** antislop's "Message" bubble — a direct line to the founder's inbox, for members. */
export default function FeedbackBubble() {
  const v = useViewer();
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState<(typeof TOPICS)[number]["key"]>("idea");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState("");

  const send = async () => {
    if (!message.trim() || state === "sending") return;
    setState("sending");
    setError("");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(await authHeaders()) },
        body: JSON.stringify({ topic, message, email, page: location.pathname }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Couldn't send — try again.");
      setState("sent");
      setMessage("");
    } catch (e) {
      setState("idle");
      setError(e instanceof Error ? e.message : "Couldn't send — try again.");
    }
  };

  // a line to the founder for people using the app — visitors don't need it
  if (v.status === "signed-out") return null;

  return (
    <div className={cn("fixed right-4 bottom-4 z-50 flex flex-col items-end gap-3", v.status === "unknown" && "signed-in-only")}>
      <Popover.Root
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (o && state === "sent") setState("idle");
        }}
      >
        <Popover.Trigger
          aria-label="Message Favorite"
          className="flex size-12 cursor-pointer items-center justify-center rounded-full bg-gray-900 text-white shadow-lg outline-none transition-colors hover:bg-gray-800 focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200"
        >
          <MessageCircle className="size-5" />
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            side="top"
            align="end"
            sideOffset={12}
            collisionPadding={12}
            className="popover-content z-50 w-[min(92vw,340px)] rounded-2xl border border-gray-200 bg-white p-4 shadow-[0_8px_30px_rgba(0,0,0,0.08)] outline-none dark:border-neutral-700 dark:bg-neutral-800"
          >
            {state === "sent" ? (
              <div className="flex flex-col items-center gap-2 py-4 text-center">
                <span className="flex size-9 items-center justify-center rounded-full bg-gray-900 text-white dark:bg-neutral-100 dark:text-neutral-900">
                  <Check className="size-4" />
                </span>
                <p className="text-sm font-semibold text-gray-900 dark:text-neutral-100">Thanks for writing.</p>
                <p className="text-sm text-gray-500 dark:text-neutral-400">We read every message.</p>
              </div>
            ) : (
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
              >
                <p className="text-base font-semibold tracking-tight text-gray-900 dark:text-neutral-100">
                  Message Favorite
                </p>
                <div className="flex gap-1.5">
                  {TOPICS.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setTopic(t.key)}
                      aria-pressed={topic === t.key}
                      className={cn(pill, "px-2.5 py-1 text-xs", topic === t.key ? pillActive : pillIdle)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="A bug, an idea, or something you love…"
                  maxLength={2000}
                  rows={4}
                  aria-label="Message"
                  className={cn(textarea, "min-h-28")}
                  autoFocus
                />
                {v.status !== "signed-in" && (
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@email.com (for a reply)"
                    aria-label="Your email"
                    className={field}
                  />
                )}
                {error && (
                  <p role="alert" className="text-xs text-red-600 dark:text-red-400">
                    {error}
                  </p>
                )}
                <button type="submit" disabled={!message.trim() || state === "sending"} className={primaryButton}>
                  {state === "sending" ? "Sending…" : "Send"}
                </button>
              </form>
            )}
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </div>
  );
}

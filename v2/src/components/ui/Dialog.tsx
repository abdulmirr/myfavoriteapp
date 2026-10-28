"use client";

import { Dialog as D } from "radix-ui";
import { X } from "lucide-react";
import { cn, dialogDescription, dialogPanel, dialogTitle } from "./styles";

/**
 * antislop's dialog: a white rounded-2xl panel, left-aligned semibold title,
 * a quiet ✕ in the corner. Radix handles focus, Escape and scroll lock.
 */
export default function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  busy = false,
  size = "md",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  /** while saving: Escape and outside clicks don't close (no lost writes) */
  busy?: boolean;
  /** the panel's width (a className can't override it — `cn` joins, it doesn't merge) */
  size?: "md" | "lg" | "xl";
}) {
  return (
    <D.Root open={open} onOpenChange={(o) => (busy && !o ? undefined : onOpenChange(o))}>
      <D.Portal>
        <D.Overlay className="dialog-overlay fixed inset-0 z-50 bg-black/40 dark:bg-black/60" />
        <D.Content
          aria-describedby={description ? undefined : undefined}
          onPointerDownOutside={(e) => busy && e.preventDefault()}
          onEscapeKeyDown={(e) => busy && e.preventDefault()}
          className={cn(
            dialogPanel,
            "dialog-content fixed top-1/2 left-1/2 z-50 flex max-h-[min(86dvh,720px)] w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-4 overflow-y-auto p-5 outline-none sm:p-6",
            size === "xl" ? "max-w-xl" : size === "lg" ? "max-w-lg" : "max-w-md",
            className
          )}
        >
          <div className="flex flex-col gap-1 pr-8">
            <D.Title className={cn(dialogTitle, "leading-snug break-words")}>{title}</D.Title>
            {description ? (
              <D.Description className={dialogDescription}>{description}</D.Description>
            ) : (
              <D.Description className="sr-only">{typeof title === "string" ? title : "Dialog"}</D.Description>
            )}
          </div>
          {children}
          <D.Close
            aria-label="Close"
            disabled={busy}
            className="absolute top-4 right-4 inline-flex size-8 cursor-pointer items-center justify-center rounded-lg text-gray-500 outline-none transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:ring-2 focus-visible:ring-gray-900 disabled:opacity-40 sm:top-5 sm:right-5 dark:text-neutral-400 dark:hover:bg-neutral-700 dark:hover:text-neutral-100"
          >
            <X className="size-4" />
          </D.Close>
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

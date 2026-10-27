"use client";

import { useSyncExternalStore } from "react";

/**
 * One quiet line at the bottom of the screen, with at most one action
 * (Undo, Add a thought). Global so any button can call `toast()`.
 */
type ToastAction = { label: string; run: () => void };
type ToastItem = { id: number; text: string; action?: ToastAction };

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function toast(text: string, action?: ToastAction, ms = 4500) {
  const id = nextId++;
  // one at a time reads calmer than a stack
  items = [{ id, text, action }];
  emit();
  setTimeout(() => dismiss(id), ms);
}

function dismiss(id: number) {
  const before = items.length;
  items = items.filter((t) => t.id !== id);
  if (items.length !== before) emit();
}

const EMPTY: ToastItem[] = [];

export function Toaster() {
  const list = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => items,
    () => EMPTY
  );
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-5 z-[60] flex justify-center px-4 sm:bottom-6"
    >
      {list.map((t) => (
        <div
          key={t.id}
          className="pop-in pointer-events-auto flex max-w-full items-center gap-3 rounded-xl bg-gray-900 py-2.5 pr-2.5 pl-4 text-sm font-medium text-white shadow-lg dark:bg-neutral-100 dark:text-neutral-900"
        >
          <span className="min-w-0 truncate">{t.text}</span>
          {t.action && (
            <button
              type="button"
              onClick={() => {
                t.action!.run();
                dismiss(t.id);
              }}
              className="shrink-0 cursor-pointer rounded-lg bg-white/15 px-2.5 py-1 text-sm font-semibold transition-colors hover:bg-white/25 dark:bg-neutral-900/10 dark:hover:bg-neutral-900/20"
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * antislop's design system as class recipes — lifted from their production
 * CSS so every surface speaks the same language. Compose with `cn`.
 */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/* surfaces */
export const card =
  "rounded-2xl border border-gray-200 bg-white shadow-[0_4px_16px_rgba(0,0,0,0.04)] dark:border-neutral-700 dark:bg-neutral-800";

/** The strip tucked 16px under a card's top edge — curator notes, "who did what". */
export const noteTab =
  "mx-2 -mb-4 rounded-t-2xl border border-b-0 border-gray-200 bg-gray-50 px-4 pt-2.5 pb-[26px] dark:border-neutral-700 dark:bg-neutral-800/60";

/** The strip tucked under a card's bottom edge — profile tabs, people on feed cards. */
export const drawer =
  "relative z-0 -mt-4 rounded-b-2xl border border-t-0 border-gray-200 bg-gray-50 dark:border-neutral-700 dark:bg-neutral-800/60";

/* navigation */
export const pill =
  "inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-transparent px-3 py-1.5 text-sm font-semibold leading-5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-gray-900 dark:focus-visible:ring-neutral-400";
export const pillActive = "bg-gray-900 text-white dark:bg-neutral-100 dark:text-neutral-900";
export const pillIdle =
  "cursor-pointer bg-gray-200 text-gray-900 hover:bg-gray-300 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700";

/**
 * Save + Favorite on cards. "bare" (trial, 2026-10-27) drops the gray
 * squares; "boxed" brings them back — this one word is the whole revert.
 */
export const CARD_ACTIONS: "bare" | "boxed" = "bare";

/** The card action button (bookmark, star): bare icon or gray square, per CARD_ACTIONS. */
export const iconButton =
  CARD_ACTIONS === "bare"
    ? "relative z-20 inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-gray-500 outline-none transition-colors hover:bg-gray-900/5 hover:text-gray-900 focus-visible:ring-2 focus-visible:ring-gray-900 disabled:cursor-default disabled:opacity-60 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-neutral-100 dark:focus-visible:ring-neutral-400"
    : "relative z-20 inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-gray-200 text-gray-900 outline-none transition-colors hover:bg-gray-300 focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-60 dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600 dark:focus-visible:ring-neutral-400 dark:focus-visible:ring-offset-neutral-800";

/** Smaller header icon button, sized to the pills. */
export const headerIcon =
  "relative inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-xl bg-gray-200 text-gray-900 outline-none transition-colors hover:bg-gray-300 focus-visible:ring-2 focus-visible:ring-gray-900 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700 dark:focus-visible:ring-neutral-400";

/* buttons */
export const primaryButton =
  "inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-gray-900 px-4 text-sm font-semibold text-white outline-none transition-colors hover:bg-gray-800 focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 dark:focus-visible:ring-neutral-400";
/** The big call to action (landing, onboarding) — its own recipe; primaryButton's size can't be overridden. */
export const bigButton =
  "inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-xl bg-gray-900 px-6 text-base font-semibold text-white outline-none transition-colors hover:bg-gray-800 focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2 disabled:cursor-default disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-200 dark:focus-visible:ring-neutral-400";
export const quietButton =
  "inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-gray-200 px-3 text-sm font-semibold text-gray-900 outline-none transition-colors hover:bg-gray-300 focus-visible:ring-2 focus-visible:ring-gray-900 disabled:cursor-default disabled:opacity-50 dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600 dark:focus-visible:ring-neutral-400";
/** A square quiet button for one icon (settings gear, ⋯) — its own recipe, sized like quietButton. */
export const quietIcon =
  "inline-flex size-10 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-gray-200 text-gray-900 outline-none transition-colors hover:bg-gray-300 focus-visible:ring-2 focus-visible:ring-gray-900 disabled:cursor-default disabled:opacity-50 dark:bg-neutral-700 dark:text-neutral-100 dark:hover:bg-neutral-600 dark:focus-visible:ring-neutral-400";
export const destructiveButton =
  "inline-flex h-10 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 text-sm font-semibold text-red-600 outline-none transition-colors hover:bg-red-50 focus-visible:ring-2 focus-visible:ring-red-600 disabled:cursor-default disabled:opacity-50 dark:border-red-900/60 dark:bg-transparent dark:text-red-400 dark:hover:bg-red-950/40";

/* forms — 16px text on phones so iOS doesn't zoom into a focused field */
export const field =
  "h-10 w-full rounded-lg border-0 bg-gray-200 px-3 text-base font-medium sm:text-sm text-gray-900 shadow-none outline-none placeholder:font-normal placeholder:text-gray-400 focus-visible:ring-2 focus-visible:ring-gray-900 disabled:opacity-50 dark:bg-neutral-700 dark:text-neutral-100 dark:placeholder:text-neutral-400 dark:focus-visible:ring-neutral-400";
export const textarea =
  "min-h-24 w-full resize-none rounded-lg border-0 bg-gray-200 px-3 py-2 text-base font-medium sm:text-sm text-gray-900 shadow-none outline-none placeholder:font-normal placeholder:text-gray-400 focus-visible:ring-2 focus-visible:ring-gray-900 disabled:opacity-50 dark:bg-neutral-700 dark:text-neutral-100 dark:placeholder:text-neutral-400 dark:focus-visible:ring-neutral-400";
export const fieldLabel = "text-xs font-semibold text-gray-500 dark:text-neutral-400";
/** A roomier white field for full pages on the gray (onboarding) — its own recipe, so nothing fights the size. */
export const bigField =
  "h-12 w-full rounded-xl border border-gray-200 bg-white px-4 text-base text-gray-900 shadow-[0_1px_2px_rgba(0,0,0,0.04)] outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-neutral-500";
export const bigTextarea =
  "min-h-24 w-full resize-none rounded-xl border border-gray-200 bg-white px-4 py-3 text-base text-gray-900 shadow-[0_1px_2px_rgba(0,0,0,0.04)] outline-none transition-colors placeholder:text-gray-400 focus:border-gray-400 disabled:opacity-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-100 dark:placeholder:text-neutral-500 dark:focus:border-neutral-500";

/* type */
export const pageTitle =
  "min-h-[2.25rem] text-[2rem] font-semibold leading-[2.25rem] tracking-tight text-gray-900 sm:min-h-[2.75rem] sm:text-[2.5rem] sm:leading-[2.75rem] dark:text-neutral-100";
export const pageSubtitle =
  "min-h-[1.75rem] text-lg tracking-tight text-gray-500 sm:text-xl dark:text-neutral-400";
export const meta = "text-xs text-gray-500 dark:text-neutral-400";
export const metaSm = "text-sm text-gray-500 dark:text-neutral-400";
/** antislop's underlined inline link (names, list titles inside tabs). */
export const inlineLink =
  "relative z-20 font-medium text-gray-500 underline decoration-gray-500 underline-offset-2 transition-colors hover:text-gray-700 hover:decoration-gray-700 dark:text-neutral-400 dark:decoration-neutral-400 dark:hover:text-neutral-200 dark:hover:decoration-neutral-200";

/* media */
export const mediaBox = "relative w-full overflow-hidden rounded-md bg-gray-200 dark:bg-neutral-700";
export const newBadge =
  "pointer-events-none absolute top-2.5 right-2.5 z-10 rounded bg-gray-100/80 px-2 py-0.5 text-[11px] font-medium leading-none text-gray-700 dark:bg-neutral-700/80 dark:text-neutral-200";

/* dialogs */
export const dialogPanel =
  "rounded-2xl border border-gray-200 bg-white shadow-[0_4px_16px_rgba(0,0,0,0.04)] dark:border-neutral-700 dark:bg-neutral-800";
export const dialogTitle = "text-left text-lg font-semibold tracking-tight text-gray-900 dark:text-neutral-100";
export const dialogDescription = "text-sm text-gray-500 dark:text-neutral-400";

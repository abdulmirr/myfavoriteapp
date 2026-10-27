"use client";

import { Switch } from "radix-ui";

/** antislop's switch (Radix): a row with a label, a hint, and the toggle. */
export default function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-1">
      <span className="min-w-0">
        <span className="block text-sm font-semibold text-gray-900 dark:text-neutral-100">{label}</span>
        {hint && <span className="mt-0.5 block text-xs leading-relaxed text-gray-500 dark:text-neutral-400">{hint}</span>}
      </span>
      <Switch.Root
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        className="relative h-[22px] w-9 shrink-0 cursor-pointer rounded-full bg-gray-300 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gray-900 disabled:cursor-default disabled:opacity-50 data-[state=checked]:bg-gray-900 dark:bg-neutral-600 dark:data-[state=checked]:bg-neutral-100"
      >
        <Switch.Thumb className="block size-[18px] translate-x-0.5 rounded-full bg-white shadow transition-transform data-[state=checked]:translate-x-[16px] dark:data-[state=checked]:bg-neutral-900" />
      </Switch.Root>
    </label>
  );
}

"use client";

import { DropdownMenu as M } from "radix-ui";
import { cn } from "./styles";

/** antislop's account-menu style dropdown (Radix: keyboard, focus, collisions). */
export const Menu = M.Root;
export const MenuTrigger = M.Trigger;

export function MenuContent({
  children,
  align = "end",
  className,
}: {
  children: React.ReactNode;
  align?: "start" | "center" | "end";
  className?: string;
}) {
  return (
    <M.Portal>
      <M.Content
        align={align}
        sideOffset={8}
        collisionPadding={12}
        className={cn(
          "menu-content z-50 min-w-52 rounded-xl border border-gray-200 bg-white p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.08)] outline-none dark:border-neutral-700 dark:bg-neutral-800",
          className
        )}
      >
        {children}
      </M.Content>
    </M.Portal>
  );
}

export function MenuItem({
  children,
  onSelect,
  asChild,
  destructive = false,
  className,
}: {
  children: React.ReactNode;
  onSelect?: (e: Event) => void;
  asChild?: boolean;
  destructive?: boolean;
  className?: string;
}) {
  return (
    <M.Item
      asChild={asChild}
      onSelect={onSelect}
      className={cn(
        "flex w-full cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium outline-none transition-colors data-[highlighted]:bg-gray-100 dark:data-[highlighted]:bg-neutral-700 [&_svg]:size-4 [&_svg]:shrink-0",
        destructive
          ? "text-red-600 dark:text-red-400"
          : "text-gray-900 dark:text-neutral-100 [&_svg]:text-gray-500 dark:[&_svg]:text-neutral-400",
        className
      )}
    >
      {children}
    </M.Item>
  );
}

export function MenuLabel({ children }: { children: React.ReactNode }) {
  return <M.Label className="px-2.5 pt-1.5 pb-1">{children}</M.Label>;
}

export function MenuSeparator() {
  return <M.Separator className="my-1.5 h-px bg-gray-200 dark:bg-neutral-700" />;
}

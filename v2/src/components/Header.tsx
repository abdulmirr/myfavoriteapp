import { Suspense } from "react";
import Logo from "./Logo";
import HeaderNav, { HeaderNavFallback } from "./HeaderNav";
import HeaderShell from "./HeaderShell";

/**
 * antislop's header: sticky, the page's own gray, wordmark left, pills right.
 * The nav reads the pathname (active pill), so it sits in its own Suspense
 * island — the bar itself is part of every static shell.
 */
export default function Header() {
  return (
    <HeaderShell>
      <header className="flex items-center justify-between gap-3">
        <Logo />
        <Suspense fallback={<HeaderNavFallback />}>
          <HeaderNav />
        </Suspense>
      </header>
    </HeaderShell>
  );
}

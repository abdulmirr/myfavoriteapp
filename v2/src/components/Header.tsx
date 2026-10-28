import { Suspense } from "react";
import Logo from "./Logo";
import HeaderNav, { HeaderNavFallback } from "./HeaderNav";
import HeaderShell from "./HeaderShell";

/**
 * antislop's header: sticky, the page's own gray — the wordmark left, Home ·
 * Feed · Friends centered, ＋ and you on the right (a three-column grid from
 * tablet width; phones keep one right-hugging row). The nav reads the
 * pathname (active pill), so it sits in its own Suspense island — the bar
 * itself is part of every static shell.
 */
export default function Header() {
  return (
    <HeaderShell>
      <header className="flex items-center gap-1 sm:grid sm:grid-cols-[1fr_auto_1fr] sm:gap-3">
        <Logo />
        <Suspense fallback={<HeaderNavFallback />}>
          <HeaderNav />
        </Suspense>
      </header>
    </HeaderShell>
  );
}

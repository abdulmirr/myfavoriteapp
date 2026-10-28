import Link from "next/link";
import Header from "@/components/Header";
import StatusView from "@/components/StatusView";
import { BROWSE } from "@/lib/discover";
import { cn, primaryButton, quietButton } from "@/components/ui/styles";

/** An address that matches no route at all. */
export default function NotFound() {
  return (
    <>
      <Header />
      <StatusView
        title="Nothing lives here"
        body="The page may have moved, or the username you followed may have changed."
      >
        <Link href={BROWSE.href} className={cn(quietButton, "px-4")}>
          {BROWSE.label === "Feed" ? "Browse the feed" : "Discover something"}
        </Link>
        <Link href="/" className={primaryButton}>
          Go home
        </Link>
      </StatusView>
    </>
  );
}

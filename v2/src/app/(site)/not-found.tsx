import Link from "next/link";
import StatusView from "@/components/StatusView";
import { BROWSE } from "@/lib/discover";
import { cn, primaryButton, quietButton } from "@/components/ui/styles";

/** notFound() anywhere inside the app (an unknown user, list or work) — the header stays. */
export default function NotFound() {
  return (
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
  );
}

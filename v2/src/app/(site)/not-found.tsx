import Link from "next/link";
import StatusView from "@/components/StatusView";
import { cn, primaryButton, quietButton } from "@/components/ui/styles";

/** notFound() anywhere inside the app (an unknown user, list or work) — the header stays. */
export default function NotFound() {
  return (
    <StatusView
      title="Nothing lives here"
      body="The page may have moved, or the username you followed may have changed."
    >
      <Link href="/feed" className={cn(quietButton, "px-4")}>
        Browse the feed
      </Link>
      <Link href="/" className={primaryButton}>
        Go home
      </Link>
    </StatusView>
  );
}

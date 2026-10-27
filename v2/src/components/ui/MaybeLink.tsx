import Link from "next/link";

/**
 * A link when there's somewhere to go (an external source opens in a new
 * tab), otherwise a plain span — so a card's cover and title can share one
 * wrapper whether or not the work has a page.
 */
export default function MaybeLink({
  href,
  external = false,
  prefetch,
  className,
  children,
}: {
  href: string | null | undefined;
  external?: boolean;
  prefetch?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  if (!href) return <span className={className}>{children}</span>;
  if (external) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href} prefetch={prefetch} className={className}>
      {children}
    </Link>
  );
}

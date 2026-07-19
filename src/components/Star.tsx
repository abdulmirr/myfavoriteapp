/**
 * The Favorite star — a classic five-point, filled. Inherits currentColor so
 * it's ink in the chrome (flipping with the theme), white inside dark CTAs,
 * and gold (text-[#f7a71e]) exactly where the act of favoriting happens —
 * the one place the brand spends its accent.
 */
export default function Star({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M12 1.7l3.1 6.27 6.92 1.01-5.01 4.88 1.18 6.89L12 17.5l-6.19 3.25 1.18-6.89-5.01-4.88 6.92-1.01z" />
    </svg>
  );
}

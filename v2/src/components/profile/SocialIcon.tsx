/** Line icons for the profile links (labels set in Settings); text fallback. */
export default function SocialIcon({ label, className = "size-[15px]" }: { label: string; className?: string }) {
  const key = label.trim().toLowerCase();
  if (key === "x" || key.includes("twitter")) {
    return (
      <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className={className}>
        <path d="M12.6 1h2.2L9.9 6.6 15.7 15h-4.6L7.6 9.9 3.5 15H1.3l5.3-6L1 1h4.7l3.2 4.6L12.6 1zm-.8 12.7h1.2L4.9 2.2H3.6l8.2 11.5z" />
      </svg>
    );
  }
  if (key.includes("instagram") || key === "ig") {
    return (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden className={className}>
        <rect x="1.5" y="1.5" width="13" height="13" rx="3.5" />
        <circle cx="8" cy="8" r="3" />
        <circle cx="11.8" cy="4.2" r="0.5" fill="currentColor" stroke="none" />
      </svg>
    );
  }
  if (key.includes("spotify")) {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
        <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" />
      </svg>
    );
  }
  if (key.includes("apple") || key.includes("music")) {
    return (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
        <path d="M6 12.5V4l7.5-1.7v8.5" />
        <circle cx="4" cy="12.5" r="1.9" />
        <circle cx="11.6" cy="10.8" r="1.9" />
      </svg>
    );
  }
  if (key.includes("pinterest")) {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
        <path d="M12.017 0C5.396 0 .029 5.367.029 11.987c0 5.079 3.158 9.417 7.618 11.162-.105-.949-.199-2.403.041-3.439.219-.937 1.406-5.957 1.406-5.957s-.359-.72-.359-1.781c0-1.663.967-2.911 2.168-2.911 1.024 0 1.518.769 1.518 1.688 0 1.029-.653 2.567-.992 3.992-.285 1.193.6 2.165 1.775 2.165 2.128 0 3.768-2.245 3.768-5.487 0-2.861-2.063-4.869-5.008-4.869-3.41 0-5.409 2.562-5.409 5.199 0 1.033.394 2.143.889 2.741.099.12.112.225.085.345-.09.375-.293 1.199-.334 1.363-.053.225-.172.271-.401.165-1.495-.69-2.433-2.878-2.433-4.646 0-3.776 2.748-7.252 7.92-7.252 4.158 0 7.392 2.967 7.392 6.923 0 4.135-2.607 7.462-6.233 7.462-1.214 0-2.354-.629-2.758-1.379l-.749 2.848c-.269 1.045-1.004 2.352-1.498 3.146 1.123.345 2.306.535 3.55.535 6.607 0 11.985-5.365 11.985-11.987C23.97 5.39 18.592.026 11.985.026L12.017 0z" />
      </svg>
    );
  }
  if (key.includes("website") || key.includes("site") || key.includes("web")) {
    return (
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden className={className}>
        <circle cx="8" cy="8" r="6.3" />
        <ellipse cx="8" cy="8" rx="2.8" ry="6.3" />
        <path d="M1.7 8h12.6" />
      </svg>
    );
  }
  return <span className="text-xs font-semibold">{label}</span>;
}

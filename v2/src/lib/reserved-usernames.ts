/**
 * Usernames that shadow app routes or are otherwise off-limits. Mirrors the
 * `is_reserved_username` check constraint (migration12, extended in migrations 24, 26 and 28)
 * — keep the two in sync. The DB is the source of truth; this list only lets the
 * UI reject reserved names before a round trip and translate the constraint error.
 */
export const RESERVED_USERNAMES = new Set([
  "add", "explore", "welcome", "signin", "signup", "profile", "settings",
  "privacy", "terms", "auth", "api", "home", "favorites", "favorite", "admin",
  "about", "help", "item", "items", "notifications", "search", "import",
  "landing", "recap", "extension",
  // v2 (migrations 26 and 28)
  "feed", "lists", "list", "activity", "saved", "today", "login", "logout",
  "discover", "archive", "new", "friends",
]);

export const isReservedUsername = (name: string): boolean =>
  RESERVED_USERNAMES.has(name.trim().toLowerCase());

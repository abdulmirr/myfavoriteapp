/**
 * Only same-site paths may ride a `?next=` param through sign-in / OAuth /
 * confirmation. Must be an absolute path (`/…`), never a network-path
 * reference (`//host`) and never contain a backslash — the WHATWG URL parser
 * treats `\` as `/` in special schemes, so `/\evil.com` resolves to
 * `https://evil.com/` and would be an open redirect.
 */
export function safeNext(v: string | null | undefined): string {
  if (!v || v[0] !== "/" || v[1] === "/" || v[1] === "\\" || v.includes("\\")) {
    return "/";
  }
  return v;
}

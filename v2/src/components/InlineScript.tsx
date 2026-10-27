/**
 * A pre-paint inline script (per Next's "preventing flash before hydration"
 * guide): executable in the server HTML, inert `text/plain` when React renders
 * it on the client, so dev builds don't warn about script tags.
 */
export default function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

import type { Metadata } from "next";
import { LegalPage, H2, P, UL, LI, Strong, Mail } from "@/components/Legal";

export const metadata: Metadata = {
  title: "Privacy",
  description: "Privacy policy for Favorites — a personal library for everything you love.",
};

export default function PrivacyPage() {
  return (
    <LegalPage eyebrow="Privacy Policy" title="Privacy." updated="August 4, 2026">
      <P>
        This is a short, plain-English description of how Favorites handles your information. We
        try to collect as little as possible, store it carefully, and never sell it. If anything
        here is unclear, email us and we&rsquo;ll explain it like a person would.
      </P>

      <H2>What we collect</H2>
      <P>
        When you create an account, we collect your email address and the profile details you
        choose to share (username, display name, bio, avatar, links). We also store the things you
        put in your library — the films, books, albums, podcasts, videos, articles, and photos you
        save, along with the thoughts you write about them. We also collect basic technical
        information your browser sends automatically (IP address, user agent, referrer) so we can
        keep the site working and prevent abuse.
      </P>

      <H2>Why we collect it</H2>
      <UL>
        <LI>
          <Strong>Your email</Strong> — to let you sign in, to reach you about your account, and to
          send the optional weekly digest, which you can turn off in settings.
        </LI>
        <LI>
          <Strong>Your library</Strong> — because that&rsquo;s the whole product. It&rsquo;s what
          we show back to you and to the people who visit your profile, and it&rsquo;s what your
          daily recommendations are drawn from.
        </LI>
        <LI>
          <Strong>Technical logs</Strong> — to debug, secure the service, and understand whether
          the thing we just shipped actually works.
        </LI>
      </UL>

      <H2>What we don&rsquo;t do</H2>
      <P>
        We don&rsquo;t sell your data. We don&rsquo;t run third-party advertising. We don&rsquo;t
        build shadow profiles of people who haven&rsquo;t signed up. We don&rsquo;t read your
        library to train a generic recommendation engine for some other company. The point of
        Favorites is taste expressed quietly, and we try to run the company the same way.
      </P>

      <H2>Who else sees it</H2>
      <P>
        We use a small number of trusted infrastructure providers to actually run the service.
        They process data on our behalf under their own privacy commitments. The list, in plain
        terms: a hosting provider, a database provider, an email provider, and an AI model
        provider that turns your library into your daily recommendations — it processes your
        library to generate them and doesn&rsquo;t train on your data. When you search for
        something to add, your search term is sent to public media catalogs (TMDB, iTunes, Open
        Library) to find artwork and metadata. We will update this list as it changes.
      </P>

      <H2>Sharing on the platform</H2>
      <P>
        Most of what makes Favorites useful comes from sharing taste with other humans. Your
        profile and your library are visible to anyone who visits your page — that&rsquo;s the
        point of the product. Your email and settings are never public. We will never make
        something more public than the setting you chose.
      </P>

      <H2>The browser extension</H2>
      <P>
        The Favorites browser extension saves the page you&rsquo;re on to your library, and does
        nothing else. It only reads a page when you click the extension (or press its keyboard
        shortcut) — at that moment it collects the page&rsquo;s address, title, site name, and
        preview image, plus any thoughts you type, and sends them to your library. It does not
        track your browsing history, does not read pages in the background, and does not send
        anything anywhere until you act. To connect the extension to your account it stores a
        personal access token on your device; you can revoke every connected browser at any time
        at myfavoriteapp.com/extension, and disconnecting deletes the token.
      </P>

      <H2>Cookies</H2>
      <P>
        We use cookies and similar local storage to keep you logged in and to remember small
        preferences. We don&rsquo;t use tracking cookies that follow you across other websites.
      </P>

      <H2>Your rights</H2>
      <P>
        You can ask for a copy of everything we have on you, correct anything that&rsquo;s wrong,
        or delete your account entirely. Deletion is permanent — once your library is gone, we
        can&rsquo;t bring it back. To make any of these requests, email the address below.
      </P>

      <H2>Children</H2>
      <P>
        Favorites isn&rsquo;t designed for people under 13. If you believe a child has signed up,
        please let us know and we will remove the account.
      </P>

      <H2>Changes</H2>
      <P>
        If we make a meaningful change to this policy, we&rsquo;ll email everyone before it takes
        effect. The &ldquo;last updated&rdquo; date at the top will always reflect the current
        version.
      </P>

      <H2>Contact</H2>
      <P>
        Questions, concerns, or polite corrections: <Mail />.
      </P>
    </LegalPage>
  );
}

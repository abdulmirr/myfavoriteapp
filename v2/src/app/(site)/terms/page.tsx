import type { Metadata } from "next";
import { LegalPage, H2, P, UL, LI, Mail } from "@/components/Legal";

export const metadata: Metadata = {
  title: "Terms",
  description: "Terms of service for Favorite — a personal library for everything you love.",
};

export default function TermsPage() {
  return (
    <LegalPage eyebrow="Terms of Service" title="Terms." updated="July 5, 2026">
      <P>
        These are the terms for using Favorite. They are intentionally short and written without
        legalese. By using the product, you agree to them.
      </P>

      <H2>Who we are</H2>
      <P>
        Favorite is a personal library for the films, books, albums, podcasts, videos, and
        articles you love. The service is operated by Abdul Mir. When these terms say
        &ldquo;we&rdquo; or &ldquo;us,&rdquo; that&rsquo;s who they mean. When they say
        &ldquo;you,&rdquo; they mean you — the person reading this.
      </P>

      <H2>Your account</H2>
      <P>
        You&rsquo;re responsible for what happens under your account. Keep your login credentials
        private, use a real email address, and don&rsquo;t impersonate someone else. If you
        suspect someone has gotten into your account, tell us as soon as you can.
      </P>

      <H2>What you put in your library</H2>
      <P>
        Everything you save — your favorites, the thoughts you write about them, the photos you
        upload — belongs to you. You keep all rights to it. By posting it on Favorite, you give
        us a limited license to store it, display it on your public profile, and show it to the
        people who follow you. That license ends when you delete the content or the account.
      </P>
      <P>
        Don&rsquo;t post things you don&rsquo;t have the right to post. Don&rsquo;t post things
        that are illegal, threatening, deceptive, or designed to harass another person.
        Don&rsquo;t upload other people&rsquo;s copyrighted work and pass it off as your own.
      </P>

      <H2>How you behave on the platform</H2>
      <P>
        Favorite exists because recommendations from a real person you trust beat anything an
        algorithm can hand you. That only works if the platform stays a kind place. So:
      </P>
      <UL>
        <LI>
          Be decent to other users. Disagree about taste, never about a person&rsquo;s right to
          have it.
        </LI>
        <LI>No spam, no scraping, no automated mass-following, no bots pretending to be humans.</LI>
        <LI>No attempts to break, overload, or reverse-engineer the service.</LI>
        <LI>
          No using Favorite to advertise, solicit, or run a commercial campaign without our
          written permission.
        </LI>
      </UL>
      <P>
        We can suspend or remove accounts that break these rules. We&rsquo;ll try to explain why
        when we do.
      </P>

      <H2>Third-party content</H2>
      <P>
        Favorite displays metadata, cover art, and links for media we don&rsquo;t own — films,
        books, albums, and so on. Those rights belong to their respective owners. If you&rsquo;re
        a rights holder and you&rsquo;d like something removed, email us and we&rsquo;ll handle it
        promptly.
      </P>

      <H2>Changes to the service</H2>
      <P>
        Favorite is a small, evolving product. Features will be added, changed, and occasionally
        removed. We&rsquo;ll do our best not to break anything important to you, but we can&rsquo;t
        promise the product will always look exactly the way it does today.
      </P>

      <H2>Ending your use</H2>
      <P>
        You can delete your favorites at any time from settings, and you can ask us to delete your
        account entirely by emailing the address below. We can also close an account that violates
        these terms or that puts other users at risk. If we close your account for a reason other
        than a serious breach, we&rsquo;ll give you a chance to export your library first.
      </P>

      <H2>The honest part</H2>
      <P>
        The service is provided as-is. We work hard to keep it running and your data safe, but we
        can&rsquo;t guarantee it will always be available, perfectly accurate, or free of bugs. To
        the extent the law allows, we aren&rsquo;t liable for indirect or consequential losses
        arising from your use of Favorite.
      </P>

      <H2>Governing law</H2>
      <P>
        These terms are governed by the laws of the State of California. Any dispute will be
        handled in the state or federal courts located there.
      </P>

      <H2>Changes to these terms</H2>
      <P>
        If we change these terms in a way that affects you meaningfully, we&rsquo;ll email you
        before it takes effect. Continuing to use the product after that means you accept the new
        version.
      </P>

      <H2>Contact</H2>
      <P>
        Questions: <Mail />.
      </P>
    </LegalPage>
  );
}

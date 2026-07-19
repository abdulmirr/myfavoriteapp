import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import ShellProvider from "@/components/ShellProvider";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * A URL from env, or the fallback — never a throw. `??` only catches
 * undefined, so a var that's present-but-empty or malformed (exactly what a
 * misconfigured Vercel env looks like) used to crash prerender. This must
 * survive any env state so the build never dies in `new URL()`.
 */
function envUrl(raw: string | undefined, fallback: string): URL {
  try {
    return new URL(raw && raw.trim() ? raw.trim() : fallback);
  } catch {
    return new URL(fallback);
  }
}

export const metadata: Metadata = {
  metadataBase: envUrl(process.env.NEXT_PUBLIC_SITE_URL, "https://myfavoriteapp.com"),
  title: {
    default: "Favorites",
    template: "%s — Favorites",
  },
  description: "One page for your taste — the books, films and music you love.",
  openGraph: {
    siteName: "Favorites",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // the supabase session storage key — lets the theme script spot signed-out
  // visitors. envUrl keeps env-less/misconfigured builds (e.g. a Vercel preview
  // whose Supabase var is unset or blank) from dying in prerender.
  const sbUrl = envUrl(process.env.NEXT_PUBLIC_SUPABASE_URL, "https://placeholder.supabase.co");
  const sbRef = sbUrl.hostname.split(".")[0];
  return (
    <html lang="en" className={`${geistMono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        {/* Switzer — the app's voice (Swiss grotesk, free via Fontshare).
            Loaded from Fontshare's CDN; Geist Mono stays via next/font as the
            data whisper (counts, stamps, type tags). */}
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link rel="preconnect" href="https://cdn.fontshare.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://api.fontshare.com/v2/css?f[]=switzer@400,500,600,700&display=swap"
        />
        {/* every page talks to Supabase (auth/data) immediately and most load
            cover art from these CDNs — warm the connections during HTML parse */}
        <link rel="preconnect" href={sbUrl.origin} crossOrigin="anonymous" />
        <link rel="preconnect" href="https://is1-ssl.mzstatic.com" />
        <link rel="preconnect" href="https://image.tmdb.org" />
        <link rel="dns-prefetch" href="https://covers.openlibrary.org" />
        <link rel="dns-prefetch" href="https://cdn-images.dzcdn.net" />
        <link rel="dns-prefetch" href="https://i.ytimg.com" />
        {/* apply the theme before first paint to avoid a light flash: a saved
            choice always wins; otherwise the signed-out marketing pages
            (landing, privacy, terms) follow the system preference */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("fav:theme");var d=t==="dark";if(!t&&["/","/privacy","/terms","/signin","/welcome","/auth/reset"].indexOf(location.pathname)>-1&&!localStorage.getItem("sb-${sbRef}-auth-token")&&matchMedia("(prefers-color-scheme: dark)").matches)d=true;if(d)document.documentElement.classList.add("dark")}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-full">
        <ShellProvider>{children}</ShellProvider>
      </body>
    </html>
  );
}

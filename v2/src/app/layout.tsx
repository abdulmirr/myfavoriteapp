import type { Metadata, Viewport } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import ViewerBoot from "@/components/ViewerBoot";
import InlineScript from "@/components/InlineScript";
import { Toaster } from "@/components/ui/Toast";

// self-hosted at build (no third-party CSS on the critical path)
const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
const mono = Geist_Mono({ subsets: ["latin"], variable: "--font-geist-mono", display: "swap" });

/** A URL from env, or the fallback — never a throw (a blank env var must not kill prerender). */
function envUrl(raw: string | undefined, fallback: string): URL {
  try {
    return new URL(raw && raw.trim() ? raw.trim() : fallback);
  } catch {
    return new URL(fallback);
  }
}

export const metadata: Metadata = {
  metadataBase: envUrl(process.env.NEXT_PUBLIC_SITE_URL, "https://myfavoriteapp.com"),
  title: { default: "Favorite", template: "%s — Favorite" },
  description: "Discover what people with taste love — books, films, music and more, picked fresh every day.",
  openGraph: { siteName: "Favorite", type: "website" },
  twitter: { card: "summary_large_image" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f4f6" },
    { media: "(prefers-color-scheme: dark)", color: "#171717" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const sb = envUrl(process.env.NEXT_PUBLIC_SUPABASE_URL, "https://placeholder.supabase.co");
  const sbRef = sb.hostname.split(".")[0];
  // Before first paint: the theme (saved choice, else the system's), and
  // whether a session exists — html[data-auth] lets signed-in skeletons show
  // instead of the visitor view, so neither flashes the other.
  const prepaint = `try{var e=document.documentElement,t=localStorage.getItem("fav:theme");if(t?t==="dark":matchMedia("(prefers-color-scheme: dark)").matches)e.classList.add("dark");e.dataset.auth=localStorage.getItem("sb-${sbRef}-auth-token")?"in":"out"}catch(_){}`;

  return (
    <html lang="en" className={`${inter.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <InlineScript html={prepaint} />
        {/* every page talks to Supabase and paints covers from these CDNs —
            warm the connections during HTML parse */}
        <link rel="preconnect" href={sb.origin} crossOrigin="anonymous" />
        <link rel="preconnect" href="https://is1-ssl.mzstatic.com" />
        <link rel="preconnect" href="https://image.tmdb.org" />
        <link rel="preconnect" href="https://cdn-images.dzcdn.net" />
        <link rel="dns-prefetch" href="https://i.ytimg.com" />
        <link rel="dns-prefetch" href="https://covers.openlibrary.org" />
      </head>
      <body className="min-h-dvh">
        <ViewerBoot />
        {children}
        <Toaster />
      </body>
    </html>
  );
}

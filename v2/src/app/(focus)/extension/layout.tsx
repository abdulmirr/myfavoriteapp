import type { Metadata } from "next";

export const metadata: Metadata = { title: "Chrome extension", robots: { index: false } };

export default function ExtensionLayout({ children }: { children: React.ReactNode }) {
  return children;
}

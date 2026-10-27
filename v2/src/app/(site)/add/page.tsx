"use client";

import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useViewer } from "@/lib/viewer";

const AddDialog = dynamic(() => import("@/components/add/AddDialog"));

/**
 * v1's /add page, kept as an address: the add dialog opens over an empty
 * page, and closing it lands on your wall (signed out → sign in first).
 */
export default function AddPage() {
  const router = useRouter();
  const v = useViewer();

  useEffect(() => {
    if (v.status === "signed-out") router.replace("/signin?next=/add");
  }, [v.status, router]);

  if (v.status !== "signed-in" || !v.profile) return <div className="min-h-[60vh]" aria-busy />;
  const home = `/${v.profile.username}`;
  return <AddDialog open onOpenChange={(o) => !o && router.replace(home)} />;
}

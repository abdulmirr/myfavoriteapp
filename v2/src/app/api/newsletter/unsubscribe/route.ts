import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { emailPage } from "@/lib/newsletter";

/**
 * Unsubscribe from the daily picks. GET is the footer link; POST is RFC 8058
 * one-click (Gmail's and Apple Mail's own "Unsubscribe" button). The token is
 * the subscriber's own random secret, so it works signed-out and can't be
 * guessed for anyone else.
 */

async function unsubscribe(req: NextRequest): Promise<string> {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (!/^[0-9a-f]{48}$/.test(token)) return "unknown";
  const { data } = await supabaseServer().rpc("newsletter_unsubscribe", { p_token: token });
  return (data as string | null) ?? "unknown";
}

export async function GET(req: NextRequest) {
  return (await unsubscribe(req)) === "unsubscribed"
    ? emailPage(
        "You’re unsubscribed.",
        "No more daily picks by email. Changed your mind? Subscribe again from the bottom of Home."
      )
    : emailPage("That link didn’t work.", "It may be incomplete — try the link in your email again.");
}

export async function POST(req: NextRequest) {
  await unsubscribe(req);
  return new NextResponse(null, { status: 200 });
}

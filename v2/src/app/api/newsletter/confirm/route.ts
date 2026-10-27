import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase";
import { emailPage } from "@/lib/newsletter";

/** The link in the confirmation email: switch the address on, land on Home. */
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (!/^[0-9a-f]{48}$/.test(token)) {
    return emailPage("That link didn’t work.", "It may be incomplete — try the link in your email again.");
  }
  const { data } = await supabaseServer().rpc("newsletter_confirm", { p_token: token });
  if (data === "active") return NextResponse.redirect(new URL("/?subscribed=1", req.nextUrl.origin), 303);
  if (data === "unsubscribed") {
    return emailPage(
      "This address is unsubscribed.",
      "You unsubscribed after this link was sent. Subscribe again from the bottom of Home anytime."
    );
  }
  return emailPage("That link didn’t work.", "It may be old — subscribe again from the bottom of Home.");
}

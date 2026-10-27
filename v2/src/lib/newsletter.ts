import type { CommunityPick } from "./data";
import { thumbCover } from "./img";
import { itemHref, typeLabel } from "./work";

/**
 * The daily-picks newsletter: Home's five community picks, by email, every
 * morning. Templates are table-based with inline styles (Gmail, Apple Mail,
 * Outlook) in the v2 look — gray page, white cards, the gold star.
 */

export const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://myfavoriteapp.com").replace(/\/$/, "");
const FROM = process.env.EMAIL_FROM || "Favorite <hello@myfavoriteapp.com>";
// hosted on our storage, not the site, so emails never depend on a deploy
const STAR = "https://bvpruvuenqdwilysgojy.supabase.co/storage/v1/object/public/assets/icon-192.png";
const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Inter,Helvetica,Arial,sans-serif";

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export type Email = {
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
};

function shell(preheader: string, inner: string, footer: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"></head>
<body style="margin:0;padding:0;background:#f3f4f6;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="padding:0 4px 20px;font-family:${FONT};"><a href="${SITE}" style="text-decoration:none;color:#111827;font-size:21px;font-weight:700;letter-spacing:-0.02em;"><img src="${STAR}" width="22" height="22" alt="" style="vertical-align:-4px;margin-right:6px;border:0;">favorite</a></td></tr>
${inner}
<tr><td style="padding:24px 4px 0;font-family:${FONT};font-size:12px;line-height:1.6;color:#6b7280;">${footer}</td></tr>
</table></td></tr></table></body></html>`;
}

const card = (inner: string, pad = "24px") =>
  `<tr><td style="background:#ffffff;border:1px solid #e5e7eb;border-radius:16px;padding:${pad};font-family:${FONT};">${inner}</td></tr>`;
const gap = `<tr><td style="height:12px;line-height:12px;font-size:0;">&nbsp;</td></tr>`;

export function confirmEmail(token: string): Email {
  const url = `${SITE}/api/newsletter/confirm?token=${encodeURIComponent(token)}`;
  const inner = card(`<h1 style="margin:0;font-size:22px;line-height:1.3;font-weight:700;letter-spacing:-0.02em;color:#111827;">Confirm your subscription</h1>
<p style="margin:8px 0 0;font-size:15px;line-height:1.6;color:#4b5563;">One click and Favorite&rsquo;s daily picks start landing here: five favorites from people with taste, and why they love them. Every morning.</p>
<a href="${esc(url)}" style="display:inline-block;margin-top:20px;background:#111827;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;padding:12px 20px;border-radius:10px;">Confirm subscription</a>`);
  return {
    subject: "Confirm your daily picks from Favorite",
    html: shell(
      "One click to start getting Favorite's daily picks.",
      inner,
      "Didn&rsquo;t ask for this? Ignore this email and you won&rsquo;t hear from us."
    ),
    text: `Confirm your subscription to Favorite's daily picks:\n${url}\n\nDidn't ask for this? Ignore this email and you won't hear from us.`,
  };
}

export function unsubscribeUrl(token: string): string {
  return `${SITE}/api/newsletter/unsubscribe?token=${encodeURIComponent(token)}`;
}

/** One issue for one subscriber (the unsubscribe link is theirs). */
export function issueEmail(day: string, picks: CommunityPick[], token: string): Email {
  const date = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
  const unsub = unsubscribeUrl(token);
  const rows = picks.map(({ item, by, count }) => {
    const href = `${SITE}${itemHref({ canonical_id: item.canonical_id, item_id: item.id }) ?? ""}`;
    const cover = item.image_url ? thumbCover(item.image_url, 200) : null;
    const name = by.display_name || `@${by.username}`;
    const others = count > 1 ? ` and ${count - 1} other${count === 2 ? "" : "s"}` : "";
    return card(
      `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
${cover ? `<td width="96" valign="top" style="padding-right:16px;"><a href="${esc(href)}"><img src="${esc(cover)}" width="96" alt="" style="display:block;width:96px;height:auto;border-radius:6px;border:0;"></a></td>` : ""}
<td valign="top" style="font-family:${FONT};">
<p style="margin:0;font-size:12px;color:#6b7280;">${esc(typeLabel(item))}</p>
<p style="margin:2px 0 0;font-size:17px;line-height:1.3;font-weight:600;"><a href="${esc(href)}" style="color:#111827;text-decoration:none;">${esc(item.title)}</a></p>
${item.creator ? `<p style="margin:2px 0 0;font-size:14px;color:#4b5563;">${esc(item.creator)}</p>` : ""}
<p style="margin:10px 0 0;font-size:14px;line-height:1.55;color:#111827;">&ldquo;${esc((item.description ?? "").trim())}&rdquo;</p>
<p style="margin:6px 0 0;font-size:13px;color:#6b7280;">&mdash; <a href="${SITE}/${esc(by.username)}" style="color:#6b7280;">${esc(name)}</a>${others}</p>
</td></tr></table>`,
      "16px"
    );
  });
  const inner = [
    card(`<p style="margin:0;font-size:13px;color:#6b7280;">${esc(date)}</p>
<h1 style="margin:6px 0 4px;font-size:24px;line-height:1.25;font-weight:700;letter-spacing:-0.02em;color:#111827;">Today&rsquo;s picks</h1>
<p style="margin:0;font-size:15px;line-height:1.55;color:#4b5563;">${picks.length === 5 ? "Five" : picks.length} favorites from people with taste, and why they love them.</p>`),
    ...rows,
    `<tr><td style="padding:16px 4px 0;font-family:${FONT};text-align:center;font-size:15px;line-height:1.6;color:#6b7280;">That&rsquo;s it. Here today, gone tomorrow.<br><a href="${SITE}" style="color:#111827;font-weight:600;text-decoration:none;">Open Favorite &rarr;</a></td></tr>`,
  ].join(gap);
  const titles = picks.slice(0, 2).map((p) => (p.item.title.length > 40 ? `${p.item.title.slice(0, 39)}…` : p.item.title));
  const first = (picks[0]?.item.description ?? "").trim();
  return {
    subject: `Today on Favorite: ${titles.join(", ")} and more`,
    html: shell(
      first ? `“${first}”` : "Today's picks from Favorite.",
      inner,
      `You&rsquo;re getting this because you subscribed to Favorite&rsquo;s daily picks. <a href="${esc(unsub)}" style="color:#6b7280;">Unsubscribe</a>.`
    ),
    text: [
      `Today's picks — ${date}`,
      "",
      ...picks.flatMap(({ item, by }) => [
        `${item.title}${item.creator ? ` — ${item.creator}` : ""} (${typeLabel(item)})`,
        `"${(item.description ?? "").trim()}" — ${by.display_name || `@${by.username}`}`,
        `${SITE}${itemHref({ canonical_id: item.canonical_id, item_id: item.id }) ?? ""}`,
        "",
      ]),
      `Unsubscribe: ${unsub}`,
    ].join("\n"),
    headers: {
      "List-Unsubscribe": `<${unsub}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    },
  };
}

/** Send one email, or a batch of up to 100 (Resend's batch limit). */
export async function sendEmails(to: string[], emails: Email[]): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !emails.length) return false;
  const payload = emails.map((e, i) => ({ from: FROM, to: [to[i]], ...e }));
  const batch = payload.length > 1;
  const post = () =>
    fetch(`https://api.resend.com/emails${batch ? "/batch" : ""}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(batch ? payload : payload[0]),
    }).catch(() => null);
  let res = await post();
  if (!res?.ok) res = await new Promise((r) => setTimeout(r, 800)).then(post);
  if (!res?.ok) console.error("newsletter send failed:", res?.status, await res?.text().catch(() => ""));
  return !!res?.ok;
}

/** The small standalone page email links land on (confirm / unsubscribe). */
export function emailPage(title: string, note: string): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title} — Favorite</title>
<body style="margin:0;display:grid;place-items:center;min-height:100vh;background:#f3f4f6;font-family:${FONT};color:#111827">
<div style="text-align:center;font-size:15px;line-height:1.65;padding:24px;max-width:420px">
<img src="/faviconstar.svg" width="28" height="28" alt="Favorite" style="margin:0 auto 20px;display:block">
<p style="margin:0 0 6px;font-size:17px;font-weight:600">${title}</p>
<p style="margin:0;color:#6b7280">${note}</p>
<p style="margin:28px 0 0;font-size:13px"><a href="${SITE}" style="color:#111827;font-weight:600;text-decoration:none">Open Favorite &rarr;</a></p>
</div></body>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

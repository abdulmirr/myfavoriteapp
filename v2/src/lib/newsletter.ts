import type { CommunityPick } from "./data";
import type { DailyPick, MediaType } from "./types";
import { safeFetch } from "./api-guard";
import { thumbCover } from "./img";
import { itemHref, metaLine, typeLabel } from "./work";

/**
 * The daily-picks email: the five picks Home shows you, every morning —
 * chosen from your own favorites if you're a member, the community's five if
 * you're not. Each pick is Home's card in table markup with inline styles
 * (Gmail, Apple Mail, Outlook): the note tab, the cover on its stage, the
 * title and meta, and "Why it's for you" in the yellow highlight.
 */

export const SITE = (process.env.NEXT_PUBLIC_SITE_URL ?? "https://myfavoriteapp.com").replace(/\/$/, "");
const FROM = process.env.EMAIL_FROM || "Favorite <hello@myfavoriteapp.com>";
// hosted on our storage, not the site, so emails never depend on a deploy
const STAR = "https://bvpruvuenqdwilysgojy.supabase.co/storage/v1/object/public/assets/icon-192.png";
// Inter where the client loads web fonts (Apple Mail), the system's own elsewhere
const FONT = "Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

// Home's palette (Tailwind's grays, yellow-200 for the highlight)
const INK = "#111827";
const BODY = "#4b5563";
const MUTED = "#6b7280";
const FAINT = "#9ca3af";
const LINE = "#e5e7eb";
const PAGE = "#f3f4f6";
const TAB = "#f9fafb";
const HIGHLIGHT = "#fef08a";

export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export type Email = {
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
};

/**
 * Home's page: gray ground, the star, then a 560px column. The preheader is
 * padded with joiners so the inbox preview stops at it instead of running
 * into the body.
 */
function shell(preheader: string, inner: string, footer: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only"><meta name="supported-color-schemes" content="light only">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>:root{color-scheme:light only}a{text-decoration:none}@media (max-width:600px){.page{padding:32px 12px 40px!important}.hello{font-size:28px!important;line-height:34px!important}.sub{font-size:17px!important}}</style>
</head>
<body style="margin:0;padding:0;background:${PAGE};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(preheader)}${"&#8204;&nbsp;".repeat(60)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${PAGE}" style="background:${PAGE};"><tr><td align="center" class="page" style="padding:48px 20px 56px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td align="center" style="padding:0 0 36px;"><a href="${SITE}"><img src="${STAR}" width="32" height="32" alt="Favorite" style="display:block;border:0;"></a></td></tr>
${inner}
<tr><td align="center" style="padding:40px 16px 0;font-family:${FONT};font-size:12px;line-height:19px;color:${FAINT};">${footer}</td></tr>
</table></td></tr></table></body></html>`;
}

/** Home's centered greeting: the big line, then the gray one */
const hello = (title: string, sub: string) =>
  `<tr><td align="center" style="padding:0 8px 40px;font-family:${FONT};">
<h1 class="hello" style="margin:0;font-size:32px;line-height:38px;font-weight:600;letter-spacing:-0.025em;color:${INK};">${title}</h1>
<p class="sub" style="margin:10px 0 0;font-size:18px;line-height:26px;letter-spacing:-0.01em;color:${MUTED};">${sub}</p>
</td></tr>`;

const button = (href: string, label: string) =>
  `<a href="${esc(href)}" style="display:inline-block;background:${INK};color:#ffffff;font-family:${FONT};font-size:14px;line-height:20px;font-weight:600;text-decoration:none;padding:11px 20px;border-radius:8px;">${label}</a>`;

export function confirmEmail(token: string): Email {
  const url = `${SITE}/api/newsletter/confirm?token=${encodeURIComponent(token)}`;
  const inner = `${hello("One click and you’re in.", "Five picks every morning, and why they’re worth your time.")}
<tr><td align="center" style="padding:0 0 8px;">${button(url, "Confirm subscription")}</td></tr>`;
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

/* ── the issue ──────────────────────────────────────────────────────────── */

/** One pick as the email shows it — Home's PickCard, for either kind of pick. */
export type IssuePick = {
  media_type: MediaType;
  title: string;
  creator: string | null;
  year: string | null;
  canonical_id: string | null;
  image_url: string | null;
  view_url: string | null;
  item_id?: string | null;
  /** the note tab: an AI pick's hook, or a person's thought */
  note: string;
  /** AI picks: why it fits them (the yellow highlight) */
  reason?: string;
  /** community picks: whose favorite this is */
  by?: { username: string; name: string; count: number };
};

export type Issue = {
  day: string;
  /**
   * own: chosen from their favorites (Home's member view); starter: a member
   * with too few favorites to read yet; community: no account
   */
  kind: "own" | "starter" | "community";
  /** first name for the greeting */
  name: string;
  picks: IssuePick[];
};

export const dailyIssuePick = (p: DailyPick): IssuePick => ({
  media_type: p.media_type,
  title: p.title,
  creator: p.creator || null,
  year: p.year || null,
  canonical_id: p.canonical_id,
  image_url: p.image_url,
  view_url: p.view_url,
  note: p.hook,
  reason: p.reason,
});

export const communityIssuePick = ({ item, by, count }: CommunityPick): IssuePick => ({
  media_type: item.media_type,
  title: item.title,
  creator: item.creator,
  year: item.metadata?.year != null ? String(item.metadata.year) : null,
  canonical_id: item.canonical_id,
  image_url: item.image_url,
  view_url: item.view_url,
  item_id: item.id,
  note: `“${(item.description ?? "").trim()}”`,
  by: { username: by.username, name: by.display_name || `@${by.username}`, count },
});

/* Each cover sits on a stage tinted from its own colors — Home blurs the
   cover behind itself, which no mail client can do, so the stage takes the
   blur's average instead. Read once per cover per run. */

type Art = { src: string; w: number; h: number; tint: string };
const arts = new Map<string, Promise<Art | null>>();

/** CSS saturate(), as Home's backdrop applies it */
function saturate([r, g, b]: number[], s: number): number[] {
  const m = [
    [0.213 + 0.787 * s, 0.715 - 0.715 * s, 0.072 - 0.072 * s],
    [0.213 - 0.213 * s, 0.715 + 0.285 * s, 0.072 - 0.072 * s],
    [0.213 - 0.213 * s, 0.715 - 0.715 * s, 0.072 + 0.928 * s],
  ];
  return m.map(([a, c, d]) => Math.max(0, Math.min(255, a * r + c * g + d * b)));
}

/**
 * Home's stage, flattened: the cover's average color at 150% saturation and
 * 70% opacity over gray-200, under a 20% white wash.
 */
function stageTint(mean: number[]): string {
  const ground = [229, 231, 235];
  const c = saturate(mean, 1.5).map((v, i) => 0.8 * (0.7 * v + 0.3 * ground[i]) + 0.2 * 255);
  return `#${c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("")}`;
}

async function readArt(url: string): Promise<Art | null> {
  // uploads are phone originals; storage resizes them
  const src = /\.supabase\.co\/storage\//.test(url) ? thumbCover(url, 600) : url;
  try {
    const res = await safeFetch(src, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const { default: sharp } = await import("sharp");
    const img = sharp(Buffer.from(await res.arrayBuffer()));
    const { width, height } = await img.metadata();
    const { channels } = await img.stats();
    if (!width || !height || channels.length < 3) return null;
    return { src, w: width, h: height, tint: stageTint(channels.slice(0, 3).map((c) => c.mean)) };
  } catch {
    return null; // the cover still shows, on Home's plain gray stage
  }
}

function artFor(url: string): Promise<Art | null> {
  let art = arts.get(url);
  if (!art) {
    if (arts.size > 500) arts.clear();
    art = readArt(url);
    arts.set(url, art);
  }
  return art;
}

/** a cover's height on the stage: 84% of a 16:9 stage the card's width, as on Home */
const COVER_H = 248;
/** ...and its widest, so it still fits the stage on a 360px phone */
const COVER_MAX_W = 260;
const STAGE_W = 526;
/** wide media fills the stage edge to edge (when we can't measure it) */
const WIDE: MediaType[] = ["video", "article", "other"];

function stage(p: IssuePick, href: string, art: Art | null): string {
  const link = (img: string) => `<a href="${esc(href)}" style="text-decoration:none;">${img}</a>`;
  if (!p.image_url) {
    // Home's title card: the title in white on black
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td bgcolor="#000000" valign="middle" style="background:#000000;border-radius:6px;height:${COVER_H + 48}px;padding:0 20px;font-family:${FONT};">
<a href="${esc(href)}" style="text-decoration:none;"><span style="display:block;font-size:18px;line-height:25px;font-weight:600;color:#ffffff;">${esc(p.title)}</span>${p.creator ? `<span style="display:block;margin-top:4px;font-size:14px;line-height:20px;color:#b3b3b3;">by ${esc(p.creator)}</span>` : ""}</a>
</td></tr></table>`;
  }
  const src = art?.src ?? p.image_url;
  const ratio = art ? art.w / art.h : null;
  // Home crops wide art to 16:9; email can't crop, so only art that's about
  // that shape fills the stage — a squarish share image sits on it like a cover
  if (ratio ? ratio >= 1.6 : WIDE.includes(p.media_type)) {
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td bgcolor="${LINE}" style="background:${LINE};border-radius:6px;">${link(
      `<img src="${esc(src)}" width="${STAGE_W}" alt="" style="display:block;width:100%;max-width:${STAGE_W}px;height:auto;border:0;border-radius:6px;">`
    )}</td></tr></table>`;
  }
  const tint = art?.tint ?? LINE;
  const h = ratio ? Math.min(COVER_H, Math.floor(COVER_MAX_W / ratio)) : COVER_H;
  const w = ratio ? Math.round(h * ratio) : null;
  // a shorter cover keeps the stage's height
  const pad = 24 + Math.floor((COVER_H - h) / 2);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" valign="middle" bgcolor="${tint}" style="background:${tint};border-radius:6px;padding:${pad}px 12px;">${link(
    `<img src="${esc(src)}"${w ? ` width="${w}"` : ""} height="${h}" alt="${esc(p.title)}" style="display:block;${w ? `width:${w}px;` : ""}height:${h}px;max-width:100%;border:0;${p.media_type === "book" ? "border-radius:2px;" : ""}box-shadow:0 6px 24px rgba(0,0,0,0.22);">`
  )}</td></tr></table>`;
}

/** Home's PickCard: note tab, then the card — stage, title, meta, and the "why" */
function pickCard(p: IssuePick, art: Art | null): string {
  const inner = itemHref({ canonical_id: p.canonical_id, item_id: p.item_id });
  const external = !!p.view_url;
  const href = p.view_url ?? (inner ? `${SITE}${inner}` : SITE);
  const meta = metaLine({ creator: p.creator ?? "", year: p.year });
  const foot = p.reason
    ? `<span style="display:block;margin-bottom:4px;font-weight:700;">Why it&rsquo;s for you:</span><span style="background:${HIGHLIGHT};padding:1px 2px;">${esc(p.reason)}</span>`
    : p.by
      ? `From <a href="${SITE}/${esc(p.by.username)}" style="color:${INK};font-weight:600;text-decoration:none;">${esc(p.by.name)}</a>&rsquo;s favorites${
          p.by.count > 1 && inner
            ? ` &middot; <a href="${esc(SITE + inner)}" style="color:${BODY};text-decoration:underline;">${p.by.count - 1} more ${p.by.count === 2 ? "person loves" : "people love"} it</a>`
            : ""
        }`
      : "";
  return `<tr><td style="padding:0 0 24px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:0 8px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;"><tr><td bgcolor="${TAB}" style="background:${TAB};border:1px solid ${LINE};border-bottom:0;border-radius:16px 16px 0 0;padding:10px 16px 11px;font-family:${FONT};font-size:14px;line-height:21px;font-weight:500;color:${INK};">${esc(p.note)}${p.by ? ` <span style="font-weight:400;color:${MUTED};">&mdash; @${esc(p.by.username)}</span>` : ""}</td></tr></table>
</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="background:#ffffff;border:1px solid ${LINE};border-radius:16px;border-collapse:separate;">
<tr><td style="padding:16px;font-family:${FONT};">
${stage(p, href, art)}
<p style="margin:12px 0 0;font-size:18px;line-height:24px;font-weight:600;letter-spacing:-0.015em;"><a href="${esc(href)}" style="color:${INK};text-decoration:none;">${esc(p.title)}</a>${external ? `<span style="color:${FAINT};font-weight:400;">&nbsp;&#8599;</span>` : ""}</p>
${meta ? `<p style="margin:6px 0 0;font-size:14px;line-height:20px;color:${MUTED};">${esc(meta)}</p>` : ""}
<p style="margin:${meta ? 2 : 6}px 0 0;font-size:14px;line-height:20px;color:${MUTED};">${esc(typeLabel(p))}</p>
</td></tr>
${foot ? `<tr><td style="padding:0 16px 16px;font-family:${FONT};"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="border-top:1px solid ${PAGE};padding-top:12px;font-size:14px;line-height:23px;color:${BODY};">${foot}</td></tr></table></td></tr>` : ""}
</table>
</td></tr>`;
}

/** "Process, Boiling Point and 3 more" */
function titleLine(picks: IssuePick[]): string {
  const t = picks.map((p) => (p.title.length > 40 ? `${p.title.slice(0, 39)}…` : p.title));
  if (t.length <= 2) return t.join(" and ");
  return `${t[0]}, ${t[1]} and ${t.length - 2} more`;
}

/** One issue for one subscriber (the unsubscribe link is theirs). */
export async function issueEmail(issue: Issue, token: string): Promise<Email> {
  const { day, kind, picks } = issue;
  const noon = new Date(`${day}T12:00:00Z`);
  const weekday = noon.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
  const date = noon.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
  const dow = noon.getUTCDay();
  // Home's own lines, without the typewriter's trailing dots
  const sub =
    kind !== "own"
      ? "Here are today&rsquo;s favorites from the community."
      : dow === 6
        ? "Here&rsquo;s something for your weekend."
        : dow === 0
          ? "Here are today&rsquo;s picks &mdash; take your time."
          : "Here are today&rsquo;s picks, chosen for you.";
  const unsub = unsubscribeUrl(token);
  const art = await Promise.all(picks.map((p) => (p.image_url ? artFor(p.image_url) : null)));

  const close =
    kind === "starter"
      ? `Favorite 3 albums, books or films and tomorrow&rsquo;s picks are chosen from your taste.`
      : kind === "community"
        ? `Want picks chosen from your own taste? Make your page and they will be.`
        : `That&rsquo;s today. Fresh picks tomorrow morning.`;
  const inner = [
    hello(`Happy ${esc(weekday)}, ${esc(issue.name)}!`, sub),
    ...picks.map((p, i) => pickCard(p, art[i])),
    `<tr><td align="center" style="padding:24px 16px 0;font-family:${FONT};">
<p style="margin:0 0 20px;font-size:15px;line-height:23px;color:${MUTED};">${close}</p>
${kind === "community" ? button(`${SITE}/signin`, "Make your page") : button(SITE, "Open Favorite")}
</td></tr>`,
  ].join("\n");

  const subject = kind === "own" ? `Your picks for ${weekday}: ${titleLine(picks)}` : `Today on Favorite: ${titleLine(picks)}`;
  const link = (p: IssuePick) => {
    const inner = itemHref({ canonical_id: p.canonical_id, item_id: p.item_id });
    return p.view_url ?? (inner ? `${SITE}${inner}` : SITE);
  };
  return {
    subject,
    html: shell(
      picks[0]?.note ?? "Today's picks from Favorite.",
      inner,
      `You&rsquo;re getting this because you subscribed to Favorite&rsquo;s daily picks.<br><a href="${esc(unsub)}" style="color:${FAINT};text-decoration:underline;">Unsubscribe</a>`
    ),
    text: [
      `Happy ${weekday}, ${issue.name}! Today's picks — ${date}`,
      "",
      ...picks.flatMap((p) => [
        `${p.title}${p.creator ? ` — ${p.creator}` : ""} (${typeLabel(p)})`,
        p.by ? `${p.note} — ${p.by.name}` : p.note,
        ...(p.reason ? [`Why it's for you: ${p.reason}`] : []),
        link(p),
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

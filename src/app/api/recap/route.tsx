import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { supabaseServer } from "@/lib/supabase";
import { coverDataUris } from "@/lib/og-covers";

/**
 * The monthly recap story card: ?u=<username>&m=YYYY-MM → 1080×1920 PNG.
 * Real numbers, human-templated, no generated voice — the month's covers,
 * what it skewed toward, and how far the taste spread. Unlocks at 3 saves
 * in the month so the card never renders thin. Public like the OG images.
 */

const W = 1080;
const H = 1920;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const TYPE_PLURAL: Record<string, string> = {
  book: "books", movie: "films", tv: "shows", music: "albums",
  podcast: "podcasts", video: "videos", article: "reads", photo: "photos", other: "pieces",
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const username = url.searchParams.get("u") ?? "";
  const m = url.searchParams.get("m") ?? "";
  if (!/^[a-z0-9_]{2,30}$/.test(username) || !/^\d{4}-(0[1-9]|1[0-2])$/.test(m)) {
    return new Response("bad request", { status: 400 });
  }
  const [yearStr, monthStr] = m.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);
  const start = `${m}-01`;
  const end =
    month === 12 ? `${year + 1}-01-01` : `${yearStr}-${String(month + 1).padStart(2, "0")}-01`;

  const db = supabaseServer();
  const [{ data: profile }, regular, semibold] = await Promise.all([
    db
      .from("profiles")
      .select("id, username, display_name")
      .eq("username", username)
      .single<{ id: string; username: string; display_name: string }>(),
    readFile(join(process.cwd(), "src/fonts/GeistMono-Regular.ttf")),
    readFile(join(process.cwd(), "src/fonts/GeistMono-SemiBold.ttf")),
  ]);
  if (!profile) return new Response("not found", { status: 404 });

  const [{ data: items }, { count: spreadCount }] = await Promise.all([
    db
      .from("items")
      .select("media_type, image_url")
      .eq("profile_id", profile.id)
      .gte("created_at", start)
      .lt("created_at", end)
      .order("created_at", { ascending: false }),
    db
      .from("items")
      .select("id", { count: "exact", head: true })
      .eq("via_profile_id", profile.id)
      .gte("created_at", start)
      .lt("created_at", end),
  ]);
  const month_items = items ?? [];
  // below 3 saves the card would be thin — that's the unlock, not a failure
  if (month_items.length < 3) return new Response("not enough favorites this month", { status: 404 });

  const covers = await coverDataUris(
    month_items.map((i) => i.image_url).filter((u): u is string => !!u),
    9
  );

  // "12 favorites — 5 books · 4 albums · 3 films"
  const byType = new Map<string, number>();
  for (const i of month_items) {
    const label = TYPE_PLURAL[i.media_type] ?? "pieces";
    byType.set(label, (byType.get(label) ?? 0) + 1);
  }
  const breakdown = [...byType.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([label, n]) => `${n} ${label}`)
    .join(" · ");

  const name = profile.display_name || `@${profile.username}`;
  const TILE = covers.length > 6 ? 280 : 340;
  const perRow = covers.length > 6 ? 3 : covers.length > 1 ? 2 : 1;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#ffffff",
          color: "#18181b",
          fontFamily: "Geist Mono",
          alignItems: "center",
          justifyContent: "center",
          padding: 72,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 30,
            color: "#a1a1aa",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
          }}
        >
          {MONTHS[month - 1]} {year}
        </div>
        <div
          style={{
            display: "flex",
            marginTop: 16,
            fontSize: 64,
            fontWeight: 600,
            letterSpacing: "-0.02em",
            textAlign: "center",
          }}
        >
          {name}
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "center",
            gap: 28,
            marginTop: 70,
            width: perRow * TILE + (perRow - 1) * 28,
          }}
        >
          {covers.map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={url}
              alt=""
              width={TILE}
              height={TILE}
              style={{
                width: TILE,
                height: TILE,
                objectFit: "cover",
                boxShadow: "0 10px 40px rgba(0,0,0,0.18)",
              }}
            />
          ))}
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            marginTop: 70,
            gap: 10,
          }}
        >
          <div style={{ display: "flex", fontSize: 32 }}>
            {month_items.length} favorite{month_items.length === 1 ? "" : "s"}
            {breakdown ? ` — ${breakdown}` : ""}
          </div>
          {(spreadCount ?? 0) > 0 && (
            <div style={{ display: "flex", fontSize: 30, color: "#52525b" }}>
              {spreadCount} favorite{spreadCount === 1 ? "" : "s"} spread from this library
            </div>
          )}
        </div>

        <div style={{ display: "flex", marginTop: 60, fontSize: 28, color: "#a1a1aa" }}>
          myfavoriteapp.com/{profile.username}
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      fonts: [
        { name: "Geist Mono", data: regular, weight: 400, style: "normal" },
        { name: "Geist Mono", data: semibold, weight: 600, style: "normal" },
      ],
      headers: {
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "Content-Disposition": `inline; filename="favorites-${username}-${m}.png"`,
      },
    }
  );
}

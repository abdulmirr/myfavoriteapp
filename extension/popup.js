// The popup: the page you're on, ready to keep. It opens on what it already
// knows (your lists, cached locally) and never waits on the network: every
// action lands at once and its RPC follows, rolled back if it fails. Writes
// use keepalive, so clicking away mid-save loses nothing. Auth is a personal
// token minted at myfavoriteapp.com/extension and stored in
// chrome.storage.local by content.js; every call is a PostgREST RPC
// (extension_state, extension_save, extension_save_to_list, …) that validates
// the token server-side.

const $ = (id) => document.getElementById(id);
const calm = matchMedia("(prefers-reduced-motion: reduce)").matches;

const svg = (body, size = 24, stroke = 2.2, cls = "") =>
  `<svg class="${cls}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const CHECK = svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>', 13, 3.4, "check");
const PLUS = svg('<path d="M12 5v14M5 12h14"/>', 15, 2.2, "plus");
const LIST = svg('<path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01"/>', 16);
const LOCK = svg('<rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/>', 15);
const UNLOCK = svg('<rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 7.5-2"/>', 15);
const SOUND_ON = svg('<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>', 15, 2);
const SOUND_OFF = svg('<path d="M11 5 6 9H3v6h3l5 4z"/><path d="m22 9-6 6M16 9l6 6"/>', 15, 2);

let token = "";
let tab = null;
let me = null;
let meta = { title: "", site: "", image: "", icon: "" };
let lists = []; // id null: not made yet (the starter, or one just named here)
let fav = { on: false, thought: "" };
let query = "";
let cursor = -1; // keyboard highlight, an index into options()
let makePublic = true;
let scraped = Promise.resolve();

/* ── network ──────────────────────────────────────────────────────────── */

async function rpc(fn, body, write = false) {
  try {
    const sent = fetch(`${FAV_CONFIG.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      keepalive: write,
      headers: {
        "Content-Type": "application/json",
        apikey: FAV_CONFIG.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${FAV_CONFIG.SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ p_token: token, ...body }),
    });
    if (write) refreshPages();
    return await (await sent).json();
  } catch {
    return null;
  }
}

// your public pages are cached: this tells the app to expire them once the
// write lands (it does the waiting, since the popup may be gone by then).
// no-cors because the answer doesn't matter and the extension has no host
// permission for the app
function refreshPages() {
  fetch(`${FAV_CONFIG.APP_URL}/api/revalidate/extension`, {
    method: "POST",
    mode: "no-cors",
    keepalive: true,
    body: JSON.stringify({ token, url: tab.url }),
  }).catch(() => {});
}

// one queue per target, so a quick tick-untick reaches the server in order
const lanes = new Map();
const lane = (key, job) => {
  const next = (lanes.get(key) ?? Promise.resolve()).then(job, job);
  lanes.set(key, next);
  return next;
};

// removals wait a beat: a second tap is the undo, and the favorite (its pin,
// its place on the wall) or the list row (its note) was never touched. Closing
// the popup sends them; if that ever fails, nothing was lost.
const UNDO_MS = 4000;
const removals = new Map();

function removeSoon(key, commit) {
  const run = () => {
    clearTimeout(timer);
    removals.delete(key);
    commit();
  };
  const timer = setTimeout(run, UNDO_MS);
  removals.set(key, { timer, run });
}

function takeBack(key) {
  const pending = removals.get(key);
  if (!pending) return false;
  clearTimeout(pending.timer);
  removals.delete(key);
  return true;
}

/* ── what we already know ─────────────────────────────────────────────── */

const CACHE = "fav:cache";

const readCache = () => {
  try {
    return JSON.parse(localStorage.getItem(CACHE));
  } catch {
    return null;
  }
};

function writeCache() {
  if (!me) return;
  const keep = lists.filter((l) => l.id);
  localStorage.setItem(
    CACHE,
    JSON.stringify({
      who: token.slice(0, 8),
      me,
      lists: keep.map(({ id, title, is_public, count, covers, cover_image_url }) => ({ id, title, is_public, count, covers, cover_image_url })),
      // the last page: reopening it shows its ticks straight away
      page: tab && { url: tab.url, fav: fav.on, thought: fav.thought, in: keep.filter((l) => l.has).map((l) => l.id) },
    })
  );
}

/* ── images ───────────────────────────────────────────────────────────── */

// lib/img.ts's rewrites: stored covers are 500–600px, avatars phone originals
const OBJECT = "/storage/v1/object/public/";

function resized(url, px, square) {
  try {
    const u = new URL(url);
    if (!u.hostname.endsWith(".supabase.co") || !u.pathname.startsWith(OBJECT)) return null;
    if (/\.(svg|gif)$/i.test(u.pathname)) return null;
    u.pathname = u.pathname.replace(OBJECT, "/storage/v1/render/image/public/");
    u.searchParams.set("width", String(px));
    if (square) u.searchParams.set("height", String(px));
    u.searchParams.set("resize", square ? "cover" : "contain");
    u.searchParams.set("quality", "75");
    return u.toString();
  } catch {
    return null;
  }
}

function thumb(url, px = 100) {
  const stored = resized(url, px);
  if (stored) return stored;
  try {
    const host = new URL(url).hostname;
    if (host.endsWith("mzstatic.com")) return url.replace(/\/\d+x\d+([a-z]*)\.(jpg|png|webp)$/i, `/${px}x${px}$1.$2`);
    if (host === "image.tmdb.org") return url.replace("/t/p/w500", "/t/p/w154");
    if (host.endsWith("dzcdn.net")) return url.replace(/\/\d+x\d+(-[\d-]+)\.(jpg|png)$/i, `/${px}x${px}$1.$2`);
    if (host === "covers.openlibrary.org") return url.replace(/-L\.jpg$/i, "-M.jpg");
  } catch {
    /* malformed: use it as it is */
  }
  return url;
}

// Chrome keeps a popup's window hidden until the page stops loading, and any
// image still in flight counts: one slow cover host would hold the whole thing
// shut. So nothing remote starts until the page has loaded.
const loaded = new Promise((done) => {
  if (document.readyState === "complete") done();
  else addEventListener("load", () => setTimeout(done));
});

/** An image that fades in when it arrives, and removes itself if it can't. */
function pic(src, className) {
  const img = document.createElement("img");
  img.alt = "";
  img.className = className;
  img.decoding = "async";
  img.onload = () => img.classList.add("in");
  img.onerror = () => img.remove();
  loaded.then(() => (img.src = src));
  return img;
}

/* ── the page ─────────────────────────────────────────────────────────── */

/** Runs inside the page: the title and art worth keeping for this URL. */
function grabMeta() {
  const q = (sel) => document.querySelector(sel)?.getAttribute("content")?.trim() || "";
  const abs = (u) => {
    try {
      return new URL(u, location.href).href;
    } catch {
      return "";
    }
  };
  const flat = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const host = location.hostname.replace(/^www\./, "");
  const site = q('meta[property="og:site_name"]') || host;

  let title = q('meta[property="og:title"]');
  let image =
    q('meta[property="og:image"]') ||
    q('meta[name="og:image"]') ||
    q('meta[name="twitter:image"]') ||
    q('meta[property="twitter:image"]') ||
    document.querySelector('link[rel="image_src"]')?.getAttribute("href") ||
    "";

  // a single-page app keeps the head it first loaded with: once we've moved
  // on from that URL, the tags only count if og:url moved here too
  const loaded = performance.getEntriesByType("navigation")[0]?.name;
  const moved = loaded && abs(loaded).split("#")[0] !== location.href.split("#")[0];
  if (moved) {
    let here = false;
    try {
      const og = new URL(q('meta[property="og:url"]'), location.href);
      const now = new URLSearchParams(location.search);
      here =
        !!q('meta[property="og:url"]') &&
        og.pathname.replace(/\/$/, "") === location.pathname.replace(/\/$/, "") &&
        [...og.searchParams].every(([k, v]) => now.get(k) === v);
    } catch {
      /* no usable og:url: the tags can't be trusted */
    }
    if (!here) title = image = "";
  }
  // an og:title that's only the site's name says nothing about a deeper page
  const label = flat(host.split(".").slice(-2, -1)[0] || host);
  if (location.pathname !== "/" && [flat(site), label].includes(flat(title))) title = "";
  // share images that are only the site's logo
  if (/\/rweb\/ssr\/default\/|\/img\/desktop\/yt_1200/.test(image)) image = "";

  // YouTube's id gives the real thumbnail when the head is another video's
  const video =
    /(^|\.)youtube\.com$/.test(host) &&
    (new URLSearchParams(location.search).get("v") || location.pathname.match(/^\/(?:shorts|live)\/([\w-]{11})/)?.[1]);
  if (video && !image.includes(video)) {
    image = `https://i.ytimg.com/vi/${video}/maxresdefault.jpg`;
    title = "";
  }

  // no share image: the biggest real picture on the page
  if (!image) {
    let best = 0;
    for (const el of document.images) {
      const area = el.naturalWidth * el.naturalHeight;
      if (el.naturalWidth >= 280 && el.naturalHeight >= 160 && area > best && /^https?:/.test(el.currentSrc)) {
        best = area;
        image = el.currentSrc;
      }
    }
  }

  const icon = document.querySelector('link[rel~="apple-touch-icon"]')?.getAttribute("href");
  return {
    title: title || document.title,
    tagged: !!title,
    site,
    image: image ? abs(image) : "",
    icon: icon ? abs(icon) : "",
  };
}

/**
 * "(3) The Essay — Site" → "The Essay". Only the page's own name goes. Unread
 * counts ride on tab titles alone, so a title from the share tags keeps its
 * brackets: "(500) Days of Summer" is the film.
 */
function cleanTitle({ title, site, tagged }) {
  const flat = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const t = (tagged ? title : title.replace(/^\(\d+\+?\)\s*/, "")).trim();
  const m = t.match(/^(.+\S)\s+[|/–—·•-]\s+(\S.*)$/);
  if (!m) return t;
  const tail = flat(m[2]);
  const name = flat(site);
  const label = flat(site.split(".")[0]);
  const same = (a, b) => a.length >= 1 && b.length >= 1 && (a === b || (a.length > 2 && b.length > 2 && (a.includes(b) || b.includes(a))));
  return same(tail, name) || same(tail, label) ? m[1].trim() : t;
}

function paintPage() {
  const el = $("title");
  if (document.activeElement !== el) el.textContent = cleanTitle(meta);
  $("site").textContent = meta.site;
  const icon = $("site-icon");
  const src = tab?.favIconUrl;
  icon.hidden = !src;
  icon.onerror = () => (icon.hidden = true);
  if (src) loaded.then(() => (icon.src = src));
}

function paintStage() {
  const stage = $("stage");
  const glow = (src) => {
    const old = $("glow").querySelector("img");
    if (old?.dataset.src === src) return;
    const img = pic(src, src === meta.image ? "" : "soft");
    img.dataset.src = src;
    old?.remove();
    $("glow").append(img);
  };
  const plain = () => {
    meta.image = ""; // never send a cover we couldn't render
    const src = meta.icon || tab?.favIconUrl;
    const letter = document.createElement("span");
    letter.className = "initial";
    letter.textContent = (meta.site[0] ?? "").toUpperCase();
    if (!src) return stage.replaceChildren(letter);
    const img = document.createElement("img");
    img.alt = "";
    img.className = "icon";
    img.onerror = () => stage.replaceChildren(letter);
    loaded.then(() => (img.src = src));
    stage.replaceChildren(img);
    glow(src);
  };
  if (!meta.image) return plain();

  const src = meta.image;
  const img = new Image();
  img.alt = "";
  img.onerror = plain;
  img.onload = () => {
    // YouTube answers a missing maxres with a 120px placeholder, not a 404
    if (img.naturalWidth <= 120 && meta.image.includes("/maxresdefault.")) {
      meta.image = meta.image.replace("/maxresdefault.", "/hqdefault.");
      return paintStage();
    }
    // wide art fills the stage (a YouTube thumbnail's 4:3 is letterboxed
    // 16:9); covers sit whole on a blur of themselves
    if (img.naturalWidth / img.naturalHeight >= 1.45 || meta.image.includes("ytimg.com/")) {
      img.className = "fill-img";
      stage.replaceChildren(img);
    } else {
      const behind = img.cloneNode();
      behind.className = "behind";
      img.className = "front";
      stage.replaceChildren(behind, img);
    }
    glow(meta.image);
  };
  loaded.then(() => (img.src = src));
}

const pageTitle = () => $("title").textContent.replace(/\s+/g, " ").trim() || cleanTitle(meta);
const page = () => ({ p_url: tab.url, p_title: pageTitle(), p_site: meta.site, p_image_url: meta.image || null });

/* ── favorite ─────────────────────────────────────────────────────────── */

function paintFav() {
  $("fav-bar").classList.toggle("on", fav.on);
  $("glow").classList.toggle("gold", fav.on);
  $("fav").setAttribute("aria-pressed", String(fav.on));
  $("fav-label").textContent = fav.on ? "Favorited" : "Favorite";
  $("fav").title = `${fav.on ? "Remove from favorites" : "Favorite"} (${/Mac/.test(navigator.platform) ? "⌘" : "Ctrl+"}↵)`;
  $("thought-toggle").hidden = !fav.on;
  $("thought-toggle").textContent = fav.thought ? "Your thought" : "Add a thought";
  if (!fav.on) $("thought-box").hidden = true;
}

function toggleFavorite() {
  if (!tab) return;
  const on = !fav.on;
  fav.on = on;
  favTouched = true;
  paintFav();
  writeCache();
  say(on ? "Added to your favorites." : "Removed from your favorites.");
  if (!on) return removeSoon("fav", unfavorite);
  ignite();
  chime();
  if (takeBack("fav")) return; // it never left

  lane("fav", async () => {
    await scraped;
    const out = await rpc("extension_save", { ...page(), p_description: fav.thought }, true);
    if (out?.status === "unauthorized") return signedOut();
    if (out?.status !== "added" && out?.status !== "duplicate") favFailed(false, out);
  });
}

function unfavorite() {
  lane("fav", async () => {
    const out = await rpc("extension_unfavorite", { p_url: tab.url }, true);
    if (out?.status === "unauthorized") return signedOut();
    if (out?.status !== "removed") favFailed(true, out);
  });
}

function favFailed(on, out) {
  fav.on = on;
  paintFav();
  writeCache();
  say(out?.message || "Couldn't reach Favorite. Try again.");
  shake($("fav-bar"));
}

/** Gold spreads out of the star and settles; eight rays, one per point. */
function ignite() {
  if (calm) return;
  const star = $("fav-star");
  const bar = $("fav-bar").getBoundingClientRect();
  const r = star.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;

  star.animate(
    [
      { transform: "scale(1) rotate(0deg)", filter: "brightness(1)" },
      { transform: "scale(1.55) rotate(60deg)", filter: "brightness(.16)", offset: 0.34 },
      { transform: "scale(1.1) rotate(84deg)", filter: "brightness(.16)", offset: 0.6 },
      { transform: "scale(1) rotate(90deg)", filter: "brightness(1)" },
    ],
    { duration: 640, easing: "cubic-bezier(.2,0,0,1)" }
  );
  // the label goes dark while the gold is behind it, then relaxes back
  $("fav-label").animate(
    [{ color: "#2a1a00" }, { color: "#2a1a00", offset: 0.45 }, { color: "#fbd38d" }],
    { duration: 760, easing: "ease-out" }
  );

  const at = `at ${x - bar.left}px 50%`;
  $("fav-fill").animate(
    [
      { clipPath: `circle(0px ${at})`, opacity: 1 },
      { clipPath: `circle(${bar.width}px ${at})`, opacity: 0.92, offset: 0.4 },
      { clipPath: `circle(${bar.width}px ${at})`, opacity: 0 },
    ],
    { duration: 780, easing: "cubic-bezier(.2,0,0,1)" }
  );

  for (let i = 0; i < 8; i++) {
    const ray = document.createElement("i");
    const long = i % 2 === 0;
    const len = long ? 13 : 8;
    ray.className = "ray";
    ray.style.cssText = `left:${x - 1}px;top:${y - len / 2}px;height:${len}px`;
    document.body.append(ray);
    const turn = `rotate(${i * 45}deg)`;
    ray
      .animate(
        [
          { transform: `${turn} translateY(-11px) scaleY(.2)`, opacity: 1 },
          { transform: `${turn} translateY(-${long ? 34 : 26}px) scaleY(1)`, opacity: 1, offset: 0.45 },
          { transform: `${turn} translateY(-${long ? 44 : 33}px) scaleY(.2)`, opacity: 0 },
        ],
        { duration: 520, easing: "cubic-bezier(.2,0,0,1)" }
      )
      .finished.finally(() => ray.remove());
  }
}

/* ── the thought ──────────────────────────────────────────────────────── */

let thoughtDirty = false;
let thoughtTimer = 0;

function saveThought() {
  clearTimeout(thoughtTimer);
  if (!thoughtDirty || !fav.on) return;
  thoughtDirty = false;
  fav.thought = $("thought").value.trim();
  const text = fav.thought;
  writeCache();
  lane("fav", async () => {
    const out = await rpc("extension_set_thought", { p_url: tab.url, p_thought: text }, true);
    if (out?.status === "unauthorized") return signedOut();
    if (out?.status === "saved") return say("Thought saved.");
    thoughtDirty = true;
    say(out?.message || "Couldn't save your thought.");
    shake($("thought-box"));
  });
  $("thought-toggle").textContent = text ? "Your thought" : "Add a thought";
}

/* ── lists ────────────────────────────────────────────────────────────── */

const items = (n) => `${n} ${n === 1 ? "item" : "items"}`;

function paintTile(l, now = false) {
  const tile = l.el.querySelector(".tile");
  const covers = (l.covers ?? []).slice(0, 3);
  // the page's own art is already loaded at full size: no second download
  const art = (c, cls, px) => {
    const img = pic(c === meta.image ? c : thumb(c, px), cls);
    if (now) img.classList.add("in", "now"); // landing: no fade, it's already here
    return img;
  };
  tile.classList.toggle("has", !!(l.cover_image_url || covers.length));
  if (l.cover_image_url) return tile.replaceChildren(art(l.cover_image_url, "art", 200));
  if (!covers.length) return (tile.innerHTML = LIST);
  const veil = document.createElement("i");
  veil.className = "veil";
  tile.replaceChildren(art(covers[0], "back"), veil, ...covers.map((c) => art(c, "fan")));
  tile.querySelectorAll(".fan").forEach((f, i, all) => (f.style.zIndex = all.length - i));
}

function paintRow(l) {
  const row = l.el.querySelector(".row");
  row.classList.toggle("on", !!l.has);
  row.setAttribute("aria-pressed", String(!!l.has));
  const sub = l.el.querySelector(".sub-line");
  sub.classList.remove("bad");
  sub.replaceChildren();
  const n = document.createElement("span");
  n.className = "count";
  n.textContent = items(l.count ?? 0);
  sub.append(n, l.is_public ? "" : " · Private");
}

function makeRow(l) {
  const li = document.createElement("li");
  const b = document.createElement("button");
  b.type = "button";
  b.className = "row";
  b.innerHTML = `<span class="tile"></span><span class="text"><span class="name"></span><span class="sub-line"></span></span><span class="tick">${PLUS}${CHECK}</span>`;
  b.querySelector(".name").textContent = l.title; // user text: never innerHTML
  b.addEventListener("click", () => toggle(l));
  li.append(b);
  l.el = li;
  paintTile(l);
  paintRow(l);
  return li;
}

/** The create row: shows under the matches while a new name is being typed. */
const createRow = (() => {
  const li = document.createElement("li");
  li.className = "row-wrap";
  li.hidden = true;
  li.innerHTML = `<button type="button" class="row create"><span class="tile">${PLUS}</span><span class="text"><span class="name"></span><span class="sub-line"></span></span></button><button type="button" class="private"></button>`;
  li.querySelector(".row").addEventListener("click", create);
  li.querySelector(".private").addEventListener("click", () => {
    makePublic = !makePublic;
    paintCreate();
    $("q").focus();
  });
  return li;
})();

function paintCreate() {
  const typed = query.trim();
  createRow.querySelector(".name").textContent = `Create “${typed}”`;
  createRow.querySelector(".sub-line").textContent = makePublic ? "Public list" : "Private list";
  const lock = createRow.querySelector(".private");
  lock.innerHTML = makePublic ? UNLOCK : LOCK;
  lock.setAttribute("aria-label", makePublic ? "Public: tap to make private" : "Private: tap to make public");
  lock.title = makePublic ? "Public: shows on your profile" : "Private: only you";
}

function paintLists() {
  // no lists yet: the app's private "Check later" starter, made on first tick
  if (!lists.length) lists = [{ id: null, title: "Check later", is_public: false, count: 0, has: false, covers: [] }];
  $("lists").replaceChildren(...lists.map((l) => l.el ?? makeRow(l)), createRow);
  filter();
}

const options = () => [...lists.filter((l) => !l.el.hidden), ...(createRow.hidden ? [] : [createRow])];

function paintCursor() {
  const all = options();
  for (const o of [...lists.map((l) => l.el), createRow]) o.querySelector(".row").classList.remove("cursor");
  const at = all[cursor];
  if (!at) return;
  const el = at === createRow ? createRow : at.el;
  el.querySelector(".row").classList.add("cursor");
  el.scrollIntoView({ block: "nearest" });
}

function filter() {
  const typed = query.trim().toLowerCase();
  for (const l of lists) l.el.hidden = !!typed && !l.title.toLowerCase().includes(typed);
  createRow.hidden = !typed || lists.some((l) => l.title.toLowerCase() === typed);
  if (!createRow.hidden) paintCreate();
  cursor = typed ? 0 : -1;
  paintCursor();
  moreBelow();
}

function moreBelow() {
  const ul = $("lists");
  ul.classList.toggle("more", ul.scrollTop + ul.clientHeight < ul.scrollHeight - 4);
}

function roll(l, delta) {
  const n = l.el.querySelector(".count");
  if (calm || !n) return paintRow(l);
  n.animate([{ transform: "none", opacity: 1 }, { transform: `translateY(${delta > 0 ? -7 : 7}px)`, opacity: 0 }], {
    duration: 110,
    easing: "ease-in",
  }).finished.then(() => {
    paintRow(l);
    l.el
      .querySelector(".count")
      .animate([{ transform: `translateY(${delta > 0 ? 7 : -7}px)`, opacity: 0 }, { transform: "none", opacity: 1 }], {
        duration: 170,
        easing: "cubic-bezier(.2,0,0,1)",
      });
  });
}

/** The page's art lifts off the stage and lands in the list's cover. */
function fly(l) {
  const tile = l.el.querySelector(".tile");
  const stage = $("stage");
  const land = () => {
    if (!l.has) return; // unticked, or it failed, while it was in the air
    if (meta.image) {
      l.covers = [meta.image, ...(l.covers ?? []).filter((c) => c !== meta.image)].slice(0, 3);
      paintTile(l, true);
    }
    if (!calm) {
      tile.animate([{ transform: "scale(1)" }, { transform: "scale(1.09)", offset: 0.4 }, { transform: "scale(1)" }], {
        duration: 280,
        easing: "cubic-bezier(.2,0,0,1)",
      });
    }
  };
  if (calm) return land();

  const a = stage.getBoundingClientRect();
  const b = tile.getBoundingClientRect();
  const ghost = stage.cloneNode(true);
  ghost.removeAttribute("id");
  ghost.classList.add("ghost");
  ghost.style.cssText = `left:${a.left}px;top:${a.top}px`;
  document.body.append(ghost);

  const dx = b.left - a.left;
  const dy = b.top - a.top;
  const s = b.width / a.width;
  ghost.animate(
    [
      { transform: "translate(0,0) scale(1)", opacity: 1 },
      { transform: `translate(${dx * 0.42}px,${dy * 0.3 - 6}px) scale(${(1 + s) / 2 + 0.06})`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx}px,${dy}px) scale(${s})`, opacity: 0.85 },
    ],
    { duration: 400, easing: "cubic-bezier(.45,.05,.2,1)" }
  ).finished.finally(() => {
    ghost.remove();
    land();
  });
}

function rowError(l, message) {
  const sub = l.el.querySelector(".sub-line");
  sub.textContent = message;
  sub.classList.add("bad");
  shake(l.el);
  setTimeout(() => paintRow(l), 2600);
}

function toggle(l) {
  if (!tab) return;
  const adding = !l.has;
  touched.add(l);
  l.has = adding;
  l.count = Math.max(0, (l.count ?? 0) + (adding ? 1 : -1));
  const row = l.el.querySelector(".row");
  row.style.setProperty("--land", adding && !calm ? "260ms" : "0ms");
  row.classList.toggle("on", adding);
  row.setAttribute("aria-pressed", String(adding));
  if (adding) {
    chime();
    fly(l);
    setTimeout(() => l.has && roll(l, 1), calm ? 0 : 300);
  } else {
    roll(l, -1);
    dropCover(l);
  }
  say(adding ? `Saved to ${l.title}.` : `Removed from ${l.title}.`);
  writeCache();
  if (!adding) return removeSoon(l, () => removeFrom(l));
  if (takeBack(l)) return; // it never left

  lane(l, async () => {
    await scraped;
    if (!l.id) {
      const made = await rpc("extension_create_list", { p_title: l.title, p_public: l.is_public }, true);
      if (made?.status === "unauthorized") return signedOut();
      if (made?.status !== "created") return undo(l, true, made?.message || "Couldn't make the list.");
      l.id = made.id;
    }
    const out = await rpc("extension_save_to_list", { p_list_id: l.id, ...page() }, true);
    if (out?.status === "unauthorized") return signedOut();
    if (out?.status !== "added" && out?.status !== "duplicate") return undo(l, true, out?.message || "Couldn't save. Try again.");
    if (out.status === "duplicate") {
      l.count = Math.max(0, l.count - 1);
      paintRow(l);
    }
    writeCache();
  });
}

function removeFrom(l) {
  lane(l, async () => {
    const out = await rpc("extension_remove_from_list", { p_list_id: l.id, p_url: tab.url }, true);
    if (out?.status === "unauthorized") return signedOut();
    if (out?.status !== "removed") undo(l, false, out?.message || "Couldn't remove it. Try again.");
  });
}

function dropCover(l) {
  if (!meta.image || l.covers?.[0] !== meta.image) return;
  l.covers = l.covers.slice(1);
  paintTile(l);
}

function undo(l, adding, message) {
  l.has = !adding;
  l.count = Math.max(0, (l.count ?? 0) + (adding ? -1 : 1));
  if (adding) dropCover(l);
  paintRow(l);
  rowError(l, message);
  say(message);
  writeCache();
}

function create() {
  const title = query.trim();
  if (!title) return;
  const l = { id: null, title, is_public: makePublic, count: 0, has: false, covers: [] };
  lists = [l, ...lists.filter((x) => x.id || x.count || x.has)]; // the untouched starter steps aside
  $("q").value = "";
  query = "";
  makePublic = true;
  paintLists();
  l.el.classList.add("rise");
  $("lists").scrollTop = 0;
  toggle(l);
}

/* ── small things ─────────────────────────────────────────────────────── */

const say = (text) => ($("status").textContent = text);

function shake(el) {
  if (calm) return;
  el.animate(
    [0, -4, 4, -2, 2, 0].map((x) => ({ transform: `translateX(${x}px)` })),
    { duration: 280, easing: "ease-out" }
  );
}

// the app's confirm cue (lib/sfx.ts): a warm rising pair, doubled ±5 cents
const soundsOn = () => localStorage.getItem("fav:sounds") !== "off";
let audio = null;

function note(at, freq, dur, peak, detune) {
  const osc = audio.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, at);
  if (detune) osc.detune.setValueAtTime(detune, at);
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(peak, at + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain);
  gain.connect(audio.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

function chime() {
  if (!soundsOn()) return;
  try {
    audio ??= new AudioContext();
  } catch {
    return;
  }
  if (audio.state === "suspended") void audio.resume();
  const t = audio.currentTime;
  note(t, 587.33, 0.18, 0.024, -5);
  note(t, 587.33, 0.18, 0.024, 5);
  note(t + 0.095, 880, 0.3, 0.022, -5);
  note(t + 0.095, 880, 0.3, 0.022, 5);
  note(t + 0.095, 1760, 0.3, 0.007);
}

function paintSound() {
  const b = $("sound");
  const on = soundsOn();
  b.innerHTML = on ? SOUND_ON : SOUND_OFF;
  b.setAttribute("aria-label", on ? "Turn sounds off" : "Turn sounds on");
  b.title = on ? "Sounds on" : "Sounds off";
}

function paintMe() {
  const a = $("me");
  if (!me) return;
  a.hidden = false;
  a.href = `${FAV_CONFIG.APP_URL}/${me.username}`;
  a.title = me.name || me.username;
  a.setAttribute("aria-label", "Open your page");
  $("sound").hidden = false;
  paintSound();
  const src = me.avatar_url ? (resized(me.avatar_url, 64, true) ?? me.avatar_url) : "";
  if (a.dataset.src === src) return;
  a.dataset.src = src;
  a.textContent = (me.name || me.username || "").slice(0, 1).toUpperCase();
  if (!src) return;
  const img = document.createElement("img");
  img.alt = "";
  img.onload = () => a.replaceChildren(img);
  loaded.then(() => (img.src = src));
}

/* ── boot ─────────────────────────────────────────────────────────────── */

const touched = new Set(); // changed here before the fresh state arrived
let favTouched = false;

function show(id) {
  for (const s of document.querySelectorAll("section, main")) s.hidden = s.id !== id;
  if (id !== "form") document.body.style.height = "";
}

/** One height, set before the first paint, so the window never resizes. */
let tallest = 600;

function fit() {
  const room = Math.max(lists.length, 3);
  const top = $("lists").getBoundingClientRect().top;
  document.body.style.height = `${Math.min(tallest, Math.round(top) + room * 56 + 14)}px`;
  moreBelow();
}

async function signedOut() {
  localStorage.removeItem(CACHE);
  await chrome.storage.local.remove("favToken");
  $("me").hidden = true;
  $("sound").hidden = true;
  show("connect");
}

/** First open, before there's a cache: the lists' shape while they arrive. */
function paintSkeleton() {
  const bones = Array.from({ length: 3 }, () => {
    const li = document.createElement("li");
    li.className = "bones";
    li.innerHTML = '<span class="tile"></span><span class="text"><i></i><i></i></span>';
    return li;
  });
  $("lists").replaceChildren(...bones);
}

function paintOffline() {
  const li = document.createElement("li");
  li.className = "offline";
  li.innerHTML = '<p>Couldn\'t load your lists.</p><button type="button">Try again</button>';
  li.querySelector("button").addEventListener("click", () => {
    paintSkeleton();
    rpc("extension_state", { p_url: tab.url }).then(applyState);
  });
  $("lists").replaceChildren(li);
}

function applyState(out) {
  if (out?.status === "unauthorized") return signedOut();
  if (!out?.lists) {
    say("Couldn't reach Favorite.");
    if (!lists.length) paintOffline();
    return;
  }
  me = out.me ?? me;
  paintMe();
  if (!favTouched && !thoughtDirty) {
    fav = { on: !!out.favorited, thought: out.thought ?? "" };
    $("thought").value = fav.thought;
    paintFav();
  }
  // rows stay where they painted, so nothing jumps under the pointer; a list
  // that's new since the cache joins on top
  const fresh = new Map(out.lists.map((l) => [l.id, l]));
  const kept = lists.filter((l) => fresh.has(l.id) || touched.has(l));
  const added = out.lists.filter((l) => !lists.some((x) => x.id === l.id));
  for (const l of kept) {
    const f = fresh.get(l.id);
    if (!f || touched.has(l)) continue;
    const covers = String(l.covers) !== String(f.covers) || l.cover_image_url !== f.cover_image_url;
    Object.assign(l, f);
    if (l.el) {
      if (covers) paintTile(l);
      paintRow(l);
    }
  }
  for (const gone of lists.filter((l) => !kept.includes(l))) gone.el?.remove();
  lists = [...added, ...kept];
  paintLists();
  fit();
  writeCache();
}

function applyScrape(found) {
  if (found) meta = { ...meta, ...Object.fromEntries(Object.entries(found).filter(([, v]) => v)) };
  paintPage();
  paintStage();
}

async function boot() {
  // what we know paints first, before anything async has answered
  const cached = readCache();
  if (cached?.lists) {
    me = cached.me;
    lists = cached.lists;
    paintMe();
    paintLists();
    show("form");
    fit();
    $("q").focus();
  }

  const [stored, active] = await Promise.all([
    chrome.storage.local.get("favToken"),
    chrome.tabs.query({ active: true, currentWindow: true }),
  ]);
  token = stored.favToken ?? "";
  if (!token) return signedOut();
  // reconnected as someone else: what we remember is their lists, not yours
  if (cached && cached.who !== token.slice(0, 8)) {
    localStorage.removeItem(CACHE);
    return location.reload();
  }

  const t = active[0];
  if (!t?.url || !/^https?:/i.test(t.url)) return show("nopage");
  tab = t;
  meta.title = tab.title || tab.url;
  meta.site = new URL(tab.url).hostname.replace(/^www\./, "");

  const state = rpc("extension_state", { p_url: tab.url });
  // og tags beat the tab defaults, but a page we can't script (e.g. a PDF
  // viewer) still saves fine with them; saves wait for this, briefly
  const grab = chrome.scripting
    .executeScript({ target: { tabId: tab.id }, func: grabMeta })
    .then(([r]) => r?.result)
    .catch(() => null)
    .then(applyScrape);
  scraped = Promise.race([grab, new Promise((r) => setTimeout(r, 900))]);

  paintPage();
  if (cached?.page?.url === tab.url) {
    fav = { on: cached.page.fav, thought: cached.page.thought ?? "" };
    $("thought").value = fav.thought;
    paintFav();
    for (const l of lists) {
      l.has = cached.page.in.includes(l.id);
      if (l.el) paintRow(l);
    }
  }
  if (!cached?.lists) {
    paintSkeleton();
    show("form");
    fit();
    $("q").focus();
  }
  applyState(await state);
}

/* ── wiring ───────────────────────────────────────────────────────────── */

$("home").href = FAV_CONFIG.APP_URL;
$("connect-btn").addEventListener("click", () => {
  chrome.tabs.create({ url: `${FAV_CONFIG.APP_URL}/extension?connect=1` });
  window.close();
});
$("fav").addEventListener("click", toggleFavorite);
$("sound").addEventListener("click", () => {
  const on = !soundsOn();
  localStorage.setItem("fav:sounds", on ? "on" : "off");
  paintSound();
  if (on) chime();
});

$("thought-toggle").addEventListener("click", () => {
  const box = $("thought-box");
  box.hidden = !box.hidden;
  if (!box.hidden) $("thought").focus();
  else saveThought();
  moreBelow();
});
$("thought").addEventListener("input", () => {
  thoughtDirty = true;
  clearTimeout(thoughtTimer);
  thoughtTimer = setTimeout(saveThought, 700);
});
$("thought").addEventListener("blur", saveThought);
$("thought").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    saveThought();
    $("thought-box").hidden = true;
    $("q").focus();
  }
});
// Chrome caps a popup to the room on screen; the lists scroll inside what it gives
addEventListener("resize", () => {
  if (innerHeight < 320 || innerHeight >= document.body.offsetHeight) return;
  tallest = innerHeight;
  fit();
});

// the popup closes the moment you click away: send what's still waiting
const flush = () => {
  saveThought();
  for (const { run } of [...removals.values()]) run();
};
addEventListener("pagehide", flush);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) flush();
});

$("title").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    $("title").blur();
  }
});
$("title").addEventListener("blur", () => {
  $("title").scrollTop = 0;
  if (!$("title").textContent.trim()) paintPage();
});

$("q").addEventListener("input", (e) => {
  query = e.target.value;
  filter();
});
$("q").addEventListener("keydown", (e) => {
  const all = options();
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (!all.length) return;
    const step = e.key === "ArrowDown" ? 1 : -1;
    cursor = cursor < 0 ? (step > 0 ? 0 : all.length - 1) : (cursor + step + all.length) % all.length;
    paintCursor();
  } else if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
    e.preventDefault();
    const at = all[cursor];
    if (at === createRow) create();
    else if (at) {
      // the whole list comes back first, so the page lands where the row ends up
      if (query) {
        $("q").value = "";
        query = "";
        filter();
        at.el.scrollIntoView({ block: "nearest" });
      }
      toggle(at);
    }
  } else if (e.key === "Escape" && query) {
    e.preventDefault();
    $("q").value = "";
    query = "";
    filter();
  }
});
$("lists").addEventListener("scroll", moreBelow, { passive: true });
// a click here shouldn't pull focus out of the find field: keep typing
for (const zone of [$("lists"), $("fav-bar")]) zone.addEventListener("mousedown", (e) => e.preventDefault());

addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    toggleFavorite();
  }
});

boot();

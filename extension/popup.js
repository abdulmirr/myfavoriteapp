// The popup: read the active tab, pull its share-card metadata, then one click
// to favorite it or to save it into any of your lists. Auth is a personal
// token minted at myfavoriteapp.com/extension and stored in
// chrome.storage.local by content.js; every write is a PostgREST RPC
// (extension_save, extension_lists, extension_save_to_list, …) that validates
// the token server-side.

const $ = (id) => document.getElementById(id);

const show = (id) => {
  for (const s of document.querySelectorAll("section")) s.hidden = s.id !== id;
};

const setStatus = (text, kind = "") => {
  const el = $("status");
  el.textContent = text;
  el.className = kind;
};

const CHECK =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
const LOCK =
  '<svg class="lock" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-label="Private"><rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V7.5a4 4 0 0 1 8 0V11"/></svg>';

async function rpc(fn, body) {
  try {
    const r = await fetch(`${FAV_CONFIG.SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: FAV_CONFIG.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${FAV_CONFIG.SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ p_token: token, ...body }),
    });
    return await r.json();
  } catch {
    return null;
  }
}

/** Runs inside the page: og/meta tags, resolved against the page URL. */
function grabMeta() {
  const q = (sel) =>
    document.querySelector(sel)?.getAttribute("content")?.trim() || "";
  const abs = (u) => {
    try {
      return new URL(u, location.href).href;
    } catch {
      return "";
    }
  };
  const img =
    q('meta[property="og:image"]') ||
    q('meta[name="og:image"]') ||
    q('meta[name="twitter:image"]') ||
    q('meta[property="twitter:image"]');
  return {
    title: q('meta[property="og:title"]') || document.title,
    site: q('meta[property="og:site_name"]') || location.hostname.replace(/^www\./, ""),
    image: img ? abs(img) : "",
  };
}

let token = "";
let tab = null;
let meta = { title: "", site: "", image: "" };
let lists = [];
let favorited = false;
const busy = new Set();

async function signedOut() {
  await chrome.storage.local.remove("favToken");
  show("connect");
}

async function init() {
  ({ favToken: token = "" } = await chrome.storage.local.get("favToken"));
  if (!token) return show("connect");

  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !/^https?:/i.test(tab.url)) return show("nopage");

  meta.title = tab.title || tab.url;
  meta.site = new URL(tab.url).hostname.replace(/^www\./, "");

  // og tags beat the tab defaults, but a page we can't script (e.g. a PDF
  // viewer) still saves fine with them; the lists load alongside
  const [scraped, mine] = await Promise.all([
    chrome.scripting
      .executeScript({ target: { tabId: tab.id }, func: grabMeta })
      .then(([r]) => r?.result)
      .catch(() => null),
    rpc("extension_lists", { p_url: tab.url }),
  ]);
  if (scraped) meta = { ...meta, ...Object.fromEntries(Object.entries(scraped).filter(([, v]) => v)) };
  if (mine?.status === "unauthorized") return signedOut();
  lists = mine?.lists ?? [];
  favorited = !!mine?.favorited;

  $("title").value = meta.title;
  $("site").textContent = meta.site;
  const thumb = $("thumb");
  if (meta.image) {
    const img = document.createElement("img");
    img.src = meta.image;
    img.onerror = () => fallbackThumb(thumb);
    thumb.replaceChildren(img);
  } else {
    fallbackThumb(thumb);
  }

  renderFav();
  renderLists();
  show("form");
  if (!mine) setStatus("Couldn't load your lists — try reopening.", "error");
}

function fallbackThumb(thumb) {
  meta.image = ""; // never send a cover we couldn't render
  if (tab?.favIconUrl) {
    const img = document.createElement("img");
    img.className = "favicon";
    img.src = tab.favIconUrl;
    img.onerror = () => thumb.replaceChildren();
    thumb.replaceChildren(img);
  } else {
    thumb.replaceChildren();
  }
}

const pageTitle = () => $("title").value.trim() || meta.title;
const page = () => ({ p_url: tab.url, p_title: pageTitle(), p_site: meta.site, p_image_url: meta.image || null });

/* ── favorite ─────────────────────────────────────────────────────────── */

function renderFav() {
  const btn = $("fav");
  btn.disabled = favorited;
  btn.classList.toggle("done", favorited);
  $("fav-label").textContent = favorited ? "In your favorites" : "Favorite";
  $("thought-toggle").hidden = favorited || !$("thought").hidden;
  if (favorited) $("thought").hidden = true;
}

async function favorite() {
  if (favorited || busy.has("fav") || !pageTitle()) return;
  busy.add("fav");
  $("fav").disabled = true;
  $("fav-label").textContent = "Saving…";
  setStatus("");
  const out = await rpc("extension_save", {
    p_url: tab.url,
    p_title: pageTitle(),
    p_description: $("thought").value.trim(),
    p_site: meta.site,
    p_image_url: meta.image || null,
  });
  busy.delete("fav");
  if (out?.status === "added" || out?.status === "duplicate") {
    favorited = true;
    setStatus(out.status === "added" ? "Added to your favorites." : "Already in your favorites.", "ok");
  } else if (out?.status === "unauthorized") {
    return signedOut();
  } else {
    setStatus(out?.message || "Couldn't favorite — try again.", "error");
  }
  renderFav();
}

/* ── lists ────────────────────────────────────────────────────────────── */

function renderLists() {
  const ul = $("lists");
  // no lists yet: the app's private "Check later" starter, made on first save
  const rows = lists.length
    ? lists
    : [{ id: null, title: "Check later", is_public: false, count: 0, has: false, starter: true }];
  ul.replaceChildren(
    ...rows.map((l) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      b.className = `row${l.has ? " on" : ""}`;
      b.setAttribute("aria-pressed", String(!!l.has));
      b.innerHTML = `<span class="box">${CHECK}</span><span class="name"></span>${l.is_public ? "" : LOCK}<span class="n"></span>`;
      b.querySelector(".name").textContent = l.title; // user text: never innerHTML
      b.querySelector(".n").textContent = String(l.count ?? 0);
      b.addEventListener("click", () => toggle(l));
      li.append(b);
      return li;
    })
  );
}

async function toggle(l) {
  const key = l.id ?? "starter";
  if (busy.has(key)) return;
  busy.add(key);
  setStatus("");
  try {
    if (l.starter) {
      const made = await rpc("extension_create_list", { p_title: "Check later", p_public: false });
      if (made?.status === "unauthorized") return signedOut();
      if (made?.status !== "created") return setStatus(made?.message || "Couldn't make the list.", "error");
      l = { id: made.id, title: made.title, is_public: made.is_public, count: 0, has: false };
      lists = [l];
    }
    const adding = !l.has;
    // optimistic, rolled back on failure
    l.has = adding;
    l.count = Math.max(0, (l.count ?? 0) + (adding ? 1 : -1));
    renderLists();
    const out = adding
      ? await rpc("extension_save_to_list", { p_list_id: l.id, ...page() })
      : await rpc("extension_remove_from_list", { p_list_id: l.id, p_url: tab.url });
    if (out?.status === "unauthorized") return signedOut();
    const ok = adding ? out?.status === "added" || out?.status === "duplicate" : out?.status === "removed";
    if (!ok) {
      l.has = !adding;
      l.count = Math.max(0, l.count + (adding ? -1 : 1));
      renderLists();
      return setStatus(out?.message || "Couldn't save — try again.", "error");
    }
    if (adding && out.status === "duplicate") l.count = Math.max(0, l.count - 1);
    renderLists();
    setStatus(adding ? `Saved to ${l.title}.` : `Removed from ${l.title}.`, "ok");
  } finally {
    busy.delete(key);
  }
}

async function createList(e) {
  e.preventDefault();
  const input = $("new-title");
  const title = input.value.trim();
  if (!title || busy.has("new")) return;
  busy.add("new");
  setStatus("");
  const made = await rpc("extension_create_list", { p_title: title, p_public: true });
  busy.delete("new");
  if (made?.status === "unauthorized") return signedOut();
  if (made?.status !== "created") return setStatus(made?.message || "Couldn't make the list.", "error");
  input.value = "";
  const l = { id: made.id, title: made.title, is_public: made.is_public, count: 0, has: false };
  lists = [l, ...lists];
  renderLists();
  await toggle(l); // a list made here starts with this page in it
}

/* ── wiring ───────────────────────────────────────────────────────────── */

$("connect-btn").addEventListener("click", () => {
  chrome.tabs.create({ url: `${FAV_CONFIG.APP_URL}/extension?connect=1` });
  window.close();
});
$("fav").addEventListener("click", favorite);
$("thought-toggle").addEventListener("click", () => {
  $("thought").hidden = false;
  $("thought-toggle").hidden = true;
  $("thought").focus();
});
$("thought").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) favorite();
});
$("new").addEventListener("submit", createList);

init();

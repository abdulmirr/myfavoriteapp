// The popup: read the active tab, pull its share-card metadata, one click to
// save. Auth is a personal token minted at myfavoriteapp.com/extension and
// stored in chrome.storage.local by content.js; the save itself is a
// PostgREST RPC (extension_save) that validates the token server-side.

const $ = (id) => document.getElementById(id);

const show = (id) => {
  for (const s of document.querySelectorAll("section")) s.hidden = s.id !== id;
};

const setStatus = (text, kind = "") => {
  const el = $("status");
  el.textContent = text;
  el.className = kind;
};

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

let tab = null;
let meta = { title: "", site: "", image: "" };

async function init() {
  const { favToken } = await chrome.storage.local.get("favToken");
  if (!favToken) return show("connect");

  [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url || !/^https?:/i.test(tab.url)) return show("nopage");

  meta.title = tab.title || tab.url;
  meta.site = new URL(tab.url).hostname.replace(/^www\./, "");

  // og tags beat the tab defaults, but a page we can't script (e.g. a PDF
  // viewer) still saves fine with them
  try {
    const [r] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: grabMeta,
    });
    if (r?.result) meta = { ...meta, ...Object.fromEntries(Object.entries(r.result).filter(([, v]) => v)) };
  } catch {}

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

  show("form");
  $("thoughts").focus();
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

async function save() {
  const title = $("title").value.trim();
  if (!title || !tab) return;
  const btn = $("save");
  btn.disabled = true;
  $("save-label").textContent = "Saving…";
  setStatus("");

  const { favToken } = await chrome.storage.local.get("favToken");
  let out = null;
  try {
    const r = await fetch(`${FAV_CONFIG.SUPABASE_URL}/rest/v1/rpc/extension_save`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: FAV_CONFIG.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${FAV_CONFIG.SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        p_token: favToken || "",
        p_url: tab.url,
        p_title: title,
        p_description: $("thoughts").value.trim(),
        p_site: meta.site,
        p_image_url: meta.image || null,
      }),
    });
    out = await r.json();
  } catch {
    out = null;
  }

  if (out?.status === "added") {
    $("save-label").textContent = "Favorited";
    setStatus("Added to your library.", "ok");
    setTimeout(() => window.close(), 900);
    return;
  }

  btn.disabled = false;
  $("save-label").textContent = "Favorite";
  if (out?.status === "duplicate") {
    setStatus("Already in your library.", "ok");
  } else if (out?.status === "unauthorized") {
    await chrome.storage.local.remove("favToken");
    show("connect");
  } else {
    setStatus(out?.message || "Save failed — try again.", "error");
  }
}

$("connect-btn").addEventListener("click", () => {
  chrome.tabs.create({ url: `${FAV_CONFIG.APP_URL}/extension?connect=1` });
  window.close();
});

$("save").addEventListener("click", save);
$("title").addEventListener("keydown", (e) => {
  if (e.key === "Enter") save();
});
$("thoughts").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) save();
});

init();

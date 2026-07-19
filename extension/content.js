// Connect bridge — runs only on myfavoriteapp.com/extension. The page mints a
// personal save token and posts it here; we store it and ack so the page can
// flip to "Connected". Both sides announce themselves so load order never
// matters (see src/app/extension/page.tsx for the other half).
window.addEventListener("message", (e) => {
  if (e.source !== window || e.origin !== location.origin) return;
  const d = e.data;
  if (
    d &&
    d.type === "favorites-ext-token" &&
    typeof d.token === "string" &&
    /^[0-9a-f]{64}$/.test(d.token)
  ) {
    chrome.storage.local.set({ favToken: d.token }, () => {
      window.postMessage({ type: "favorites-ext-connected" }, location.origin);
    });
  }
});

window.postMessage({ type: "favorites-ext-ready" }, location.origin);

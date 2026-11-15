(() => {
  const eventName = "harmony:refresh";
  const channelName = "harmony-repair-site-sync";
  const localEvent = (source) => window.dispatchEvent(new CustomEvent(eventName, { detail: { source, at: Date.now() } }));
  let channel = null;

  try {
    channel = new BroadcastChannel(channelName);
    channel.addEventListener("message", () => localEvent("another-tab"));
  } catch { /* Periodic synchronization still works without BroadcastChannel. */ }

  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const method = String(init.method || input?.method || "GET").toUpperCase();
    const urlValue = typeof input === "string" ? input : input?.url;
    const response = await originalFetch(input, init);
    if (response.ok && ["POST", "PUT", "PATCH", "DELETE"].includes(method) && urlValue) {
      try {
        const url = new URL(urlValue, location.href);
        if (url.origin === location.origin && url.pathname.startsWith("/api/management/")) {
          localEvent("local-change");
          channel?.postMessage({ at: Date.now() });
        }
      } catch { /* Ignore malformed request URLs. */ }
    }
    return response;
  };

  window.setInterval(() => {
    if (document.visibilityState === "visible") localEvent("periodic-sync");
  }, 15000);

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") localEvent("tab-visible");
  });
})();

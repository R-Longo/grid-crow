// Registers the service worker in production builds only,
// so dev-server reloads are never served from a stale cache.
export function registerServiceWorker() {
  if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("GridCrow: service worker registration failed", err);
    });
  });
}

/**
 * AutomateAscension Service Worker
 *
 * Strategy:
 *   - HTML / navigation: NETWORK-FIRST (so deploys always reach the user;
 *     prevents stale UI like the $12k placeholder flashing on launch)
 *   - Hashed JS / CSS bundles: cache-first (immutable by Vite hash)
 *   - Other static assets: stale-while-revalidate
 *   - /api/* : never cached
 */

const CACHE_VERSION = "ascension-v3";
const SHELL_ASSETS = [
  "/offline.html",
  "/favicon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/manifest.json",
];

// Install — cache the app shell (without index.html — we always fetch fresh)
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

// Allow the page to ask us to take over immediately
self.addEventListener("message", (event) => {
  if (event?.data?.type === "SKIP_WAITING") self.skipWaiting();
});

// Activate — clean old caches AND tell open tabs to claim
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k))
      );
      await self.clients.claim();
      // Notify clients so the user can be hard-refreshed if needed.
      const clients = await self.clients.matchAll({ type: "window" });
      clients.forEach((c) => c.postMessage({ type: "SW_UPDATED", version: CACHE_VERSION }));
    })()
  );
});

// Fetch
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.pathname.startsWith("/api/")) return; // pass through, never cache

  const isNavigation =
    request.mode === "navigate" ||
    (request.destination === "document") ||
    url.pathname === "/" ||
    url.pathname.endsWith(".html");

  if (isNavigation) {
    // Network-first for the HTML shell.
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Don't cache the shell — always fetch fresh on next launch.
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          return cached || caches.match("/offline.html");
        })
    );
    return;
  }

  // Hashed bundles + assets: stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((response) => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_VERSION).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || fetchPromise;
    })
  );
});

/**
 * AutomateAscension Service Worker
 *
 * Strategy: Network-first for API calls, cache-first for static assets.
 * Provides offline shell so the app loads even without connectivity.
 */

const CACHE_NAME = "ascension-v1";
const SHELL_ASSETS = [
  "/",
  "/index.html",
  "/favicon.svg",
  "/icon-192.png",
  "/icon-512.png",
  "/manifest.json",
];

// Install — cache the app shell
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

// Activate — clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch — network-first for API, cache-first for assets
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== "GET") return;

  // API calls — network only (don't cache stale trading data)
  if (url.pathname.startsWith("/api/")) return;

  // Static assets — stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((response) => {
          // Cache successful responses
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => {
          // If network fails and we have a cached response, use it
          // For navigation requests, return the shell
          if (request.mode === "navigate") {
            return caches.match("/index.html");
          }
          return cached;
        });

      // Return cached immediately if available, update in background
      return cached || fetchPromise;
    })
  );
});

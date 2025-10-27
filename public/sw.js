const CACHE_NAME = "buddy-chat-v4";
const ASSETS = ["/", "/index.html", "/default-avatar.png", "/idle.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  // Não usar cache, sempre buscar do servidor
  event.respondWith(fetch(event.request));
});

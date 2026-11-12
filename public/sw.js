// Network-first service worker: app shell works offline so riders can capture without signal.
const C = 'ar-v1';
const SHELL = ['/', '/app.js', '/style.css', '/lib/merkle.js', '/manifest.webmanifest', '/icon.svg'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(C).then((c) => c.addAll(SHELL))));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.pathname.startsWith('/api/') || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => { const cp = r.clone(); caches.open(C).then((c) => c.put(e.request, cp)); return r; })
    .catch(() => caches.match(e.request)));
});

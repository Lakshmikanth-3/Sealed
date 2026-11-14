// Network-first service worker: app shell works offline so riders can capture without signal.
const C = 'ar-live-v7';
const SHELL = ['/', '/app.js', '/assets/wallet.js', '/lib/nearRpc.js', '/lib/reconcile.js', '/style.css', '/lib/merkle.js', '/lib/schema.js', '/lib/backup.js', '/lib/compare.js', '/manifest.webmanifest', '/icon.svg',
  '/fonts/fonts.css', '/fonts/bricolage-0.ttf', '/fonts/bricolage-1.ttf', '/fonts/bricolage-2.ttf', '/fonts/bricolage-3.ttf'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(C).then((c) => c.addAll(SHELL))));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k.startsWith('ar-') && k !== C).map((k) => caches.delete(k))))));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.pathname.startsWith('/api/') || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => { const cp = r.clone(); caches.open(C).then((c) => c.put(e.request, cp)); return r; })
    .catch(() => caches.match(e.request)));
});

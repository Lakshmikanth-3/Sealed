// Network-first service worker: the app shell works offline; seal data and API calls never come from cache.
const C = 'sp-v11';
const SHELL = ['/', '/app', '/verify', '/landing.js', '/hero-anim.js', '/story.js', '/chat-anim.js', '/chat-ui.js', '/chat-store.js', '/app.js', '/open.js', '/holder.js', '/verify.js', '/common.js', '/proof.js', '/exam-ui.js', '/message-ui.js', '/plans-ui.js', '/lib/exam.js', '/assets/sealed.js', '/style.css',
  '/manifest.webmanifest', '/icon.svg'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(C).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
// Remove every older cache, including caches left by the previous app on this origin.
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== C).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.pathname.startsWith('/api/') || u.origin !== location.origin) return;
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const cp = r.clone(); caches.open(C).then((c) => c.put(e.request, cp)); } return r; })
    .catch(() => caches.match(e.request)));
});

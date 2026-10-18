const CACHE = 'trampolin-trainer-v12';
const ASSETS = ['./', './index.html', './style.css', './app.mjs', './core.mjs', './jump-time.mjs', './catalogue-view.mjs', './storage.mjs', './icon.svg', './manifest.webmanifest', './data/catalogue.json'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => Promise.all(ASSETS.map(async path => {
    const response = await fetch(path, { cache: 'reload' });
    if (response.ok && new URL(response.url).origin === location.origin && !response.url.includes('signin')) await cache.put(path, response);
  }))));
});
self.addEventListener('activate', event => event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('trampolin-trainer-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('message', event => { if (event.data === 'ACTIVATE') self.skipWaiting(); });
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== location.origin) return;
  const url = new URL(event.request.url);
  // Never cache platform authentication, personal data endpoints or arbitrary documents.
  if (!ASSETS.some(path => new URL(path, self.registration.scope).pathname === url.pathname)) return;
  event.respondWith(fetch(event.request).then(response => {
    if (response.ok && new URL(response.url).origin === location.origin && !response.url.includes('signin')) { const copy = response.clone(); event.waitUntil(caches.open(CACHE).then(cache => cache.put(event.request, copy))); }
    return response;
  }).catch(() => caches.match(event.request)));
});

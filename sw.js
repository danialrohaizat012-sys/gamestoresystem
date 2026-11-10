/* Arcadia POS service worker — offline app shell (data lives in localStorage / Supabase) */
const CACHE = 'arcadia-pos-v2';
const SHELL = ['./', './index.html', './css/app.css', './manifest.webmanifest', './assets/icon.svg',
  './js/core/config.js', './js/ui/icons.js', './js/ui/brand.js', './js/core/utils.js', './js/core/db.js', './js/core/services.js', './js/core/seed.js',
  './js/ui/ui.js', './js/ui/charts.js', './js/ui/documents.js', './js/main.js',
  ...['dashboard', 'pos', 'buy-trade', 'repairs', 'after-sales', 'inventory', 'purchases', 'consignment', 'stock-take', 'transactions', 'customers', 'reports', 'shift', 'settings'].map((p) => `./js/pages/${p}.js`)];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // network-first so updates ship immediately, cache fallback when offline
  e.respondWith(fetch(e.request).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; }).catch(() => caches.match(e.request)));
});

const CACHE = 'idc-v2';
const STATIC = [
  '/', '/index.html', '/style.css', '/app.js', '/db.js', '/seed.js',
  '/manifest.json', '/icons/icon-192.png', '/icons/icon-512.png',
  '/pages/dashboard.js', '/pages/records.js', '/pages/form.js',
  '/pages/categories.js', '/pages/stats.js'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(STATIC))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Cache-first: 所有請求先查快取
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached || new Response('Offline', { status: 503 }));
    })
  );
});

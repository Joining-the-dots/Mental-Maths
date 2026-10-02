/* Conway Family Learning Lab — service worker
   Bump CACHE_VERSION whenever you deploy a change to index.html or assets,
   so returning users get the new version instead of a stale cache. */
const CACHE_VERSION = 'tt-quest-v60';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './flags-data.js',
  './world/world-core.js?v=1',
  './world/world-art.js?v=1',
  './world/rewards-world.js?v=1',
  './world/world-look.js?v=1',
  './world/sound.js?v=1',
  './world/music.js?v=1',
  './world/island-encore.css?v=1',
  './world/island3d/grid3d.js?v=1',
  './world/island3d/motion.js?v=1',
  './world/island3d/tier.js?v=1',
  './world/island3d/stage.js?v=1',
  './world/island3d/kit.js?v=1',
  './audio/music/manifest.json',
  /* island games: must match index.html's SL_WORLD_VER (bump both together) */
  './world/games/shell.js?v=1',
  './world/games/fx.js?v=1',
  './world/games/course-hud.js?v=1',
  './world/games/kart-logic.js?v=1',
  './world/games/pet-course.js?v=1',
  './world/games/penalty.js?v=1',
  './world/games/kart.js?v=1',
  './icons/icon-192.png',
  './icons/icon-256.png',
  './icons/icon-512.png',
  './icons/icon-180.png',
  './icons/favicon.ico'
];

// Install — pre-cache the app shell so first offline launch works.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

// Activate — clean out old caches from previous versions.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/* Fetch strategy:
   - Navigation requests (HTML): network first, fall back to cached index.html
     so fresh deploys reach the user while offline launch still works.
   - Same-origin GETs: cache-first, update in background.
   - Fonts/CDN (Google Fonts, jsdelivr, unpkg): cache-first with opportunistic
     runtime caching.
   - Everything else: pass through. */
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  const isNavigation = req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html');
  const isFont = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com' || url.hostname === 'cdn.jsdelivr.net' || url.hostname === 'unpkg.com' || url.hostname === 'www.gstatic.com';
  const sameOrigin = url.origin === self.location.origin;

  if (isNavigation) {
    /* Only the app's own page is the offline shell. Other pages on this origin
       (control.html, parked.html, the 3D lab) are cached under their own URL,
       so opening them can never replace the cached app. */
    const scopePath = new URL(self.registration.scope).pathname;
    const isShell = url.pathname === scopePath || url.pathname === scopePath + 'index.html';
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE_VERSION).then((c) => c.put(isShell ? './index.html' : req, copy));
          }
          return res;
        })
        .catch(() => (isShell ? caches.match('./index.html') : caches.match(req)))
    );
    return;
  }

  if (sameOrigin || isFont) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetchPromise = fetch(req)
          .then((res) => {
            if (res && res.ok) {
              const copy = res.clone();
              caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    );
  }
});

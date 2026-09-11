/* Картопля — service worker.
   Як працює:
   • під час встановлення кешує все потрібне для роботи без мережі;
   • сторінка відкривається з кешу миттєво (у шеді без сигналу теж),
     а свіжа версія index.html тихо підтягується у фоні — з'явиться з наступного відкриття;
   • VERSION піднімай, коли додаєш/перейменовуєш файли в списку CORE.
   Кеш прив'язаний до адреси розгортання, тож інші застосунки на тому ж
   GitHub Pages (і робоча версія) свого кешу не втратять. */
const VERSION = 'kontur-39';
const SCOPE = self.registration.scope;
const PREFIX = 'kartoplya:';
const CACHE = `${PREFIX}${VERSION}@${SCOPE}`;
const CORE = [
  './', './index.html', './manifest.webmanifest',
  './icons/icon.svg', './icons/icon-192.png', './icons/icon-512.png',
  './icons/icon-maskable-512.png', './icons/apple-touch-icon.png', './icons/favicon-32.png',
  './fonts/manrope-cyrillic.woff2', './fonts/manrope-cyrillic-ext.woff2',
  './fonts/manrope-latin.woff2', './fonts/manrope-latin-ext.woff2',
];

self.addEventListener('install', e => {
  // cache:'reload' — повз HTTP-кеш, щоб не законсервувати стару версію
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(CORE.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys
        .filter(k => k.startsWith(PREFIX) && k.endsWith('@' + SCOPE) && k !== CACHE)
        .map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || !url.href.startsWith(SCOPE)) return;

  const isPage = req.mode === 'navigate' &&
    (url.pathname.endsWith('/') || url.pathname.endsWith('/index.html'));
  if (isPage) { e.respondWith(pageFromCache(e)); return; }

  // решта (шрифти, іконки, маніфест): спершу кеш, потім мережа
  e.respondWith(
    caches.open(CACHE).then(c => c.match(req, { ignoreSearch: true }).then(hit =>
      hit || fetch(req).then(res => {
        if (res.ok && res.type === 'basic') c.put(req, res.clone());
        return res;
      })
    ))
  );
});

async function pageFromCache(e) {
  const cache = await caches.open(CACHE);
  const cached = await cache.match('./index.html');
  const fresh = fetch(new Request(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }))
    .then(res => { if (res.ok) cache.put('./index.html', res.clone()); return res; })
    .catch(() => null);
  if (cached) { e.waitUntil(fresh); return cached; }
  return (await fresh) || new Response(
    '<meta charset="utf-8"><p style="font:16px sans-serif;padding:24px">Немає зʼєднання. Відкрий застосунок, коли зʼявиться мережа, — далі він працюватиме й без неї.</p>',
    { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

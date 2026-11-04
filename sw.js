// Offline helper for the Home Screen app.
// - The app's own files open instantly from the saved copy; a fresh copy is fetched in the background.
//   When index.html on GitHub has changed, the page is told so it can show "New version available".
// - Libraries and fonts from cdnjs / Google Fonts are kept after the first download.
// - Gemini requests (POST, other host) are never touched.
// Only change CACHE when this file's logic changes; app updates are detected automatically.
const CACHE = 'bill-splitter-v1';

const LOCAL_FILES = ['index.html', 'app.css', 'manifest.webmanifest',
    'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

const FA = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/';
const CDN_FILES = [
    `${FA}css/all.min.css`,
    `${FA}webfonts/fa-solid-900.woff2`,
    `${FA}webfonts/fa-regular-400.woff2`,
    `${FA}webfonts/fa-brands-400.woff2`,
    'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap',
];
const CDN_HOSTS = ['cdnjs.cloudflare.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

const scoped = (path) => new URL(path, self.registration.scope).href;

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE);
        await cache.addAll(LOCAL_FILES.map(f => new Request(scoped(f), { cache: 'no-cache' })));
        // A library that fails to download now is fetched again the first time it's used
        await Promise.all(CDN_FILES.map(url => cache.add(url).catch(() => {})));
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
        await self.clients.claim();
    })());
});

// The page's "Update" button, when this file itself has changed
self.addEventListener('message', (event) => {
    if (event.data === 'skipWaiting') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);

    if (req.mode === 'navigate' && url.href.startsWith(self.registration.scope)) {
        event.respondWith(savedThenRefresh(event, scoped('index.html')));
    } else if (LOCAL_FILES.some(f => scoped(f) === url.origin + url.pathname)) {
        event.respondWith(savedThenRefresh(event, url.origin + url.pathname));
    } else if (CDN_HOSTS.includes(url.hostname)) {
        event.respondWith(savedOrDownload(req));
    }
});

// Answer from the saved copy straight away; refresh it in the background
async function savedThenRefresh(event, key) {
    const cache = await caches.open(CACHE);
    const saved = await cache.match(key);
    const refresh = refreshFile(cache, key);
    if (saved) {
        event.waitUntil(refresh.catch(() => {}));
        return saved;
    }
    return refresh;
}

async function refreshFile(cache, key) {
    const res = await fetch(key, { cache: 'no-cache' });
    if (!res.ok) return res;
    if (key === scoped('index.html')) {
        const old = await cache.match(key);
        const changed = old && (await old.text()) !== (await res.clone().text());
        await cache.put(key, res.clone());
        if (changed) {
            // Fetch the matching stylesheet etc. before offering the reload
            await Promise.all(LOCAL_FILES.filter(f => f !== 'index.html').map(f =>
                fetch(scoped(f), { cache: 'no-cache' }).then(r => r.ok && cache.put(scoped(f), r)).catch(() => {})));
            const pages = await self.clients.matchAll({ type: 'window' });
            pages.forEach(page => page.postMessage({ type: 'app-updated' }));
        }
    } else {
        await cache.put(key, res.clone());
    }
    return res;
}

async function savedOrDownload(req) {
    const cache = await caches.open(CACHE);
    const saved = await cache.match(req.url);
    if (saved) return saved;
    const res = await fetch(req);
    if (res.ok || res.type === 'opaque') cache.put(req.url, res.clone());
    return res;
}

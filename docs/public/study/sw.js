const APP_HASH = '3bc4c450ef19';
const CACHE_NAME = `yomu-newtab-${APP_HASH}`;
const SHELL = ['./', './index.html', './manifest.webmanifest', './app.js', './styles.css', '../yomu.user.js'];
const CACHEABLE_PATH_SUFFIXES = [
  '/manifest.webmanifest',
  '/yomu.css',
  '/yomu.user.js',
  '/yomu-icon.svg',
  '/favicon-16x16.png',
  '/favicon-32x32.png',
  '/apple-touch-icon.png',
  '/pwa-icon-192.png',
  '/pwa-icon-512.png',
  '/pwa-icon-maskable-512.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys
      .filter(key => key.startsWith('yomu-newtab-') && key !== CACHE_NAME)
      .map(key => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirstIndex(event.request));
    return;
  }
  if (!shouldCacheRequest(event.request)) return;
  event.respondWith(networkFirst(event.request));
});

async function networkFirstIndex(request) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy)).catch(() => undefined);
    }
    return response;
  } catch {
    return await caches.match('./index.html') || Response.error();
  }
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    cacheNetworkResponse(request, response);
    return response;
  } catch {
    return await cachedResponseFallback(request);
  }
}

function cacheNetworkResponse(request, response) {
  if (!shouldStoreNetworkResponse(request, response)) return;
  const copy = response.clone();
  caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => undefined);
}

function shouldStoreNetworkResponse(request, response) {
  return response.ok && isSameOrigin(request);
}

async function cachedResponseFallback(request) {
  return await caches.match(request, { ignoreSearch: true })
    || Response.error();
}

function shouldCacheRequest(request) {
  if (!isSameOrigin(request)) return false;
  const url = new URL(request.url);
  return isStudyScopePath(url.pathname)
    || CACHEABLE_PATH_SUFFIXES.some(suffix => url.pathname.endsWith(suffix));
}

function isSameOrigin(request) {
  return new URL(request.url).origin === self.location.origin;
}

function isStudyScopePath(pathname) {
  const scopePath = new URL(self.registration.scope).pathname;
  return pathname.startsWith(scopePath);
}

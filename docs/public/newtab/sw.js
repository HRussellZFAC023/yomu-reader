const APP_HASH = 'a778d7f16653';
const CACHE_NAME = `yomu-newtab-${APP_HASH}`;
const SHELL = ['./', './index.html', './app.js', '../yomu.user.js'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))),
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
    if (response.ok && isSameOrigin(request)) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => undefined);
    }
    return response;
  } catch {
    return await caches.match(request, { ignoreSearch: true })
      || await caches.match('./index.html')
      || Response.error();
  }
}

function shouldCacheRequest(request) {
  if (!isSameOrigin(request)) return false;
  const url = new URL(request.url);
  return url.pathname.includes('/newtab/')
    || url.pathname.endsWith('/yomu.user.js')
    || url.pathname.endsWith('/yomu-icon.svg')
    || url.pathname.endsWith('/favicon-16x16.png')
    || url.pathname.endsWith('/favicon-32x32.png')
    || url.pathname.endsWith('/apple-touch-icon.png');
}

function isSameOrigin(request) {
  return new URL(request.url).origin === self.location.origin;
}

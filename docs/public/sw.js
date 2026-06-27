const CACHE_NAME = 'yomu-docs-shell-v1';
const SHELL = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/yomu-icon.svg',
  '/favicon-16x16.png',
  '/favicon-32x32.png',
  '/apple-touch-icon.png',
  '/yomu.css',
  '/yomu.user.js',
];
const CACHEABLE_PATH_SUFFIXES = [
  '/manifest.webmanifest',
  '/yomu.css',
  '/yomu.user.js',
  '/yomu-icon.svg',
  '/favicon-16x16.png',
  '/favicon-32x32.png',
  '/apple-touch-icon.png',
  '/og-image.png',
];
const DOC_PATHS = [
  '/',
  '/index.html',
  '/getting-started',
  '/features',
  '/tools/',
  '/guides/',
  '/support',
  '/changelog',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys
      .filter(key => key.startsWith('yomu-docs-shell-') && key !== CACHE_NAME)
      .map(key => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !isSameOrigin(event.request)) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirstNavigation(event.request));
    return;
  }
  if (!shouldCacheRequest(event.request)) return;
  event.respondWith(networkFirst(event.request));
});

async function networkFirstNavigation(request) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (!response.ok) return await cachedNavigationFallback(request);
    cacheNavigationResponse(request, response);
    return response;
  } catch {
    return await cachedNavigationFallback(request);
  }
}

async function cachedNavigationFallback(request) {
  const cached = await caches.match(request, { ignoreSearch: true });
  if (cached) return cached;
  const url = new URL(request.url);
  if (url.pathname !== '/' && url.pathname !== '/index.html') return Response.redirect('/', 302);
  return await caches.match('/') || await caches.match('/index.html') || Response.error();
}

async function networkFirst(request) {
  try {
    const response = await fetch(request);
    cacheNetworkResponse(request, response);
    return response;
  } catch {
    return await caches.match(request, { ignoreSearch: true }) || Response.error();
  }
}

function cacheNavigationResponse(request, response) {
  if (!response.ok) return;
  const url = new URL(request.url);
  if (!isDocsNavigationPath(url.pathname)) return;
  cacheNetworkResponse(request, response);
  if (url.pathname === '/' || url.pathname === '/index.html') cacheNetworkResponse('/', response);
}

function cacheNetworkResponse(request, response) {
  if (!response.ok) return;
  const copy = response.clone();
  caches.open(CACHE_NAME).then(cache => cache.put(request, copy)).catch(() => undefined);
}

function shouldCacheRequest(request) {
  const pathname = new URL(request.url).pathname;
  return CACHEABLE_PATH_SUFFIXES.some(suffix => pathname.endsWith(suffix));
}

function isDocsNavigationPath(pathname) {
  return DOC_PATHS.some(path => {
    if (path === '/') return pathname === '/';
    const prefix = path.endsWith('/') ? path : `${path}/`;
    return pathname === path || pathname.startsWith(prefix);
  });
}

function isSameOrigin(request) {
  return new URL(request.url).origin === self.location.origin;
}

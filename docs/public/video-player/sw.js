// fallow-ignore-file unused-file
const CACHE_NAME = 'yomu-video-player-v1';
const SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  '../yomu-icon.svg',
  '../favicon-16x16.png',
  '../favicon-32x32.png',
  '../apple-touch-icon.png',
];
const CACHEABLE_PATH_SUFFIXES = [
  '/video-player/',
  '/video-player/index.html',
  '/video-player/manifest.webmanifest',
  '/yomu.css',
  '/yomu.user.js',
  '/greasyfork/yomu-anki.user.js',
  '/greasyfork/yomu-kanji-study.user.js',
  '/greasyfork/yomu-settings-surface.user.js',
  '/greasyfork/yomu-video.user.js',
  '/yomu-icon.svg',
  '/favicon-16x16.png',
  '/favicon-32x32.png',
  '/apple-touch-icon.png',
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)).catch(() => undefined));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys
      .filter(key => key.startsWith('yomu-video-player-') && key !== CACHE_NAME)
      .map(key => caches.delete(key)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || !isSameOrigin(event.request)) return;
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
    if (response.ok) cacheNetworkResponse('./index.html', response);
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
    return await caches.match(request, { ignoreSearch: true }) || Response.error();
  }
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

function isSameOrigin(request) {
  return new URL(request.url).origin === self.location.origin;
}

'use strict';

const HOSTED_CACHE_NAME = /^(yomu-[a-z\d-]+-)[a-f\d]{12}$/u;
const IMMUTABLE_RUNTIME_PATH = /^\/greasyfork\/[a-z\d][a-z\d.-]*\.[a-f\d]{12}\.user\.js$/u;

self.registerYomuHostedReaderWorker = function registerYomuHostedReaderWorker(config) {
  const policy = hostedReaderCachePolicy(config);
  self.addEventListener('install', event => installHostedReaderWorker(event, policy));
  self.addEventListener('activate', event => activateHostedReaderWorker(event, policy));
  self.addEventListener('fetch', event => handleHostedReaderFetch(event, policy));
};

function hostedReaderCachePolicy({ cacheName, runtimeGraph, cacheablePathPrefixes = [] } = {}) {
  const cachePrefix = hostedCachePrefix(cacheName);
  const scopePath = hostedScopePath();
  const runtimePaths = immutableRuntimePaths(runtimeGraph);
  const pathPrefixes = hostedPathPrefixes(cacheablePathPrefixes, scopePath);
  const commonAssets = [
    '/yomu.css',
    '/yomu.user.js',
    ...runtimePaths,
    '/yomu-icon.svg',
    '/favicon-16x16.png',
    '/favicon-32x32.png',
    '/apple-touch-icon.png',
  ];
  return {
    cacheName,
    cachePrefix,
    shell: [
      './',
      './index.html',
      './manifest.webmanifest',
      ...commonAssets.map(pathname => `..${pathname}`),
    ],
    cacheablePathPrefixes: pathPrefixes,
    cacheablePathSuffixes: [
      scopePath,
      `${scopePath}index.html`,
      `${scopePath}manifest.webmanifest`,
      ...commonAssets,
    ],
  };
}

function hostedCachePrefix(cacheName) {
  const match = typeof cacheName === 'string' ? cacheName.match(HOSTED_CACHE_NAME) : null;
  if (!match) throw new Error('Hosted reader worker requires a core-revision cache name');
  return match[1];
}

function hostedScopePath() {
  const scopePath = new URL(self.registration.scope).pathname;
  if (!/^\/[a-z\d-]+\/$/u.test(scopePath)) throw new Error('Hosted reader worker requires a standalone surface scope');
  return scopePath;
}

function immutableRuntimePaths(runtimeGraph) {
  if (!Array.isArray(runtimeGraph)) throw new Error('Hosted reader worker requires a runtime graph');
  if (runtimeGraph.length === 0) throw new Error('Hosted reader worker runtime graph cannot be empty');
  assertUniqueRuntimePaths(runtimeGraph);
  assertImmutableRuntimePaths(runtimeGraph);
  return [...runtimeGraph];
}

function assertUniqueRuntimePaths(runtimeGraph) {
  if (new Set(runtimeGraph).size !== runtimeGraph.length) throw new Error('Hosted reader worker runtime graph must be unique');
}

function assertImmutableRuntimePaths(runtimeGraph) {
  if (!runtimeGraph.every(pathname => typeof pathname === 'string' && IMMUTABLE_RUNTIME_PATH.test(pathname))) {
    throw new Error('Hosted reader worker runtime graph must use immutable paths');
  }
}

function hostedPathPrefixes(pathPrefixes, scopePath) {
  if (!Array.isArray(pathPrefixes)) throw new Error('Hosted reader worker cacheable path prefixes must be an array');
  if (!pathPrefixes.every(pathname => typeof pathname === 'string' && pathname.startsWith(scopePath))) {
    throw new Error('Hosted reader worker cacheable path prefixes must stay inside its scope');
  }
  return [...pathPrefixes];
}

function installHostedReaderWorker(event, policy) {
  event.waitUntil(caches.open(policy.cacheName).then(cache => cache.addAll(policy.shell)));
  self.skipWaiting();
}

function activateHostedReaderWorker(event, policy) {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys
      .filter(key => key.startsWith(policy.cachePrefix) && key !== policy.cacheName)
      .map(key => caches.delete(key)))),
  );
  self.clients.claim();
}

function handleHostedReaderFetch(event, policy) {
  if (!isHostedReaderGet(event.request)) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(networkFirstHostedIndex(event.request, policy));
    return;
  }
  if (shouldCacheHostedRequest(event.request, policy)) {
    event.respondWith(networkFirstHostedAsset(event.request, policy));
  }
}

function isHostedReaderGet(request) {
  return request.method === 'GET' && new URL(request.url).origin === self.location.origin;
}

async function networkFirstHostedIndex(request, policy) {
  try {
    return await fetch(request, { cache: 'no-store' });
  } catch {
    return await cachedHostedResponse('./index.html', policy);
  }
}

async function networkFirstHostedAsset(request, policy) {
  try {
    const response = await fetch(request);
    if (shouldWriteThroughHostedRequest(request, policy)) {
      cacheHostedResponse(request, response, policy.cacheName);
    }
    return response;
  } catch {
    return await cachedHostedResponse(request, policy, { ignoreSearch: true });
  }
}

async function cachedHostedResponse(request, policy, matchOptions) {
  const cache = await caches.open(policy.cacheName);
  return await cache.match(request, matchOptions) || Response.error();
}

function cacheHostedResponse(request, response, cacheName) {
  if (!response.ok) return;
  const copy = response.clone();
  caches.open(cacheName).then(cache => cache.put(request, copy)).catch(() => undefined);
}

function shouldCacheHostedRequest(request, policy) {
  const pathname = new URL(request.url).pathname;
  return policy.cacheablePathPrefixes.some(prefix => pathname.startsWith(prefix))
    || policy.cacheablePathSuffixes.some(suffix => pathname.endsWith(suffix));
}

function shouldWriteThroughHostedRequest(request, policy) {
  const pathname = new URL(request.url).pathname;
  return policy.cacheablePathPrefixes.some(prefix => pathname.startsWith(prefix));
}

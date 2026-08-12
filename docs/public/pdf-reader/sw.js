importScripts('../hosted-reader-worker.js');

// yomu:runtime-cache:start
const CACHE_NAME = 'yomu-pdf-reader-b2934931159d';
// yomu:runtime-cache:end
const RUNTIME_GRAPH = [
  // yomu:runtime-companions:start
  '/greasyfork/yomu-runtime.fb8133848e5a.user.js',
  // yomu:runtime-companions:end
];

self.registerYomuHostedReaderWorker({
  cacheName: CACHE_NAME,
  runtimeGraph: RUNTIME_GRAPH,
  cacheablePathPrefixes: ['/pdf-reader/vendor/'],
});

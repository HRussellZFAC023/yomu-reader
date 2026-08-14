importScripts('../hosted-reader-worker.js');

// yomu:runtime-cache:start
const CACHE_NAME = 'yomu-pdf-reader-b17ae6bea998';
// yomu:runtime-cache:end
const RUNTIME_GRAPH = [
  // yomu:runtime-companions:start
  '/greasyfork/yomu-runtime.8d3f7733f9d1.user.js',
  // yomu:runtime-companions:end
];

self.registerYomuHostedReaderWorker({
  cacheName: CACHE_NAME,
  runtimeGraph: RUNTIME_GRAPH,
  cacheablePathPrefixes: ['/pdf-reader/vendor/'],
});

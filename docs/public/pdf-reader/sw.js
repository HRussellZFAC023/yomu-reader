importScripts('../hosted-reader-worker.js');

// yomu:runtime-cache:start
const CACHE_NAME = 'yomu-pdf-reader-2b344f7e04f5';
// yomu:runtime-cache:end
const RUNTIME_GRAPH = [
  // yomu:runtime-companions:start
  '/greasyfork/yomu-runtime.0c7958a11a04.user.js',
  // yomu:runtime-companions:end
];

self.registerYomuHostedReaderWorker({
  cacheName: CACHE_NAME,
  runtimeGraph: RUNTIME_GRAPH,
  cacheablePathPrefixes: ['/pdf-reader/vendor/'],
});

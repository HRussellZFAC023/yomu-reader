importScripts('../hosted-reader-worker.js');
const APPEARANCE_REVISION = '96ca131614dc';

// yomu:runtime-cache:start
const CACHE_NAME = 'yomu-pdf-reader-b0bae668c911';
// yomu:runtime-cache:end
const RUNTIME_GRAPH = [
  // yomu:runtime-companions:start
  '/greasyfork/yomu-runtime.10fd026e774e.user.js',
  // yomu:runtime-companions:end
];

self.registerYomuHostedReaderWorker({
  appearanceRevision: APPEARANCE_REVISION,
  cacheName: CACHE_NAME,
  runtimeGraph: RUNTIME_GRAPH,
  cacheablePathPrefixes: ['/pdf-reader/vendor/'],
});

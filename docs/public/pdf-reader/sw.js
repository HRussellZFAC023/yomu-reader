importScripts('../hosted-reader-worker.js');
const APPEARANCE_REVISION = '96ca131614dc';

// yomu:runtime-cache:start
const CACHE_NAME = 'yomu-pdf-reader-6ea8677df612';
// yomu:runtime-cache:end
const RUNTIME_GRAPH = [
  // yomu:runtime-companions:start
  '/greasyfork/yomu-runtime.5b0ffd762fec.user.js',
  // yomu:runtime-companions:end
];

self.registerYomuHostedReaderWorker({
  appearanceRevision: APPEARANCE_REVISION,
  cacheName: CACHE_NAME,
  runtimeGraph: RUNTIME_GRAPH,
  cacheablePathPrefixes: ['/pdf-reader/vendor/'],
});

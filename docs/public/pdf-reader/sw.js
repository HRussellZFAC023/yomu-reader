importScripts('../hosted-reader-worker.js');
const APPEARANCE_REVISION = '820fb1471c7a';

// yomu:runtime-cache:start
const CACHE_NAME = 'yomu-pdf-reader-6c1d44964a56';
// yomu:runtime-cache:end
const RUNTIME_GRAPH = [
  // yomu:runtime-companions:start
  '/greasyfork/yomu-runtime.b92523c11f63.user.js',
  // yomu:runtime-companions:end
];

self.registerYomuHostedReaderWorker({
  appearanceRevision: APPEARANCE_REVISION,
  cacheName: CACHE_NAME,
  runtimeGraph: RUNTIME_GRAPH,
  cacheablePathPrefixes: ['/pdf-reader/vendor/'],
});

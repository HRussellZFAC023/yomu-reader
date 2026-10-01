importScripts('../hosted-reader-worker.js');
const APPEARANCE_REVISION = 'aca279fff7d4';

// yomu:runtime-cache:start
const CACHE_NAME = 'yomu-pdf-reader-4399750441ef';
// yomu:runtime-cache:end
const RUNTIME_GRAPH = [
  // yomu:runtime-companions:start
  '/greasyfork/yomu-runtime.03c424534b12.user.js',
  // yomu:runtime-companions:end
];

self.registerYomuHostedReaderWorker({
  appearanceRevision: APPEARANCE_REVISION,
  cacheName: CACHE_NAME,
  runtimeGraph: RUNTIME_GRAPH,
  cacheablePathPrefixes: ['/pdf-reader/vendor/'],
});

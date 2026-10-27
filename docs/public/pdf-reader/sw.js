importScripts('../hosted-reader-worker.js');
const APPEARANCE_REVISION = '80787973307e';

// yomu:runtime-cache:start
const CACHE_NAME = 'yomu-pdf-reader-8cd6d9072072';
// yomu:runtime-cache:end
const RUNTIME_GRAPH = [
  // yomu:runtime-companions:start
  '/greasyfork/yomu-runtime.62635f9bc361.user.js',
  // yomu:runtime-companions:end
];

self.registerYomuHostedReaderWorker({
  appearanceRevision: APPEARANCE_REVISION,
  cacheName: CACHE_NAME,
  runtimeGraph: RUNTIME_GRAPH,
  cacheablePathPrefixes: ['/pdf-reader/vendor/'],
});

importScripts('../hosted-reader-worker.js');
const APPEARANCE_REVISION = '80787973307e';

// yomu:runtime-cache:start
const CACHE_NAME = 'yomu-pdf-reader-80e51e9b7e78';
// yomu:runtime-cache:end
const RUNTIME_GRAPH = [
  // yomu:runtime-companions:start
  '/greasyfork/yomu-runtime.0fc2de7a9524.user.js',
  // yomu:runtime-companions:end
];

self.registerYomuHostedReaderWorker({
  appearanceRevision: APPEARANCE_REVISION,
  cacheName: CACHE_NAME,
  runtimeGraph: RUNTIME_GRAPH,
  cacheablePathPrefixes: ['/pdf-reader/vendor/'],
});

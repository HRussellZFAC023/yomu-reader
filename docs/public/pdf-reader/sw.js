importScripts('../hosted-reader-worker.js');
const APPEARANCE_REVISION = '761999e25655';

// yomu:runtime-cache:start
const CACHE_NAME = 'yomu-pdf-reader-801456a23f1f';
// yomu:runtime-cache:end
const RUNTIME_GRAPH = [
  // yomu:runtime-companions:start
  '/greasyfork/yomu-runtime.dae08bf179f8.user.js',
  // yomu:runtime-companions:end
];

self.registerYomuHostedReaderWorker({
  appearanceRevision: APPEARANCE_REVISION,
  cacheName: CACHE_NAME,
  runtimeGraph: RUNTIME_GRAPH,
  cacheablePathPrefixes: ['/pdf-reader/vendor/'],
});

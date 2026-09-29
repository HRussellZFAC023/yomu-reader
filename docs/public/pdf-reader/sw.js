importScripts('../hosted-reader-worker.js');
const APPEARANCE_REVISION = '6985c53fca8c';

// yomu:runtime-cache:start
const CACHE_NAME = 'yomu-pdf-reader-f473d3aeb24d';
// yomu:runtime-cache:end
const RUNTIME_GRAPH = [
  // yomu:runtime-companions:start
  '/greasyfork/yomu-runtime.78dc9426909a.user.js',
  // yomu:runtime-companions:end
];

self.registerYomuHostedReaderWorker({
  appearanceRevision: APPEARANCE_REVISION,
  cacheName: CACHE_NAME,
  runtimeGraph: RUNTIME_GRAPH,
  cacheablePathPrefixes: ['/pdf-reader/vendor/'],
});

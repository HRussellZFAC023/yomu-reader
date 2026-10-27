importScripts('../hosted-reader-worker.js');
const APPEARANCE_REVISION = '80787973307e';

// yomu:runtime-cache:start
const CACHE_NAME = 'yomu-pdf-reader-40ba10ce351d';
// yomu:runtime-cache:end
const RUNTIME_GRAPH = [
  // yomu:runtime-companions:start
  '/greasyfork/yomu-runtime.eb4f11543f23.user.js',
  // yomu:runtime-companions:end
];

self.registerYomuHostedReaderWorker({
  appearanceRevision: APPEARANCE_REVISION,
  cacheName: CACHE_NAME,
  runtimeGraph: RUNTIME_GRAPH,
  cacheablePathPrefixes: ['/pdf-reader/vendor/'],
});

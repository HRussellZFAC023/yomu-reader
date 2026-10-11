// fallow-ignore-file unused-file
importScripts('../hosted-reader-worker.js');
const APPEARANCE_REVISION = '3ca592417e5d';

// yomu:runtime-cache:start
const CACHE_NAME = 'yomu-video-player-cee531099854';
// yomu:runtime-cache:end
const RUNTIME_GRAPH = [
  // yomu:runtime-companions:start
  '/greasyfork/yomu-runtime.e91df6c37af6.user.js',
  // yomu:runtime-companions:end
];

self.registerYomuHostedReaderWorker({
  appearanceRevision: APPEARANCE_REVISION,
  cacheName: CACHE_NAME,
  runtimeGraph: RUNTIME_GRAPH,
});

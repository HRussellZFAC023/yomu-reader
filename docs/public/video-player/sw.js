// fallow-ignore-file unused-file
importScripts('../hosted-reader-worker.js');

// yomu:runtime-cache:start
const CACHE_NAME = 'yomu-video-player-fbb9a8d3e7a1';
// yomu:runtime-cache:end
const RUNTIME_GRAPH = [
  // yomu:runtime-companions:start
  '/greasyfork/yomu-runtime.b523824582e9.user.js',
  // yomu:runtime-companions:end
];

self.registerYomuHostedReaderWorker({
  cacheName: CACHE_NAME,
  runtimeGraph: RUNTIME_GRAPH,
});

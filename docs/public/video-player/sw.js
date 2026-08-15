// fallow-ignore-file unused-file
importScripts('../hosted-reader-worker.js');

// yomu:runtime-cache:start
const CACHE_NAME = 'yomu-video-player-34a838c5e9bd';
// yomu:runtime-cache:end
const RUNTIME_GRAPH = [
  // yomu:runtime-companions:start
  '/greasyfork/yomu-runtime.7279d3e2af02.user.js',
  // yomu:runtime-companions:end
];

self.registerYomuHostedReaderWorker({
  cacheName: CACHE_NAME,
  runtimeGraph: RUNTIME_GRAPH,
});

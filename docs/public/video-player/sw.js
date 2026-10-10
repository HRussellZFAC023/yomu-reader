// fallow-ignore-file unused-file
importScripts('../hosted-reader-worker.js');
const APPEARANCE_REVISION = '3ca592417e5d';

// yomu:runtime-cache:start
const CACHE_NAME = 'yomu-video-player-a6e5dc61758d';
// yomu:runtime-cache:end
const RUNTIME_GRAPH = [
  // yomu:runtime-companions:start
  '/greasyfork/yomu-runtime.d9964be094f3.user.js',
  // yomu:runtime-companions:end
];

self.registerYomuHostedReaderWorker({
  appearanceRevision: APPEARANCE_REVISION,
  cacheName: CACHE_NAME,
  runtimeGraph: RUNTIME_GRAPH,
});

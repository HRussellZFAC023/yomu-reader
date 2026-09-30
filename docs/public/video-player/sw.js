// fallow-ignore-file unused-file
importScripts('../hosted-reader-worker.js');
const APPEARANCE_REVISION = '761999e25655';

// yomu:runtime-cache:start
const CACHE_NAME = 'yomu-video-player-5e16291c4ab1';
// yomu:runtime-cache:end
const RUNTIME_GRAPH = [
  // yomu:runtime-companions:start
  '/greasyfork/yomu-runtime.53c42ff3dd51.user.js',
  // yomu:runtime-companions:end
];

self.registerYomuHostedReaderWorker({
  appearanceRevision: APPEARANCE_REVISION,
  cacheName: CACHE_NAME,
  runtimeGraph: RUNTIME_GRAPH,
});

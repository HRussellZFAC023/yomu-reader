// fallow-ignore-file unused-file
importScripts('../hosted-reader-worker.js');
const APPEARANCE_REVISION = '96ca131614dc';

// yomu:runtime-cache:start
const CACHE_NAME = 'yomu-video-player-cb28af7b36fc';
// yomu:runtime-cache:end
const RUNTIME_GRAPH = [
  // yomu:runtime-companions:start
  '/greasyfork/yomu-runtime.982223f24ddb.user.js',
  // yomu:runtime-companions:end
];

self.registerYomuHostedReaderWorker({
  appearanceRevision: APPEARANCE_REVISION,
  cacheName: CACHE_NAME,
  runtimeGraph: RUNTIME_GRAPH,
});

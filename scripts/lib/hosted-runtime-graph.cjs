const { createHash } = require('node:crypto');
const {
  greasyForkLibraryPath,
  userscriptRequireLibraries,
} = require('./greasyfork-libraries.cjs');

const START_MARKER = '// yomu:runtime-companions:start';
const END_MARKER = '// yomu:runtime-companions:end';
const CACHE_START_MARKER = '// yomu:runtime-cache:start';
const CACHE_END_MARKER = '// yomu:runtime-cache:end';
const HOSTED_RUNTIME_PATH = /^\/?greasyfork\/[a-z\d][a-z\d.-]*\.[a-f\d]{12}\.user\.js$/u;
const HOSTED_REQUIRE = /^\/\/ @require\s+https:\/\/yomureader\.com\/(greasyfork\/[a-z\d][a-z\d.-]*\.[a-f\d]{12}\.user\.js)#sha256=[A-Za-z\d+/]+={0,2}$/u;

/**
 * Reads the dependency order a userscript manager will execute from the final,
 * SRI-annotated userscript. Hosted loaders use these same immutable paths so a
 * partially deployed release fails closed instead of pairing new core with a
 * stale mutable companion from an offline cache.
 *
 * @param {string} userscript
 * @returns {{ pagePaths: string[], serviceWorkerPaths: string[], cacheRevision: string }}
 */
function hostedRuntimeGraph(userscript) {
  const requireLines = userscript.split(/\r?\n/u).filter(line => line.startsWith('// @require'));
  if (requireLines.length === 0) {
    throw new Error('Final userscript must contain at least one @require dependency');
  }
  const pagePaths = requireLines.map(line => {
    const match = line.match(HOSTED_REQUIRE);
    if (!match) throw new Error(`Unsupported or mutable userscript @require: ${line}`);
    return match[1];
  });
  const registryPaths = userscriptRequireLibraries()
    .map(library => greasyForkLibraryPath(library.fileName));
  const canonicalPaths = pagePaths
    .map(path => path.replace(/\.[a-f\d]{12}(?=\.user\.js$)/u, ''));
  if (JSON.stringify(canonicalPaths) !== JSON.stringify(registryPaths)) {
    throw new Error('Final userscript @require graph does not match the ordered companion registry');
  }
  return {
    pagePaths,
    serviceWorkerPaths: pagePaths.map(path => `/${path}`),
    cacheRevision: createHash('sha256').update(userscript).digest('hex').slice(0, 12),
  };
}

/**
 * Replaces the one marked array block with an ordered hosted runtime graph.
 * Returning undefined makes a missing or ambiguous graph marker fatal to the
 * release sync instead of leaving a stale hand-written companion list behind.
 *
 * @param {string} source
 * @param {string[]} paths
 * @returns {string | undefined}
 */
function stampHostedRuntimeGraph(source, paths) {
  validateHostedRuntimePaths(paths);
  return stampMarkedLines(source, START_MARKER, END_MARKER, paths.map(path => `'${path}',`));
}

/**
 * Stamps both dependencies and a final-core-addressed cache namespace into a
 * standalone surface service worker.
 *
 * @param {string} source
 * @param {{ serviceWorkerPaths: string[], cacheRevision: string }} graph
 * @param {string} cacheNamePrefix
 * @returns {string | undefined}
 */
function stampHostedRuntimeServiceWorker(source, graph, cacheNamePrefix) {
  if (!/^yomu-[a-z\d-]+-$/u.test(cacheNamePrefix)) {
    throw new Error(`Unsafe hosted runtime cache prefix: ${cacheNamePrefix}`);
  }
  if (!/^[a-f\d]{12}$/u.test(graph.cacheRevision)) {
    throw new Error(`Unsafe hosted runtime cache revision: ${String(graph.cacheRevision)}`);
  }
  const graphed = stampHostedRuntimeGraph(source, graph.serviceWorkerPaths);
  if (!graphed) return undefined;
  return stampMarkedLines(
    graphed,
    CACHE_START_MARKER,
    CACHE_END_MARKER,
    [`const CACHE_NAME = '${cacheNamePrefix}${graph.cacheRevision}';`],
  );
}

function stampMarkedLines(source, startMarker, endMarker, lines) {
  const starts = markerOffsets(source, startMarker);
  const ends = markerOffsets(source, endMarker);
  if (starts.length !== 1 || ends.length !== 1 || ends[0] < starts[0]) return undefined;

  const start = starts[0];
  const end = ends[0];
  const lineStart = source.lastIndexOf('\n', start - 1) + 1;
  const indent = source.slice(lineStart, start);
  if (!/^[\t ]*$/u.test(indent)) return undefined;

  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const entries = lines.map(line => `${indent}${line}`).join(newline);
  const block = `${startMarker}${newline}${entries}${newline}${indent}${endMarker}`;
  return `${source.slice(0, start)}${block}${source.slice(end + endMarker.length)}`;
}

function markerOffsets(source, marker) {
  const offsets = [];
  let offset = source.indexOf(marker);
  while (offset !== -1) {
    offsets.push(offset);
    offset = source.indexOf(marker, offset + marker.length);
  }
  return offsets;
}

function validateHostedRuntimePaths(paths) {
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new Error('Hosted runtime graph must contain at least one companion path');
  }
  if (new Set(paths).size !== paths.length) {
    throw new Error('Hosted runtime graph companion paths must be unique');
  }
  for (const path of paths) {
    if (typeof path !== 'string' || !HOSTED_RUNTIME_PATH.test(path)) {
      throw new Error(`Unsafe hosted runtime companion path: ${String(path)}`);
    }
  }
}

module.exports = {
  hostedRuntimeGraph,
  stampHostedRuntimeGraph,
  stampHostedRuntimeServiceWorker,
};

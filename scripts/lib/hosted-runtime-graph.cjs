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
  const runtimePaths = requireHostedRuntimePaths(paths);
  return stampMarkedLines(source, START_MARKER, END_MARKER, runtimePaths.map(path => `'${path}',`));
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
  const region = locateMarkedBlock(source, startMarker, endMarker);
  if (!region) return undefined;

  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const entries = lines.map(line => `${region.indent}${line}`).join(newline);
  const block = `${startMarker}${newline}${entries}${newline}${region.indent}${endMarker}`;
  return `${source.slice(0, region.start)}${block}${source.slice(region.end + endMarker.length)}`;
}

function locateMarkedBlock(source, startMarker, endMarker) {
  const start = uniqueMarkerLine(source, startMarker);
  const end = uniqueMarkerLine(source, endMarker);
  if (!start || !end || end.offset < start.offset) return undefined;
  return { start: start.offset, end: end.offset, indent: start.indent };
}

function uniqueMarkerLine(source, marker) {
  const totalOccurrences = source.split(marker).length - 1;
  const lines = [...source.matchAll(markerLinePattern(marker))];
  if (totalOccurrences !== 1 || lines.length !== 1) return undefined;
  const [line] = lines;
  return { offset: line.index + line[1].length, indent: line[1] };
}

function markerLinePattern(marker) {
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return new RegExp(`^([\\t ]*)${escaped}[\\t ]*\\r?$`, 'gmu');
}

function requireHostedRuntimePaths(paths) {
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new Error('Hosted runtime graph must contain at least one companion path');
  }
  if (new Set(paths).size !== paths.length) {
    throw new Error('Hosted runtime graph companion paths must be unique');
  }
  return Array.from(paths, assertHostedRuntimePath);
}

function assertHostedRuntimePath(path) {
  if (typeof path !== 'string' || !HOSTED_RUNTIME_PATH.test(path)) {
    throw new Error(`Unsafe hosted runtime companion path: ${String(path)}`);
  }
  return path;
}

module.exports = {
  hostedRuntimeGraph,
  stampHostedRuntimeGraph,
  stampHostedRuntimeServiceWorker,
};

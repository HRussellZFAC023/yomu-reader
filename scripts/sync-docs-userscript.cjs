#!/usr/bin/env node
const { execFileSync } = require('node:child_process');
const { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const { dirname, join } = require('node:path');
const {
  DIST_USERSCRIPT_PATH,
  DOCS_USERSCRIPT_PATH,
  ROOT: root,
  fail,
  packageVersion,
} = require('./lib/userscript-build-utils.cjs');
const {
  GREASY_FORK_LIBRARIES,
  greasyForkLibraryPath,
  immutableLibraryFileName,
  immutableReaderCssFileName,
  userscriptRequireLibraries,
} = require('./lib/greasyfork-libraries.cjs');
const { stampAppearanceBoot } = require('./lib/hosted-appearance-boot.cjs');
const {
  hostedRuntimeGraph,
  stampHostedRuntimeGraph,
  stampHostedRuntimeServiceWorker,
} = require('./lib/hosted-runtime-graph.cjs');
const { stampSiteNav } = require('./lib/hosted-site-nav.cjs');

// Standalone hosted pages that paint their own chrome, so they need both the
// pre-paint accent bootstrap in their marked <head> block and the site
// navigation in their marked overflow-menu block. Nothing in the VitePress
// theme can reach them: they are served as plain files.
const STANDALONE_HOSTED_SURFACES = [
  {
    page: join(root, 'docs', 'public', 'pdf-reader', 'index.html'),
    serviceWorker: join(root, 'docs', 'public', 'pdf-reader', 'sw.js'),
    cacheNamePrefix: 'yomu-pdf-reader-',
  },
  {
    page: join(root, 'docs', 'public', 'video-player', 'index.html'),
    serviceWorker: join(root, 'docs', 'public', 'video-player', 'sw.js'),
    cacheNamePrefix: 'yomu-video-player-',
  },
];

const STUDY_BUILD_DIRECTORY = join(root, 'dist', 'newtab');
const STUDY_HOST_DIRECTORY = join(root, 'docs', 'public', 'study');
const NEW_TAB_ALIAS_DIRECTORY = join(root, 'docs', 'public', 'newtab');
const STUDY_HOST_FILES = [
  'app.js',
  'styles.css',
  'index.html',
  'manifest.webmanifest',
  'sw.js',
  'version.json',
];

copyBuiltAsset('dist/yomu.css', 'docs/public/yomu.css');
// Immutable content-addressed copy of the stylesheet: the userscript header's
// @resource yomuCss URL points here (see annotate-greasyfork-requires.cjs) so
// the pinned #sha256= can never diverge from the served bytes across releases.
copyBuiltAsset('dist/yomu.css', `docs/public/${immutableReaderCssFileName(readFileSync(join(root, 'dist/yomu.css'), 'utf8'))}`);
for (const library of GREASY_FORK_LIBRARIES) {
  const libraryPath = greasyForkLibraryPath(library.fileName);
  copyBuiltAsset(`dist/${libraryPath}`, `docs/public/${libraryPath}`);
}
for (const library of userscriptRequireLibraries()) {
  const libraryPath = greasyForkLibraryPath(library.fileName);
  // Only the consolidated runtime is pinned by the distributed userscript.
  // Focused companions above are mutable hosted assets; publishing immutable
  // copies of those too would recreate twelve unreferenced files per release.
  const immutableName = immutableLibraryFileName(library.fileName, readFileSync(join(root, `dist/${libraryPath}`), 'utf8'));
  copyBuiltAsset(`dist/${libraryPath}`, `docs/public/greasyfork/${immutableName}`);
}
prepareStudyBuild();
syncCanonicalStudyRoute();
syncNewTabCompatibilityAlias();
syncUserscript();
stampStandaloneHostedSurfaces();
pruneContentAddressedAssets();

function stampStandaloneHostedSurfaces() {
  const runtimeGraph = hostedRuntimeGraph(readFileSync(DIST_USERSCRIPT_PATH, 'utf8'));
  assertHostedRuntimeAssets(runtimeGraph.pagePaths);
  for (const surface of STANDALONE_HOSTED_SURFACES) {
    stampStandaloneHostedPage(surface.page, runtimeGraph.pagePaths);
    stampStandaloneHostedServiceWorker(surface.serviceWorker, runtimeGraph, surface.cacheNamePrefix);
    const { page, serviceWorker } = surface;
    console.log(`Stamped appearance, navigation, and runtime graph into ${page} and ${serviceWorker}`);
  }
}

function assertHostedRuntimeAssets(runtimePaths) {
  for (const runtimePath of runtimePaths) {
    if (!existsSync(join(root, 'docs', 'public', runtimePath))) {
      fail(`Missing hosted immutable runtime dependency: ${runtimePath}`);
    }
  }
}

function stampStandaloneHostedPage(page, runtimePaths) {
  if (!existsSync(page)) fail(`Missing hosted page: ${page}`);
  const source = readFileSync(page, 'utf8');
  const booted = requireStampedSource(stampAppearanceBoot(source, 'surface'), `Missing appearance-boot markers in ${page}`);
  const navigated = requireStampedSource(stampSiteNav(booted), `Missing site-nav markers in ${page}`);
  const stamped = requireStampedSource(
    stampHostedRuntimeGraph(navigated, runtimePaths),
    `Missing or ambiguous hosted-runtime markers in ${page}`,
  );
  if (stamped !== source) writeFileSync(page, stamped);
}

function stampStandaloneHostedServiceWorker(serviceWorker, runtimeGraph, cacheNamePrefix) {
  if (!existsSync(serviceWorker)) fail(`Missing hosted service worker: ${serviceWorker}`);
  const source = readFileSync(serviceWorker, 'utf8');
  const stamped = requireStampedSource(
    stampHostedRuntimeServiceWorker(source, runtimeGraph, cacheNamePrefix),
    `Missing or ambiguous hosted-runtime markers in ${serviceWorker}`,
  );
  if (stamped !== source) writeFileSync(serviceWorker, stamped);
}

function requireStampedSource(source, errorMessage) {
  if (!source) fail(errorMessage);
  return source;
}

function pruneContentAddressedAssets() {
  execFileSync(process.execPath, [join(root, 'scripts', 'prune-content-addressed-assets.mjs'), '--write'], {
    cwd: root,
    stdio: 'inherit',
  });
}

function syncUserscript() {
  if (!existsSync(DIST_USERSCRIPT_PATH)) fail(`Missing built userscript: ${DIST_USERSCRIPT_PATH}`);
  mkdirSync(dirname(DOCS_USERSCRIPT_PATH), { recursive: true });
  copyFileSync(DIST_USERSCRIPT_PATH, DOCS_USERSCRIPT_PATH);
  console.log(`Synced ${DOCS_USERSCRIPT_PATH}`);
}

function prepareStudyBuild() {
  const appSource = join(STUDY_BUILD_DIRECTORY, 'app.js');
  const cssSource = join(STUDY_BUILD_DIRECTORY, 'styles.css');
  const indexSource = join(root, 'public', 'newtab', 'index.html');
  const indexDist = join(STUDY_BUILD_DIRECTORY, 'index.html');
  if (!existsSync(appSource)) fail(`Missing built Study app: ${appSource}`);
  if (!existsSync(cssSource)) fail(`Missing built Study stylesheet: ${cssSource}`);
  if (!existsSync(indexSource)) fail(`Missing Study HTML template: ${indexSource}`);

  const appHash = fileHash(appSource);
  const cssHash = fileHash(cssSource);
  const buildId = `${packageVersion()}-${appHash}`;
  const template = stampAppearanceBoot(readFileSync(indexSource, 'utf8'), 'surface');
  if (!template) fail(`Missing appearance-boot markers in ${indexSource}`);
  const html = template
    .replaceAll('__YOMU_NEW_TAB_APP_HASH__', appHash)
    .replaceAll('__YOMU_NEW_TAB_BUILD_ID__', buildId)
    .replaceAll('__YOMU_NEW_TAB_CSS_HASH__', cssHash)
    .replace(/<script src="\.\/app\.js(?:\?v=[^"]*)?"><\/script>/, `<script src="./app.js?v=${appHash}"></script>`);
  mkdirSync(STUDY_BUILD_DIRECTORY, { recursive: true });
  writeFileSync(indexDist, html);
  writeStudyVersion(appHash, buildId);
  writeStudyManifest();
  writeStudyServiceWorker(appHash);
}

function syncCanonicalStudyRoute() {
  rmSync(STUDY_HOST_DIRECTORY, { recursive: true, force: true });
  mkdirSync(STUDY_HOST_DIRECTORY, { recursive: true });
  for (const fileName of STUDY_HOST_FILES) {
    const source = join(STUDY_BUILD_DIRECTORY, fileName);
    if (!existsSync(source)) fail(`Missing built Study asset: ${source}`);
    copyFileSync(source, join(STUDY_HOST_DIRECTORY, fileName));
  }
  console.log(`Synced canonical Study route ${STUDY_HOST_DIRECTORY}`);
}

function syncNewTabCompatibilityAlias() {
  const aliasSource = join(root, 'public', 'newtab', 'redirect.html');
  if (!existsSync(aliasSource)) fail(`Missing Study compatibility redirect: ${aliasSource}`);
  rmSync(NEW_TAB_ALIAS_DIRECTORY, { recursive: true, force: true });
  mkdirSync(NEW_TAB_ALIAS_DIRECTORY, { recursive: true });
  copyFileSync(aliasSource, join(NEW_TAB_ALIAS_DIRECTORY, 'index.html'));
  console.log(`Synced lightweight /newtab/ compatibility alias ${NEW_TAB_ALIAS_DIRECTORY}`);
}

// docs/public/study/version.json is a COMMITTED artifact, so every field in it
// has to be a function of the build input. A wall-clock stamp here rewrote the
// file on every single build, which made the repository permanently "dirty"
// after a rebuild and made any committed-vs-rebuilt comparison report stale
// artifacts that were not stale. appHash and buildId already identify the
// build, and they are the only fields the update check and the cache-busting
// reload actually read.
//
// This is what lets the committed-artifact guard mean anything: re-syncing an
// unchanged build now produces unchanged bytes, so a difference the guard finds
// is real drift rather than the gate run dirtying its own tree. Deriving the
// stamp from the previously hosted copy would have kept the tree clean too, but
// only after the first build of a given appHash — two machines building the
// same commit would still disagree. Having no stamp at all is the stronger
// guarantee, and nothing reads it.
function writeStudyVersion(appHash, buildId) {
  const version = `${JSON.stringify({ appHash, buildId }, null, 2)}\n`;
  writeFileSync(join(STUDY_BUILD_DIRECTORY, 'version.json'), version);
}

function writeStudyServiceWorker(appHash) {
  const source = join(root, 'public', 'newtab', 'sw.js');
  if (!existsSync(source)) fail(`Missing Study service worker template: ${source}`);
  writeFileSync(
    join(STUDY_BUILD_DIRECTORY, 'sw.js'),
    readFileSync(source, 'utf8').replaceAll('__YOMU_NEW_TAB_APP_HASH__', appHash),
  );
}

function writeStudyManifest() {
  const source = join(root, 'public', 'newtab', 'manifest.webmanifest');
  if (!existsSync(source)) fail(`Missing Study web manifest: ${source}`);
  copyFileSync(source, join(STUDY_BUILD_DIRECTORY, 'manifest.webmanifest'));
}

function copyBuiltAsset(sourcePath, targetPath) {
  const assetSource = join(root, sourcePath);
  const assetTarget = join(root, targetPath);
  if (!existsSync(assetSource)) fail(`Missing built asset: ${assetSource}`);
  mkdirSync(dirname(assetTarget), { recursive: true });
  copyFileSync(assetSource, assetTarget);
  console.log(`Synced ${assetTarget}`);
}

function fileHash(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 12);
}

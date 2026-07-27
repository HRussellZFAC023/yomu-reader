#!/usr/bin/env node
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
} = require('./lib/greasyfork-libraries.cjs');
const { stampAppearanceBoot } = require('./lib/hosted-appearance-boot.cjs');

// Standalone hosted pages that paint their own chrome and need the pre-paint
// accent bootstrap stamped into their marked <head> block.
const APPEARANCE_BOOT_PAGES = [
  join(root, 'docs', 'public', 'pdf-reader', 'index.html'),
  join(root, 'docs', 'public', 'video-player', 'index.html'),
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
  // Immutable content-addressed companion copy for @require pinning. Old
  // hashed copies from previous releases stay deployed on purpose: script
  // managers with an older header must keep validating their pinned URLs.
  const immutableName = immutableLibraryFileName(library.fileName, readFileSync(join(root, `dist/${libraryPath}`), 'utf8'));
  copyBuiltAsset(`dist/${libraryPath}`, `docs/public/greasyfork/${immutableName}`);
}
prepareStudyBuild();
syncCanonicalStudyRoute();
syncNewTabCompatibilityAlias();
syncUserscript();
stampStandaloneAppearanceBoot();

function stampStandaloneAppearanceBoot() {
  for (const page of APPEARANCE_BOOT_PAGES) {
    if (!existsSync(page)) fail(`Missing hosted page: ${page}`);
    const source = readFileSync(page, 'utf8');
    const stamped = stampAppearanceBoot(source, 'surface');
    if (!stamped) fail(`Missing appearance-boot markers in ${page}`);
    if (stamped !== source) writeFileSync(page, stamped);
    console.log(`Stamped pre-paint appearance boot into ${page}`);
  }
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

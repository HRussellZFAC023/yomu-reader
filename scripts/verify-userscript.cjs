const { createHash } = require('node:crypto');
const { join } = require('node:path');
const {
  BUNDLED_DEPENDENCY_NOTICE_MARKER,
  DIST_READER_CSS_PATH,
  DIST_USERSCRIPT_PATH,
  DOCS_USERSCRIPT_PATH,
  READER_CSS_RELATIVE_PATH,
  ROOT,
  USERSCRIPT_RELATIVE_PATH,
  assertNoRemoteExecutableLoaders,
  assertNoRemoteExecutableMetadata,
  byteLengthUtf8,
  fail,
  failIfGreasyForkSizeExceeded,
  fileExists,
  formatCount,
  packageJson,
  readBuiltUserscript,
  readText,
  warnIfNearGreasyForkSizeLimit,
} = require('./lib/userscript-build-utils.cjs');
const { GREASY_FORK_LIBRARIES, greasyForkLibraryPath } = require('./lib/greasyfork-libraries.cjs');

if (!fileExists(DIST_USERSCRIPT_PATH)) fail(`${USERSCRIPT_RELATIVE_PATH} is missing. Run npm run build first.`);
const MIN_READABLE_LINE_COUNT = 10_000;
const MAX_READABLE_LINE_LENGTH = 2_000;
const code = readBuiltUserscript();
const size = byteLengthUtf8(code);
const lines = code.split(/\r?\n/);
const maxLineLength = lines.reduce((max, line) => Math.max(max, line.length), 0);

if (!code.startsWith('// ==UserScript==')) fail(`${USERSCRIPT_RELATIVE_PATH} is missing a userscript metadata block.`);
if (!code.includes(`// @version      ${packageJson.version}`)) fail('userscript version does not match package.json.');
if (!code.includes('// @match        *://*/*')) fail('userscript match metadata is missing.');
if (code.includes('// @exclude      https://hrussellzfac023.github.io/yomu-reader/*')) fail('docs site exclude metadata should not block hosted new-tab request bridging.');
if (!code.includes('// @grant        GM_xmlhttpRequest')) fail('GM_xmlhttpRequest grant is missing.');
if (!code.includes('// @grant        GM.xmlHttpRequest')) fail('GM.xmlHttpRequest grant is missing.');
if (!code.includes('// @grant        GM_getResourceText')) fail('GM_getResourceText grant is missing.');
if (!code.includes('// @resource     yomuCss ')) fail('reader CSS resource metadata is missing.');
if (!code.includes('// @inject-into  content')) fail('Violentmonkey content-world injection metadata is missing.');

assertNoRemoteExecutableMetadata(code);
assertNoRemoteExecutableLoaders(code);
if (!code.includes('fflate') || !code.includes('invalid zip data')) fail('the fflate bundled ZIP reader does not appear in the generated userscript.');
if (code.includes('// @downloadURL')) fail('Greasy Fork build should not advertise an alternate download URL.');
if (code.includes('// @updateURL')) fail('Greasy Fork build should not advertise an alternate update URL.');
if (!code.includes(BUNDLED_DEPENDENCY_NOTICE_MARKER) || !code.includes('fflate')) fail('bundled dependency source/version notice is missing.');
if (!fileExists(DIST_READER_CSS_PATH)) fail(`${READER_CSS_RELATIVE_PATH} is missing; docs and extension builds still ship the reader stylesheet as a local asset.`);
const cssResource = readText(DIST_READER_CSS_PATH);
for (const selector of [
  '.jpdb-reader-popover',
  '.jpdb-reader-popover.jpdb-reader-sheet',
  '.jpdb-reader-word-highlight-pitch',
  '.jpdb-ocr-layer',
]) {
  if (!cssResource.includes(selector)) fail(`${READER_CSS_RELATIVE_PATH} is missing required reader selector: ${selector}`);
}
if (!code.includes('(function ()')) {
  fail('userscript should be bundled as a plain readable IIFE.');
}
try {
  // Parse only. Do not execute the userscript in the verifier.
  // This catches unsafe readability rewrites that break string/template syntax.
  new Function(code);
} catch (error) {
  fail(`${USERSCRIPT_RELATIVE_PATH} is not parseable JavaScript: ${error instanceof Error ? error.message : String(error)}`);
}
if (lines.length < MIN_READABLE_LINE_COUNT || maxLineLength > MAX_READABLE_LINE_LENGTH) {
  fail(`${USERSCRIPT_RELATIVE_PATH} looks minified or unreadable (${formatCount(lines.length)} lines, longest line ${formatCount(maxLineLength)} chars). Greasy Fork requires non-minified code.`);
}
failIfGreasyForkSizeExceeded(size);
warnIfNearGreasyForkSizeLimit(size);
assertSyncedDocsAssets();
assertNewTabCacheBusting();
assertPublishedChangelogIsReleaseOnly();

console.log(`Verified ${DIST_USERSCRIPT_PATH} (${formatCount(size)} bytes, ${formatCount(lines.length)} lines)`);

function assertSyncedDocsAssets() {
  for (const [sourcePath, targetPath] of [
    ['dist/yomu.user.js', 'docs/public/yomu.user.js'],
    ['dist/yomu.css', 'docs/public/yomu.css'],
    ['dist/newtab/app.js', 'docs/public/newtab/app.js'],
    ['dist/newtab/styles.css', 'docs/public/newtab/styles.css'],
    ['dist/newtab/index.html', 'docs/public/newtab/index.html'],
    ['dist/newtab/sw.js', 'docs/public/newtab/sw.js'],
    ['dist/newtab/version.json', 'docs/public/newtab/version.json'],
    ...GREASY_FORK_LIBRARIES.map(library => {
      const libraryPath = greasyForkLibraryPath(library.fileName);
      return [`dist/${libraryPath}`, `docs/public/${libraryPath}`];
    }),
  ]) {
    assertSameTextFile(sourcePath, targetPath);
  }

  if (!fileExists(join(ROOT, 'docs/.vitepress/dist/index.html'))) return;
  for (const [sourcePath, targetPath] of [
    ['docs/public/yomu.user.js', 'docs/.vitepress/dist/yomu.user.js'],
    ['docs/public/yomu.css', 'docs/.vitepress/dist/yomu.css'],
    ['docs/public/newtab/app.js', 'docs/.vitepress/dist/newtab/app.js'],
    ['docs/public/newtab/styles.css', 'docs/.vitepress/dist/newtab/styles.css'],
    ['docs/public/newtab/index.html', 'docs/.vitepress/dist/newtab/index.html'],
    ['docs/public/newtab/sw.js', 'docs/.vitepress/dist/newtab/sw.js'],
    ['docs/public/newtab/version.json', 'docs/.vitepress/dist/newtab/version.json'],
    ...GREASY_FORK_LIBRARIES.map(library => {
      const libraryPath = greasyForkLibraryPath(library.fileName);
      return [`docs/public/${libraryPath}`, `docs/.vitepress/dist/${libraryPath}`];
    }),
  ]) {
    assertSameTextFile(sourcePath, targetPath);
  }
}

function assertSameTextFile(sourcePath, targetPath) {
  const sourceFile = join(ROOT, sourcePath);
  const targetFile = join(ROOT, targetPath);
  if (!fileExists(sourceFile)) fail(`${sourcePath} is missing. Run npm run build first.`);
  if (!fileExists(targetFile)) fail(`${targetPath} is missing. Run node scripts/sync-docs-userscript.cjs and npm run docs:build first.`);
  if (readText(sourceFile) !== readText(targetFile)) {
    fail(`${targetPath} is not in sync with ${sourcePath}. Run build -> sync docs userscript -> docs build -> verify.`);
  }
}

function assertNewTabCacheBusting() {
  const appHash = fileHash('dist/newtab/app.js');
  const cssHash = fileHash('dist/newtab/styles.css');
  assertNewTabIndexCacheBusting(appHash, cssHash);
  assertNewTabVersionCacheBusting(appHash);
  assertNewTabServiceWorkerCacheBusting(appHash);
}

function assertNewTabIndexCacheBusting(appHash, cssHash) {
  const index = readText(join(ROOT, 'docs/public/newtab/index.html'));
  if (!index.includes(`./app.js?v=${appHash}`)) {
    fail('docs/public/newtab/index.html does not reference the current new-tab app hash.');
  }
  if (!index.includes(`./styles.css?v=${cssHash}`)) {
    fail('docs/public/newtab/index.html does not reference the current new-tab stylesheet hash.');
  }
}

function assertNewTabVersionCacheBusting(appHash) {
  const version = JSON.parse(readText(join(ROOT, 'docs/public/newtab/version.json')));
  if (version.appHash !== appHash) {
    fail(`docs/public/newtab/version.json appHash ${version.appHash} does not match current app hash ${appHash}.`);
  }
  if (version.buildId !== `${packageJson.version}-${appHash}`) {
    fail(`docs/public/newtab/version.json buildId ${version.buildId} does not match package version and current app hash.`);
  }
}

function assertNewTabServiceWorkerCacheBusting(appHash) {
  const serviceWorker = readText(join(ROOT, 'docs/public/newtab/sw.js'));
  if (!serviceWorker.includes(appHash)) {
    fail('docs/public/newtab/sw.js does not include the current new-tab app hash for cache cleanup.');
  }
}

function fileHash(relativePath) {
  return createHash('sha256').update(readText(join(ROOT, relativePath))).digest('hex').slice(0, 12);
}

function assertPublishedChangelogIsReleaseOnly() {
  const changelogPath = join(ROOT, 'CHANGELOG.md');
  const docsChangelogPath = join(ROOT, 'docs/changelog.md');
  const changelog = readText(changelogPath);
  const docsChangelog = readText(docsChangelogPath);
  assertChangelogHasNoUnreleasedSection(changelog);
  assertLatestChangelogVersion(changelog);
  assertDocsChangelogIncludesCanonicalFile(docsChangelog);
  assertBuiltChangelogHasNoUnreleasedSection();
  assertDocsUserscriptExists();
}

function assertChangelogHasNoUnreleasedSection(changelog) {
  const unreleasedHeading = changelog.match(/^##\s+\[?Unreleased\]?\b/im);
  if (unreleasedHeading) {
    fail('CHANGELOG.md contains an Unreleased section; docs/changelog.md includes it and would publish it as user-facing release notes.');
  }
}

function assertLatestChangelogVersion(changelog) {
  const firstHeading = changelog.match(/^##\s+\[([^\]]+)\]/m);
  if (!firstHeading) fail('CHANGELOG.md is missing a release heading.');
  if (firstHeading[1] !== packageJson.version) {
    fail(`CHANGELOG.md latest release ${firstHeading[1]} does not match package.json version ${packageJson.version}.`);
  }
}

function assertDocsChangelogIncludesCanonicalFile(docsChangelog) {
  if (!docsChangelog.includes('<!--@include: ../CHANGELOG.md-->')) {
    fail('docs/changelog.md should include CHANGELOG.md so release notes stay canonical.');
  }
}

function assertBuiltChangelogHasNoUnreleasedSection() {
  const builtChangelogPath = join(ROOT, 'docs/.vitepress/dist/changelog.html');
  if (fileExists(builtChangelogPath) && /\bUnreleased\b/i.test(readText(builtChangelogPath))) {
    fail('Built docs changelog contains an Unreleased section.');
  }
}

function assertDocsUserscriptExists() {
  if (!fileExists(DOCS_USERSCRIPT_PATH)) {
    fail('docs/public/yomu.user.js is missing. Run node scripts/sync-docs-userscript.cjs first.');
  }
}

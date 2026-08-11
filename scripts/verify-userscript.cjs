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
  userscriptMetadataValues,
  warnIfNearGreasyForkSizeLimit,
} = require('./lib/userscript-build-utils.cjs');
const {
  GREASY_FORK_LIBRARIES,
  greasyForkLibraryPath,
  immutableLibraryFileName,
  immutableLibraryUrl,
  immutableReaderCssUrl,
  readerCssResourceUrl,
  userscriptRequireLibraries,
} = require('./lib/greasyfork-libraries.cjs');
const { collectBundledDependencyDrift, formatBundledDependencyDrift } = require('./lib/bundled-dependency-lock.cjs');
const { userscriptWeightReport } = require('./lib/userscript-weight.cjs');

const READER_CSS_NETWORK_SKIP_ENV = 'YOMU_VERIFY_SKIP_NETWORK';
const READER_CSS_REQUEST_TIMEOUT_MS = 30_000;
// The runtime's own acceptance test for a fetched sheet (isFullReaderCss in
// src/reader/styles/index.ts). A body missing any of these is an error page or
// a truncated transfer, and the reader would refuse to paint it.
const FULL_READER_CSS_MARKERS = [
  '.jpdb-reader-popover',
  '.jpdb-reader-settings',
  '.jpdb-reader-source-card',
  '.jpdb-subtitle-player',
  '.jpdb-ocr-layer',
];
// Only executable/provider seams are retired. The disabled outbound dictionary
// link, ignored legacy settings, and Uchisen colour token remain intentional.
// Keep this narrower than /uchisen/i so the verifier does not outlaw those
// inert compatibility and navigation surfaces.
const RETIRED_UCHISEN_EXECUTABLE_SEAMS = [
  ['live kanji source identity', /\b(?:KANJI_UCHISEN_SOURCE_ID|__kanji_uchisen__)\b/u],
  ['extractor, renderer, or publisher implementation', /\b(?:absolute|attachRendered|canStart|canonical|default|empty|find|fit|format|generate|install|is|load|localized|main|mount|no|ordered|parse|plain|post|preferred|render|request|safe|storyBacked|unique|valid)[A-Za-z0-9]*Uchisen[A-Za-z0-9]*\b/u],
  ['Uchisen-owned DOM state', /data-(?:newtab-)?uchisen\b/u],
  ['provider write or image-proxy endpoint', /save_mnemonic\.php|(?:^|\/)generateimage(?:[/?#'"`]|$)|ik\.imagekit\.io\/uchisen/iu],
  ['provider scrape proxy rule', /host\s*===?\s*['"]uchisen\.com['"]/u],
  ['retired prompt corpus', /uchisen-image-prompt-replacements/iu],
];
const CURRENT_UCHISEN_COMPANION_ALIASES = [
  'yomu-runtime.user.js',
  'yomu-kanji-study.user.js',
];

if (!fileExists(DIST_USERSCRIPT_PATH)) fail(`${USERSCRIPT_RELATIVE_PATH} is missing. Run npm run build first.`);
const MIN_READABLE_LINE_COUNT = 10_000;
const MAX_READABLE_LINE_LENGTH = 2_000;
const code = readBuiltUserscript();
const size = byteLengthUtf8(code);
const lines = code.split(/\r?\n/);
const maxLineLength = lines.reduce((max, line) => Math.max(max, line.length), 0);

assertNoRetiredUchisenCurrentArtifacts();
if (!code.startsWith('// ==UserScript==')) fail(`${USERSCRIPT_RELATIVE_PATH} is missing a userscript metadata block.`);
if (!hasMetadataValue('version', packageJson.version)) fail('userscript version does not match package.json.');
if (!hasMetadataValue('icon', 'https://yomureader.com/favicon-32x32.png')) fail('userscript icon metadata must use the raster favicon for userscript manager compatibility.');
if (!hasMetadataValue('match', '*://*/*')) fail('userscript match metadata is missing.');
if (hasMetadataValue('exclude', 'https://hrussellzfac023.github.io/yomu-reader/*')) fail('docs site exclude metadata should not block hosted new-tab request bridging.');
if (!hasMetadataValue('grant', 'GM_xmlhttpRequest')) fail('GM_xmlhttpRequest grant is missing.');
if (!hasMetadataValue('grant', 'GM.xmlHttpRequest')) fail('GM.xmlHttpRequest grant is missing.');
if (!hasMetadataValue('grant', 'GM_getResourceText')) fail('GM_getResourceText grant is missing.');
if (!hasMetadataValue('connect', 'www.google.com')) fail('Google Search connect metadata is missing for the Lens fallback.');
if (!hasMetadataValue('connect', 'yomureader.com')) fail('hosted Yomu data connect metadata is missing.');
assertReaderCssResourceMetadata();
if (!hasMetadataValue('inject-into', 'content')) fail('Violentmonkey content-world injection metadata is missing.');

assertNoRemoteExecutableMetadata(code);
assertNoRemoteExecutableLoaders(code);
assertCompanionRequireSriHashes();
assertCompanionBuildVersions();
assertAcademyBuildVersion();
assertAnnotationsSplitBoundary();
assertAudioSplitBoundary();
assertWanikaniSplitBoundary();
assertJpdbSplitBoundary();
assertJitenSplitBoundary();
assertKanjiStudySplitBoundary();
assertNoStandaloneLegacyCopy();
assertAnkiRenderSplitBoundary();
assertLocalDictionarySplitBoundary();
assertZipReaderBundled();
// Update/download metadata may point ONLY at Greasy Fork's own
// must-revalidate endpoints (1.6.246: stops cached hosted copies re-offering
// an older release). Any other host remains an "alternate" URL Greasy Fork
// rejects.
const greasyForkUpdateBase = 'https://update.greasyfork.org/scripts/581653/%E3%82%88%E3%82%80';
if (code.includes('// @downloadURL') && !hasMetadataValue('downloadURL', `${greasyForkUpdateBase}.user.js`)) {
  fail('Greasy Fork build should not advertise an alternate download URL.');
}
if (code.includes('// @updateURL') && !hasMetadataValue('updateURL', `${greasyForkUpdateBase}.meta.js`)) {
  fail('Greasy Fork build should not advertise an alternate update URL.');
}
if (code.includes('function inflateSync(') && !code.includes(BUNDLED_DEPENDENCY_NOTICE_MARKER)) fail('bundled dependency source/version notice is missing.');
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
assertInjectedUserscriptWeight();
assertBundledDependenciesMatchLock();
assertSyncedDocsAssets();
assertNewTabCacheBusting();
assertPublishedChangelogIsReleaseOnly();

// The only network-touching check in the verifier, so it runs last: everything
// above must still be enforced when a sandbox sets YOMU_VERIFY_SKIP_NETWORK=1.
assertReaderCssIsDeliverable().then(
  () => console.log(`Verified ${DIST_USERSCRIPT_PATH} (${formatCount(size)} bytes, ${formatCount(lines.length)} lines)`),
  error => fail(`reader CSS delivery check failed to run: ${error instanceof Error ? error.message : String(error)}`),
);

function hasMetadataValue(key, expectedValue) {
  return userscriptMetadataValues(code, key).includes(expectedValue);
}

function hasMetadataPattern(key, pattern) {
  return userscriptMetadataValues(code, key).some(value => pattern.test(value));
}

// Generated output is deliberately checked here instead of in Vitest. The
// check orchestrator runs its test and build lanes concurrently, so a unit test
// reading dist/ can race a rewrite and report a false pass or a truncated file.
// `verify` is the serial join after build, docs sync, Academy build and docs
// build, which makes these the exact bytes this release is about to publish.
//
// Do not glob docs/public/greasyfork: retained content-addressed companions are
// immutable history for installed scripts. Only the mutable aliases and the
// hashes derived from THIS build for content-addressed dependencies are current
// release artifacts. Focused companions are published only through mutable
// aliases, so requiring an unreferenced immutable copy would invent an asset.
function assertNoRetiredUchisenCurrentArtifacts() {
  const relativePaths = currentUchisenArtifactPaths();
  const failures = retiredUchisenArtifactFailures(relativePaths);

  if (failures.length > 0) {
    fail([
      'Current release artifacts still contain retired Uchisen executable seams:',
      ...failures.map(failure => `  - ${failure}`),
      'Run the complete build -> docs sync -> Academy build -> docs build sequence before verify.',
      'Retained historical content-addressed assets are intentionally outside this gate.',
    ].join('\n'));
  }
}

function currentUchisenArtifactPaths() {
  const corePaths = [USERSCRIPT_RELATIVE_PATH, 'docs/public/yomu.user.js'];
  const paths = [
    USERSCRIPT_RELATIVE_PATH,
    'docs/public/yomu.user.js',
    'docs/public/study/app.js',
    'docs/public/academy/app.js',
    ...corePaths.flatMap(currentCorePinnedCompanionPaths),
    ...currentUchisenCompanionPaths(),
  ];
  return [...new Set(paths)];
}

function currentUchisenCompanionPaths() {
  const immutableDependencies = new Set(userscriptRequireLibraries().map(library => library.fileName));
  return CURRENT_UCHISEN_COMPANION_ALIASES.flatMap(fileName => [
    ...mutableCompanionPaths(fileName),
    ...requiredImmutableCompanionPaths(fileName, immutableDependencies),
  ]);
}

function mutableCompanionPaths(fileName) {
  return [
    `dist/${greasyForkLibraryPath(fileName)}`,
    `docs/public/${greasyForkLibraryPath(fileName)}`,
  ];
}

function requiredImmutableCompanionPaths(fileName, immutableDependencies) {
  if (!immutableDependencies.has(fileName)) return [];
  const distPath = join(ROOT, `dist/${greasyForkLibraryPath(fileName)}`);
  if (!fileExists(distPath)) return [];
  const immutableName = immutableLibraryFileName(fileName, readText(distPath));
  return [`docs/public/${greasyForkLibraryPath(immutableName)}`];
}

// Scan exactly what each current core header executes. A stale core can pin an
// older retained hash even while the mutable alias is clean.
function currentCorePinnedCompanionPaths(corePath) {
  const absoluteCorePath = join(ROOT, corePath);
  if (!fileExists(absoluteCorePath)) return [];
  return userscriptMetadataValues(readText(absoluteCorePath), 'require')
    .map(requireValue => /^https:\/\/yomureader\.com\/greasyfork\/(yomu-(?:runtime|kanji-study)\.[0-9a-f]{12}\.user\.js)(?:#|$)/u.exec(requireValue)?.[1])
    .filter(Boolean)
    .map(fileName => `docs/public/${greasyForkLibraryPath(fileName)}`);
}

function retiredUchisenArtifactFailures(relativePaths) {
  return relativePaths.flatMap(retiredUchisenArtifactFailure);
}

function retiredUchisenArtifactFailure(relativePath) {
  const artifactPath = join(ROOT, relativePath);
  if (!fileExists(artifactPath)) return [`${relativePath} is missing`];
  const artifact = readText(artifactPath);
  return RETIRED_UCHISEN_EXECUTABLE_SEAMS.flatMap(([label, pattern]) => {
    const match = pattern.exec(artifact);
    return match ? [`${relativePath} contains ${label}: ${JSON.stringify(match[0])}`] : [];
  });
}

function assertInjectedUserscriptWeight() {
  const report = userscriptWeightReport(ROOT);
  if (report.previousMaxInjectedBytes != null && report.maxInjectedBytes > report.previousMaxInjectedBytes) {
    fail(`injected userscript budget increased from ${formatCount(report.previousMaxInjectedBytes)} to ${formatCount(report.maxInjectedBytes)} bytes; the ratchet may only move down.`);
  }
  if (report.totalBytes > report.maxInjectedBytes) {
    fail(`userscript plus unconditional @requires total ${formatCount(report.totalBytes)} bytes, over the ${formatCount(report.maxInjectedBytes)}-byte injected-weight ratchet.`);
  }
  console.log(`[verify] userscript plus ${formatCount(report.files.length - 1)} unconditional @require(s): ${formatCount(report.totalBytes)} bytes (ratchet ${formatCount(report.maxInjectedBytes)}).`);
}

// Jiten color state parity: shipped artifacts must not contain standalone
// "Legacy" copy tokens. Lives here (serial, after build + sync-docs-userscript)
// rather than in the vitest lane, which runs concurrently with the build lane
// and raced its readFileSync of dist/yomu.user.js against the rebuild.
function assertNoStandaloneLegacyCopy() {
  for (const relativePath of [
    USERSCRIPT_RELATIVE_PATH,
    'docs/public/yomu.user.js',
    'docs/public/study/app.js',
    'docs/public/greasyfork/yomu-settings-surface.user.js',
    'docs/public/greasyfork/yomu-video.user.js',
  ]) {
    const text = readText(join(ROOT, relativePath));
    // "Legacy" as UI COPY is what this guards — a stale label shipping to users.
    // Upstream dictionary TITLES are data, not copy: yomidevs publishes builds named
    // "JMdict Legacy (en)" and "JMdict Legacy without proper names (en)", and the
    // catalogue carries their real names. Excluding that one phrase keeps the guard
    // meaningful instead of forcing us to rename a third party's dictionary.
    const matches = text.replace(/JMdict Legacy/g, '').match(/\bLegacy\b/g) ?? [];
    if (matches.length) fail(`${relativePath} ships ${matches.length} standalone Legacy copy token(s).`);
  }
}

function assertCompanionBuildVersions() {
  const runtimeLibrary = userscriptRequireLibraries()[0];
  if (!runtimeLibrary) fail('The distributed userscript runtime companion is missing from the Greasy Fork library manifest.');
  const relativePath = `dist/${greasyForkLibraryPath(runtimeLibrary.fileName)}`;
  const companionPath = join(ROOT, relativePath);
  if (!fileExists(companionPath)) fail(`${relativePath} is missing. Run npm run build first.`);
  const companionCode = readText(companionPath);
  if (!companionCode.includes(`const CURRENT_YOMU_VERSION = "${packageJson.version}"`)) {
    fail(`${relativePath} does not embed package version ${packageJson.version}; Help would display the dev fallback.`);
  }
  if (!companionCode.includes('const NEW_TAB_PAGE_URL = `${DOCS_BASE_URL}study/`;')) {
    fail(`${relativePath} does not query the canonical /study/version.json update endpoint.`);
  }
}

function assertAcademyBuildVersion() {
  const relativePath = 'docs/public/academy/app.js';
  const academyPath = join(ROOT, relativePath);
  if (!fileExists(academyPath)) fail(`${relativePath} is missing. Run npm run build:academy first.`);
  const academyCode = readText(academyPath);
  if (!academyCode.includes(`const CURRENT_YOMU_VERSION = "${packageJson.version}"`)) {
    fail(`${relativePath} does not embed package version ${packageJson.version}; Academy Help would display the dev fallback.`);
  }
}

function assertReaderCssResourceMetadata() {
  // The @resource URL must be IMMUTABLE (content-addressed) and carry the
  // matching #sha256=: script managers pin the hash at install time and
  // re-validate on external refresh, so a mutable URL whose content changes
  // on the next release fails validation and disables the whole script.
  if (!fileExists(DIST_READER_CSS_PATH)) fail(`${READER_CSS_RELATIVE_PATH} is missing. Run npm run build first.`);
  const content = readText(DIST_READER_CSS_PATH);
  const expectedHash = createHash('sha256').update(content).digest('base64');
  const expected = `${immutableReaderCssUrl(content)}#sha256=${expectedHash}`;
  const resourceValue = userscriptMetadataValues(code, 'resource').find(value => value.startsWith('yomuCss'));
  if (!resourceValue) fail('reader CSS @resource metadata is missing.');
  const resourceUrl = resourceValue.replace(/^yomuCss\s+/, '');
  if (resourceUrl !== expected) {
    fail(`yomuCss @resource must be the immutable content-addressed SRI URL ${expected}; found: ${resourceUrl}`);
  }
}

// Internal consistency (assertReaderCssResourceMetadata) only proves the pin
// matches the bytes in dist/. It cannot see whether anything is SERVED, and a
// build that reaches users before the docs deploy publishes the pinned file
// leaves every install of that build falling back over the network — which is
// how the reader ended up painting from the ~5KB critical subset (no furigana,
// no pitch underlines, a settings dialog degraded to native selects).
//
// The pin is content-addressed, so it CANNOT be live when this gate runs: in
// deploy-pages.yml `npm run verify` runs before the deploy step that publishes
// it. An unserved pin is therefore expected, not a failure. What must never
// ship is a build whose fallback chain cannot cover that window, so the
// always-deployed first-party sheet is the hard gate; the pin is checked for
// byte-identity only once it is actually live (a mutated content-addressed file
// makes script managers refuse to run the whole userscript).
async function assertReaderCssIsDeliverable() {
  if (process.env[READER_CSS_NETWORK_SKIP_ENV] === '1') {
    console.log(`[verify] ${READER_CSS_NETWORK_SKIP_ENV}=1: skipping the reader CSS delivery check (offline run).`);
    return;
  }
  const fallbackUrl = readerCssResourceUrl();
  const fallback = await probeUrl(fallbackUrl);
  if (fallback.error) failUnreachable(fallbackUrl, fallback.error);
  if (fallback.status !== 200) {
    fail(`reader CSS fallback ${fallbackUrl} is not served (HTTP ${fallback.status}). Every install whose pinned @resource is not deployed yet depends on this URL; without it the reader falls back to the critical CSS subset.`);
  }
  if (fallback.cors !== '*') {
    fail(`reader CSS fallback ${fallbackUrl} must send access-control-allow-origin: * so a page-context fetch can read it; found ${fallback.cors ?? 'no header'}.`);
  }
  const missingMarkers = FULL_READER_CSS_MARKERS.filter(marker => !fallback.body.includes(marker));
  if (missingMarkers.length) {
    fail(`reader CSS fallback ${fallbackUrl} is not a full sheet (missing ${missingMarkers.join(', ')}); the runtime would reject it and stay on the critical subset.`);
  }

  const content = readText(DIST_READER_CSS_PATH);
  const pinnedUrl = immutableReaderCssUrl(content);
  const pinned = await probeUrl(pinnedUrl);
  if (pinned.error) failUnreachable(pinnedUrl, pinned.error);
  if (pinned.status !== 200) {
    console.log(`[verify] reader CSS pin ${pinnedUrl} is not published yet (HTTP ${pinned.status}); expected before the docs deploy. Installs of this build fall back to ${fallbackUrl}, which is live, CORS-open and complete.`);
    return;
  }
  const servedHash = createHash('sha256').update(pinned.body).digest('base64');
  const expectedHash = createHash('sha256').update(content).digest('base64');
  if (servedHash !== expectedHash) {
    fail(`reader CSS pin ${pinnedUrl} serves bytes that hash to ${servedHash}, not the pinned ${expectedHash}. Script managers re-validate the pinned #sha256 and disable the entire userscript on a mismatch.`);
  }
  console.log(`[verify] reader CSS pin is deployed and byte-identical (${pinnedUrl}).`);
}

async function probeUrl(url) {
  try {
    const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(READER_CSS_REQUEST_TIMEOUT_MS) });
    return {
      status: response.status,
      cors: response.headers.get('access-control-allow-origin'),
      body: response.ok ? await response.text() : '',
    };
  } catch (error) {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }
}

// A transport failure is NOT treated as a pass: a gate that silently skips
// itself whenever the network hiccups is the gate that let this ship. Offline
// sandboxes opt out explicitly, and everything else in the verifier still runs.
function failUnreachable(url, error) {
  fail(`could not reach ${url} (${error.message}). Set ${READER_CSS_NETWORK_SKIP_ENV}=1 to run the verifier without its network check.`);
}

function assertCompanionRequireSriHashes() {
  // Greasy Fork rejects every listing sync as "unapproved external script"
  // unless each companion @require URL carries a matching #sha256= fragment —
  // and the URL must be IMMUTABLE (content-addressed filename) so the pinned
  // hash keeps matching after future releases redeploy the site. A mutable
  // companion URL under a pinned hash bricked all Tampermonkey installs the
  // moment the next release changed the served bytes.
  const requireUrls = userscriptMetadataValues(code, 'require');
  for (const library of userscriptRequireLibraries()) {
    const libraryPath = greasyForkLibraryPath(library.fileName);
    const content = readText(join(ROOT, 'dist', libraryPath));
    const expectedHash = createHash('sha256').update(content).digest('base64');
    const expectedUrl = `${immutableLibraryUrl(library.fileName, content)}#sha256=${expectedHash}`;
    const baseName = library.fileName.replace(/\.user\.js$/, '');
    const requireUrl = requireUrls.find(url => url.includes(`/${baseName}.`));
    if (!requireUrl) fail(`userscript is missing the @require for ${libraryPath}.`);
    if (requireUrl !== expectedUrl) {
      fail(`@require for ${libraryPath} must be the immutable content-addressed SRI URL ${expectedUrl}; found: ${requireUrl}`);
    }
  }
}

function settingsSurfaceCompanionCode() {
  const library = userscriptRequireLibraries()[0];
  if (!library) fail('The distributed userscript runtime companion is missing from the Greasy Fork library manifest.');
  const libraryPath = join(ROOT, 'dist', greasyForkLibraryPath(library.fileName));
  if (!fileExists(libraryPath)) fail(`dist/${greasyForkLibraryPath(library.fileName)} is missing. Run npm run build first.`);
  return readText(libraryPath);
}

function assertLocalDictionarySplitBoundary() {
  const companionCode = settingsSurfaceCompanionCode();
  for (const [label, signature] of [
    ['YomitanDictionaryStore', 'class YomitanDictionaryStore'],
    ['dexie import streaming', 'function streamDexieTables('],
  ]) {
    if (code.includes(signature)) fail(`ADR-0003 split regression: ${label} implementation leaked into ${USERSCRIPT_RELATIVE_PATH}.`);
    if (!companionCode.includes(signature)) fail(`ADR-0003 split regression: ${label} is missing from the settings-surface companion.`);
  }
}

function assertAnnotationsSplitBoundary() {
  const library = userscriptRequireLibraries()[0];
  if (!library) fail('The distributed userscript runtime companion is missing from the Greasy Fork library manifest.');
  const relativePath = `dist/${greasyForkLibraryPath(library.fileName)}`;
  if (!fileExists(join(ROOT, relativePath))) fail(`${relativePath} is missing. Run npm run build first.`);
  const companionCode = readText(join(ROOT, relativePath));
  for (const signature of [
    'function documentOverlay(',
    'function anchorOwnsTopmostPoint(',
    'registerYomuCompanion("annotations", {',
  ]) {
    if (!companionCode.includes(signature)) fail(`${relativePath} is missing annotation projection runtime: ${signature}`);
  }
  for (const signature of ['function documentOverlay(', 'function anchorOwnsTopmostPoint(']) {
    if (code.includes(signature)) fail(`annotation projection implementation leaked into ${USERSCRIPT_RELATIVE_PATH}: ${signature}`);
  }
  if (!code.includes('yomuAnnotationsCompanion()?.syncProjectedReadings(owner, projections);')) {
    fail(`${USERSCRIPT_RELATIVE_PATH} is missing the annotation companion facade.`);
  }
}

function assertZipReaderBundled() {
  // The dictionary ZIP reader ships with the local-dictionary store in the
  // settings-surface companion (ADR-0003), not in the size-limited core.
  const companionCode = settingsSurfaceCompanionCode();
  for (const signature of [
    'function inflateSync(data, opts)',
    'async function inflateRaw(bytes)',
    'class ZipArchive',
    'function readZipCentralDirectory(bytes)',
    'Invalid ZIP archive: end record not found.',
    'Unsupported ZIP compression method',
  ]) {
    if (!companionCode.includes(signature)) fail(`the companion ZIP reader is missing expected generated code: ${signature}`);
  }
}

// Shared shape for the ADR-0003 surfaces: every listed implementation must be
// absent from the size-limited core and present in the companion that owns it.
function assertSplitBoundary(libraryId, label, signatures) {
  const library = userscriptRequireLibraries()[0];
  if (!library) fail(`The distributed userscript runtime companion is missing while checking ${label}.`);
  const relativePath = `dist/${greasyForkLibraryPath(library.fileName)}`;
  if (!fileExists(join(ROOT, relativePath))) fail(`${relativePath} is missing. Run npm run build first.`);
  const companionCode = readText(join(ROOT, relativePath));
  for (const [name, signature] of signatures) {
    assertSplitSignature(relativePath, companionCode, name, signature);
  }
}

function assertSplitSignature(relativePath, companionCode, name, signature) {
  if (generatedCodeMatches(code, signature)) fail(`ADR-0003 split regression: ${name} implementation leaked into ${USERSCRIPT_RELATIVE_PATH}.`);
  if (!generatedCodeMatches(companionCode, signature)) fail(`ADR-0003 split regression: ${name} is missing from ${relativePath}.`);
}

function assertAudioSplitBoundary() {
  assertSplitBoundary('audio', 'Yomu Audio', [
    ['AudioPlayer', 'class AudioPlayer'],
    ['ReaderAudioActions', 'class ReaderAudioActions'],
    ['getAudioCandidates', 'function getAudioCandidates('],
    ['ShuffledAudioDeck', 'class ShuffledAudioDeck'],
    ['isJapanesePod101Url', 'function isJapanesePod101Url('],
  ]);
  if (!code.includes('yomuAudioCompanion()?.AudioPlayer')) {
    fail(`${USERSCRIPT_RELATIVE_PATH} is missing the audio companion facade.`);
  }
}

function assertWanikaniSplitBoundary() {
  assertSplitBoundary('wanikani', 'Yomu WaniKani', [
    ['WanikaniClient', 'class WanikaniClient'],
    ['WanikaniLookupClient', 'class WanikaniLookupClient'],
    ['WanikaniSourceController', 'class WanikaniSourceController'],
    ['createWanikaniSrsAdapter', 'function createWanikaniSrsAdapter('],
    ['parseWanikaniSubject', 'function parseWanikaniSubject('],
  ]);
  if (!code.includes('yomuWanikaniCompanion()?.WanikaniClient')) {
    fail(`${USERSCRIPT_RELATIVE_PATH} is missing the WaniKani companion facade.`);
  }
}

function assertJpdbSplitBoundary() {
  assertSplitBoundary('jpdb', 'Yomu JPDB', [
    ['JpdbClient', 'class JpdbClient'],
    ['JpdbApiClient', 'class JpdbApiClient'],
    ['JpdbVocabularyClient', 'class JpdbVocabularyClient'],
    ['JpdbPublicPitchClient', 'class JpdbPublicPitchClient'],
    ['parseJpdbVocabularyHtml', 'function parseJpdbVocabularyHtml('],
    ['jpdbParseResultToTokens', 'function jpdbParseResultToTokens('],
    ['initJpdbReviewPageBridge', 'function initJpdbReviewPageBridge('],
    ['parseJpdbReviewDocument', 'function parseJpdbReviewDocument('],
    ['renderJpdbDefinitionSource', 'function renderJpdbDefinitionSource('],
    ['renderedJpdbRelatedWords', 'function renderedJpdbRelatedWords('],
  ]);
  for (const facade of [
    'yomuJpdbCompanion()?.JpdbClient',
    'yomuJpdbCompanion()?.JpdbVocabularyClient',
    'yomuJpdbCompanion()?.JpdbPublicPitchClient',
    'yomuJpdbCompanion()?.initJpdbReviewPageBridge',
    'yomuJpdbCompanion()?.renderJpdbDefinitionSource',
    'yomuJpdbCompanion()?.renderedJpdbRelatedWords',
  ]) {
    if (!code.includes(facade)) fail(`${USERSCRIPT_RELATIVE_PATH} is missing the JPDB companion facade: ${facade}`);
  }
}

function assertJitenSplitBoundary() {
  assertSplitBoundary('jiten', 'Yomu Jiten', [
    ['JitenPublicVocabularyClient', 'class JitenPublicVocabularyClient'],
    ['publicJitenBackoffRemainingMs', 'function publicJitenBackoffRemainingMs('],
    ['parsedCardHydrationKey', 'function parsedCardHydrationKey('],
    ['renderJitenDefinitionSource', 'function renderJitenDefinitionSource('],
  ]);
  for (const facade of [
    'yomuJitenCompanion()?.JitenPublicVocabularyClient',
    'yomuJitenCompanion()?.parsedCardHydrationKey',
    'yomuJitenCompanion()?.publicJitenBackoffRemainingMs',
    'yomuJitenCompanion()?.renderJitenDefinitionSource',
  ]) {
    if (!code.includes(facade)) fail(`${USERSCRIPT_RELATIVE_PATH} is missing the Jiten companion facade: ${facade}`);
  }
}

function assertKanjiStudySplitBoundary() {
  const kanjiStudyLibrary = userscriptRequireLibraries()[0];
  if (!kanjiStudyLibrary) fail('The distributed userscript runtime companion is missing while checking Yomu Kanji/Study.');
  const libraryPath = join(ROOT, 'dist', greasyForkLibraryPath(kanjiStudyLibrary.fileName));
  if (!fileExists(libraryPath)) fail(`dist/${greasyForkLibraryPath(kanjiStudyLibrary.fileName)} is missing. Run npm run build first.`);
  const companionCode = readText(libraryPath);
  const extractedSignatures = [
    ['KanjiOriginClient', 'class KanjiOriginClient'],
    ['KanjiVGClient', 'class KanjiVGClient'],
    ['RtkClient', 'class RtkClient'],
    ['JpdbKanjiClient', 'class JpdbKanjiClient'],
    ['buildKanjiFacts', 'function buildKanjiFacts(kanji,'],
    ['buildKanjiOriginGraph', 'function buildKanjiOriginGraph(kanji,'],
    ['renderRtkInfo', 'function renderRtkInfo(info,'],
    ['installOriginGraphInteractions', 'function installOriginGraphInteractions(root)'],
    ['renderJpdbKanjiInfo', 'function renderJpdbKanjiInfo(info,'],
    ['renderJpdbKanjiMiningControls', 'function renderJpdbKanjiMiningControls(info,'],
    ['renderKanjiOriginGraph', 'function renderKanjiOriginGraph(graph,'],
    ['renderKanjiOrigins', 'function renderKanjiOrigins(facts,'],
    ['renderKanjiPractice', 'function renderKanjiPractice(info,'],
    ['installKanjiPracticeDoodle', 'function installKanjiPracticeDoodle('],
    ['installKanjiDoodle', 'function installKanjiDoodle('],
    ['assessKanjiStrokes', 'function assessKanjiStrokes('],
    ['Japanese grammar pattern table', 'const GRAMMAR_PATTERN_DATA'],
    ['Japanese grammar pattern parser', 'function parseGrammarRule'],
    ['grammar false-positive filters', 'const BARE_MITAI_DESIRE_FALSE_POSITIVE_RE'],
    ['Spanish target grammar module', 'const SPANISH_GRAMMAR'],
    ['French target grammar module', 'const FRENCH_GRAMMAR'],
    ['German target grammar module', 'const GERMAN_GRAMMAR'],
    ['Russian target grammar module', 'const RUSSIAN_GRAMMAR'],
    ['grammar hint example renderer', 'function renderGrammarHintExamples'],
  ];

  for (const [label, signature] of extractedSignatures) {
    if (code.includes(signature)) fail(`ADR-0003 split regression: ${label} implementation leaked into ${USERSCRIPT_RELATIVE_PATH}.`);
    if (!companionCode.includes(signature)) fail(`ADR-0003 split regression: ${label} is missing from dist/${greasyForkLibraryPath(kanjiStudyLibrary.fileName)}.`);
  }
}

function assertAnkiRenderSplitBoundary() {
  assertSplitBoundary('anki', 'Yomu Anki', [
    ['renderAnkiActionRow', 'function renderAnkiActionRow(ankiLookup,'],
    ['renderAnkiExistingSection', 'function renderAnkiExistingSection(ankiLookup,'],
    ['renderAnkiNewCardPreview', 'function renderAnkiNewCardPreview(card,'],
    ['pruneRedundantAnkiGlyphRepeats', 'function pruneRedundantAnkiGlyphRepeats(html)'],
    ['renderAnkiRenderedCardStudyBody', 'function renderAnkiRenderedCardStudyBody(card,'],
    // Rollup may suffix a colliding local parameter (for example `settings2`)
    // after the aggregate runtime starts owning another settings namespace.
    // Match the implementation's first parameter while excluding the core
    // facade, whose generated signature is `renderReviewButtons(...args)`.
    ['renderReviewButtons', /function renderReviewButtons\(settings\d*,/u],
    ['reviewButtonGrades', /function reviewButtonGrades\(settings\d*\)/u],
  ]);
}

function generatedCodeMatches(generatedCode, signature) {
  return typeof signature === 'string' ? generatedCode.includes(signature) : signature.test(generatedCode);
}

// Runs before the artifact comparison below on purpose: a bundled dependency
// that does not match the lock makes every committed artifact differ from a
// rebuild, and without this the verifier would blame the artifacts instead.
function assertBundledDependenciesMatchLock() {
  const lockPath = join(ROOT, 'package-lock.json');
  if (!fileExists(lockPath)) return;
  const lockPackages = JSON.parse(readText(lockPath)).packages || {};
  const drift = collectBundledDependencyDrift(packageJson.dependencies, lockPackages, name => {
    const manifest = join(ROOT, 'node_modules', name, 'package.json');
    if (!fileExists(manifest)) return null;
    return JSON.parse(readText(manifest)).version || null;
  });
  if (drift.length > 0) fail(formatBundledDependencyDrift(drift));
}

function assertSyncedDocsAssets() {
  for (const [sourcePath, targetPath] of [
    ['dist/yomu.user.js', 'docs/public/yomu.user.js'],
    ['dist/yomu.css', 'docs/public/yomu.css'],
    ['public/newtab/redirect.html', 'docs/public/newtab/index.html'],
    ['dist/newtab/app.js', 'docs/public/study/app.js'],
    ['dist/newtab/styles.css', 'docs/public/study/styles.css'],
    ['dist/newtab/index.html', 'docs/public/study/index.html'],
    ['dist/newtab/manifest.webmanifest', 'docs/public/study/manifest.webmanifest'],
    ['dist/newtab/sw.js', 'docs/public/study/sw.js'],
    ['dist/newtab/version.json', 'docs/public/study/version.json'],
    ...GREASY_FORK_LIBRARIES.map(library => {
      const libraryPath = greasyForkLibraryPath(library.fileName);
      return [`dist/${libraryPath}`, `docs/public/${libraryPath}`];
    }),
  ]) {
    assertSameTextFile(sourcePath, targetPath);
  }
  assertLightweightNewTabAlias('docs/public/newtab');

  if (!fileExists(join(ROOT, 'docs/.vitepress/dist/index.html'))) return;
  for (const [sourcePath, targetPath] of [
    ['docs/public/yomu.user.js', 'docs/.vitepress/dist/yomu.user.js'],
    ['docs/public/yomu.css', 'docs/.vitepress/dist/yomu.css'],
    ['docs/public/newtab/index.html', 'docs/.vitepress/dist/newtab/index.html'],
    ['docs/public/study/app.js', 'docs/.vitepress/dist/study/app.js'],
    ['docs/public/study/styles.css', 'docs/.vitepress/dist/study/styles.css'],
    ['docs/public/study/index.html', 'docs/.vitepress/dist/study/index.html'],
    ['docs/public/study/manifest.webmanifest', 'docs/.vitepress/dist/study/manifest.webmanifest'],
    ['docs/public/study/sw.js', 'docs/.vitepress/dist/study/sw.js'],
    ['docs/public/study/version.json', 'docs/.vitepress/dist/study/version.json'],
    ...GREASY_FORK_LIBRARIES.map(library => {
      const libraryPath = greasyForkLibraryPath(library.fileName);
      return [`docs/public/${libraryPath}`, `docs/.vitepress/dist/${libraryPath}`];
    }),
  ]) {
    assertSameTextFile(sourcePath, targetPath);
  }
  assertLightweightNewTabAlias('docs/.vitepress/dist/newtab');
}

function assertLightweightNewTabAlias(relativeDirectory) {
  const indexPath = join(ROOT, relativeDirectory, 'index.html');
  if (!fileExists(indexPath)) fail(`${relativeDirectory}/index.html is missing.`);
  const index = readText(indexPath);
  if (!index.includes('<link rel="canonical" href="https://yomureader.com/study/">')) {
    fail(`${relativeDirectory}/index.html must declare /study/ as canonical.`);
  }
  if (!index.includes("new URL('../study/', current)")) {
    fail(`${relativeDirectory}/index.html is missing the safe relative Study redirect.`);
  }
  if (byteLengthUtf8(index) > 8_192) fail(`${relativeDirectory}/index.html is not a lightweight compatibility alias.`);
  for (const fileName of ['app.js', 'styles.css', 'manifest.webmanifest', 'sw.js', 'version.json']) {
    if (fileExists(join(ROOT, relativeDirectory, fileName))) {
      fail(`${relativeDirectory}/${fileName} duplicates the canonical Study asset set.`);
    }
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
  const index = readText(join(ROOT, 'docs/public/study/index.html'));
  if (!index.includes(`./app.js?v=${appHash}`)) {
    fail('docs/public/study/index.html does not reference the current Study app hash.');
  }
  if (!index.includes(`./styles.css?v=${cssHash}`)) {
    fail('docs/public/study/index.html does not reference the current Study stylesheet hash.');
  }
  if (!index.includes("navigator.serviceWorker.register('./sw.js')")) {
    fail('docs/public/study/index.html does not register the canonical Study service worker.');
  }
}

function assertNewTabVersionCacheBusting(appHash) {
  const version = JSON.parse(readText(join(ROOT, 'docs/public/study/version.json')));
  if (version.appHash !== appHash) {
    fail(`docs/public/study/version.json appHash ${version.appHash} does not match current app hash ${appHash}.`);
  }
  if (version.buildId !== `${packageJson.version}-${appHash}`) {
    fail(`docs/public/study/version.json buildId ${version.buildId} does not match package version and current app hash.`);
  }
}

function assertNewTabServiceWorkerCacheBusting(appHash) {
  const serviceWorker = readText(join(ROOT, 'docs/public/study/sw.js'));
  if (!serviceWorker.includes(appHash)) {
    fail('docs/public/study/sw.js does not include the current Study app hash for cache cleanup.');
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

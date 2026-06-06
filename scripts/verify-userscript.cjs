const {
  BUNDLED_DEPENDENCY_NOTICE_MARKER,
  DIST_READER_CSS_PATH,
  DIST_USERSCRIPT_PATH,
  READER_CSS_RELATIVE_PATH,
  USERSCRIPT_RELATIVE_PATH,
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
} = require('./userscript-build-utils.cjs');

const MIN_READABLE_LINE_COUNT = 10_000;
const MAX_READABLE_LINE_LENGTH = 1_000;
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
if (!code.includes('fflate') || !code.includes('inflateSync')) fail('the fflate import/global does not appear in the generated userscript.');
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
  fail(`${USERSCRIPT_RELATIVE_PATH} is not parseable JavaScript after readability compaction: ${error instanceof Error ? error.message : String(error)}`);
}
if (lines.length < MIN_READABLE_LINE_COUNT || maxLineLength > MAX_READABLE_LINE_LENGTH) {
  fail(`${USERSCRIPT_RELATIVE_PATH} looks minified or unreadable (${formatCount(lines.length)} lines, longest line ${formatCount(maxLineLength)} chars). Greasy Fork requires non-minified code.`);
}
failIfGreasyForkSizeExceeded(size);
warnIfNearGreasyForkSizeLimit(size);

console.log(`Verified ${DIST_USERSCRIPT_PATH} (${formatCount(size)} bytes, ${formatCount(lines.length)} lines)`);

const fs = require('node:fs');
const path = require('node:path');
const pkg = require('../package.json');

const GREASY_FORK_SIZE_LIMIT_BYTES = 2_000_000;
const SIZE_WARNING_RATIO = 0.9;
const MIN_READABLE_LINE_COUNT = 1_000;
const MAX_READABLE_LINE_LENGTH = 2_000;
const file = path.join(__dirname, '..', 'dist', 'yomu.user.js');
const cssResourceFile = path.join(__dirname, '..', 'dist', 'yomu.css');
const code = fs.readFileSync(file, 'utf8');
const size = Buffer.byteLength(code, 'utf8');
const lines = code.split(/\r?\n/);
const maxLineLength = lines.reduce((max, line) => Math.max(max, line.length), 0);
const fail = message => {
  console.error(message);
  process.exit(1);
};

if (!code.startsWith('// ==UserScript==')) fail('dist/yomu.user.js is missing a userscript metadata block.');
if (!code.includes(`// @version      ${pkg.version}`)) fail('userscript version does not match package.json.');
if (!code.includes('// @match        *://*/*')) fail('userscript match metadata is missing.');
if (code.includes('// @exclude      https://hrussellzfac023.github.io/yomu-reader/*')) fail('docs site exclude metadata should not block hosted new-tab request bridging.');
if (!code.includes('// @grant        GM_xmlhttpRequest')) fail('GM_xmlhttpRequest grant is missing.');
if (!code.includes('// @grant        GM.xmlHttpRequest')) fail('GM.xmlHttpRequest grant is missing.');
if (!code.includes('// @grant        GM_getResourceText')) fail('GM_getResourceText grant is missing.');
if (!code.includes('// @resource     yomuCss ')) fail('reader CSS resource metadata is missing.');
if (!code.includes('// @inject-into  content')) fail('Violentmonkey content-world injection metadata is missing.');

const requireUrls = lines
  .map(line => line.match(/^\/\/ @require\s+(.+)$/)?.[1]?.trim())
  .filter(Boolean);
if (requireUrls.length) fail(`userscript must not download remote executed code with @require; found: ${requireUrls.join(', ')}`);
if (!code.includes('fflate') || !code.includes('inflateSync')) fail('the fflate import/global does not appear in the generated userscript.');
if (code.includes('// @downloadURL')) fail('Greasy Fork build should not advertise an alternate download URL.');
if (code.includes('// @updateURL')) fail('Greasy Fork build should not advertise an alternate update URL.');
if (!code.includes('Bundled dependency source information') || !code.includes('fflate')) fail('bundled dependency source/version notice is missing.');
if (!fs.existsSync(cssResourceFile)) fail('dist/yomu.css is missing; docs and extension builds still ship the reader stylesheet as a local asset.');
const cssResource = fs.readFileSync(cssResourceFile, 'utf8');
for (const selector of [
  '.jpdb-reader-popover',
  '.jpdb-reader-popover.jpdb-reader-sheet',
  '.jpdb-reader-word-highlight-pitch',
  '.jpdb-ocr-layer',
]) {
  if (!cssResource.includes(selector)) fail(`dist/yomu.css is missing required reader selector: ${selector}`);
}
if (!code.includes('(function ()')) {
  fail('userscript should be bundled as a plain readable IIFE.');
}
if (lines.length < MIN_READABLE_LINE_COUNT || maxLineLength > MAX_READABLE_LINE_LENGTH) {
  fail(`dist/yomu.user.js looks minified or unreadable (${lines.length.toLocaleString()} lines, longest line ${maxLineLength.toLocaleString()} chars). Greasy Fork requires non-minified code.`);
}
if (size > GREASY_FORK_SIZE_LIMIT_BYTES) {
  fail(`dist/yomu.user.js is ${size.toLocaleString()} bytes, over Greasy Fork's 2 MB script limit (${GREASY_FORK_SIZE_LIMIT_BYTES.toLocaleString()} bytes).`);
}
if (size > GREASY_FORK_SIZE_LIMIT_BYTES * SIZE_WARNING_RATIO) {
  console.warn(`Warning: dist/yomu.user.js is ${size.toLocaleString()} bytes, above 90% of Greasy Fork's 2 MB script limit.`);
}

console.log(`Verified ${file} (${size.toLocaleString()} bytes, ${lines.length.toLocaleString()} lines)`);

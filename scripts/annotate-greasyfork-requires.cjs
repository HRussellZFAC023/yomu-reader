#!/usr/bin/env node
const { createHash } = require('node:crypto');
const path = require('node:path');
const {
  GREASY_FORK_LIBRARIES,
  greasyForkLibraryPath,
  greasyForkLibraryUrl,
  readerCssResourceUrl,
} = require('./lib/greasyfork-libraries.cjs');
const {
  DIST_READER_CSS_PATH,
  DIST_USERSCRIPT_PATH,
  ROOT,
  fail,
  fileExists,
  readBuiltUserscript,
  readText,
  writeText,
} = require('./lib/userscript-build-utils.cjs');

let code = readBuiltUserscript();

for (const library of GREASY_FORK_LIBRARIES) {
  const relativePath = greasyForkLibraryPath(library.fileName);
  const libraryFile = path.join(ROOT, 'dist', relativePath);
  if (!fileExists(libraryFile)) fail(`${relativePath} is missing. Run node scripts/build-greasyfork-libraries.mjs first.`);
  const url = greasyForkLibraryUrl(library.fileName);
  // Greasy Fork only accepts external @require URLs that carry a subresource
  // integrity fragment in its own `#sha256=<base64>` format; without it every
  // listing sync is rejected as "unapproved external script".
  const sriUrl = `${url}#sha256=${sha256Base64(readText(libraryFile))}`;
  const pattern = new RegExp(`(^// @require\\s+)${escapeRegExp(url)}(?:#[^\\s]+)?$`, 'm');
  if (!pattern.test(code)) fail(`dist/yomu.user.js is missing @require metadata for ${url}.`);
  code = code.replace(pattern, `$1${sriUrl}`);
}

annotateReaderCssResource();

writeText(DIST_USERSCRIPT_PATH, code);
console.log(`Annotated ${DIST_USERSCRIPT_PATH} Greasy Fork companion @require URLs and the yomuCss @resource with SRI hashes.`);

function annotateReaderCssResource() {
  // Tampermonkey verifies @resource content against a URL hash fragment the
  // same way it does @require (see "Subresource Integrity" in the @resource
  // docs at tampermonkey.net/documentation.php). Annotated last, after
  // build-reader-css.mjs has written the final dist/yomu.css, so the hash
  // matches the served file byte-for-byte.
  if (!fileExists(DIST_READER_CSS_PATH)) fail('dist/yomu.css is missing. Run node scripts/build-reader-css.mjs first.');
  const url = readerCssResourceUrl();
  const sriUrl = `${url}#sha256=${sha256Base64(readText(DIST_READER_CSS_PATH))}`;
  const pattern = new RegExp(`(^// @resource\\s+yomuCss\\s+)${escapeRegExp(url)}(?:#[^\\s]+)?$`, 'm');
  if (!pattern.test(code)) fail(`dist/yomu.user.js is missing @resource metadata for ${url}.`);
  code = code.replace(pattern, `$1${sriUrl}`);
}

function sha256Base64(value) {
  return createHash('sha256').update(value).digest('base64');
}

function escapeRegExp(value) {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

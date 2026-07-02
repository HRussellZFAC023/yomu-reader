#!/usr/bin/env node
const { createHash } = require('node:crypto');
const path = require('node:path');
const {
  GREASY_FORK_LIBRARIES,
  greasyForkLibraryPath,
  greasyForkLibraryUrl,
} = require('./lib/greasyfork-libraries.cjs');
const {
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

writeText(DIST_USERSCRIPT_PATH, code);
console.log(`Annotated ${DIST_USERSCRIPT_PATH} Greasy Fork companion @require URLs with SRI hashes.`);

function sha256Base64(value) {
  return createHash('sha256').update(value).digest('base64');
}

function escapeRegExp(value) {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

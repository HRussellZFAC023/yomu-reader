#!/usr/bin/env node
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
  const pattern = new RegExp(`(^// @require\\s+)${escapeRegExp(url)}(?:#[^\\s]+)?$`, 'm');
  if (!pattern.test(code)) fail(`dist/yomu.user.js is missing @require metadata for ${url}.`);
  code = code.replace(pattern, `$1${url}`);
}

writeText(DIST_USERSCRIPT_PATH, code);
console.log(`Normalized ${DIST_USERSCRIPT_PATH} Greasy Fork companion @require URLs.`);

function escapeRegExp(value) {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

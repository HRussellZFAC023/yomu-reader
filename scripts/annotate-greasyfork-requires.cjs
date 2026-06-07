#!/usr/bin/env node
const { createHash } = require('node:crypto');
const path = require('node:path');
const {
  GREASY_FORK_LIBRARIES,
  greasyForkLibraryPath,
  greasyForkLibraryUrl,
} = require('./greasyfork-libraries.cjs');
const {
  DIST_USERSCRIPT_PATH,
  ROOT,
  fail,
  fileExists,
  readBuiltUserscript,
  readText,
  writeText,
} = require('./userscript-build-utils.cjs');

let code = readBuiltUserscript();

for (const library of GREASY_FORK_LIBRARIES) {
  const relativePath = greasyForkLibraryPath(library.fileName);
  const libraryFile = path.join(ROOT, 'dist', relativePath);
  if (!fileExists(libraryFile)) fail(`${relativePath} is missing. Run node scripts/build-greasyfork-libraries.mjs first.`);
  const url = greasyForkLibraryUrl(library.fileName);
  const sriUrl = `${url}#${sha256Sri(readText(libraryFile))}`;
  const pattern = new RegExp(`(^// @require\\s+)${escapeRegExp(url)}(?:#[^\\s]+)?$`, 'm');
  if (!pattern.test(code)) fail(`dist/yomu.user.js is missing @require metadata for ${url}.`);
  code = code.replace(pattern, `$1${sriUrl}`);
}

writeText(DIST_USERSCRIPT_PATH, code);
console.log(`Annotated ${DIST_USERSCRIPT_PATH} with Greasy Fork companion SRI hashes.`);

function sha256Sri(value) {
  return `sha256-${createHash('sha256').update(value).digest('base64')}`;
}

function escapeRegExp(value) {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

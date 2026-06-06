#!/usr/bin/env node
const esbuild = require('esbuild');
const {
  DIST_USERSCRIPT_PATH,
  byteLengthUtf8,
  formatCount,
  readBuiltUserscript,
  writeText,
} = require('./userscript-build-utils.cjs');

const original = readBuiltUserscript();
const compacted = compactGeneratedUserscript(original);

if (compacted === original) {
  console.log('Userscript generated whitespace is already compact.');
  process.exit(0);
}

writeText(DIST_USERSCRIPT_PATH, compacted);
const saved = byteLengthUtf8(original) - byteLengthUtf8(compacted);
console.log(`Compacted generated userscript whitespace in ${DIST_USERSCRIPT_PATH} (saved ${formatCount(saved)} bytes).`);

function compactGeneratedUserscript(code) {
  const bodyStart = code.indexOf('(function');
  if (bodyStart === -1) return code;
  const header = compactGeneratedLineIndent(code.slice(0, bodyStart));
  const body = code.slice(bodyStart);
  try {
    const transformed = compactGeneratedBody(body);
    const normalized = compactGeneratedBody(transformed);
    return `${header}${compactGeneratedLineIndent(normalized)}`;
  } catch {
    return code;
  }
}

function compactGeneratedBody(code) {
  return esbuild.transformSync(code, {
    loader: 'js',
    charset: 'utf8',
    minifyWhitespace: true,
    minifyIdentifiers: false,
    minifySyntax: true,
    legalComments: 'none',
    lineLimit: 242,
  }).code.replace('(function(){', '(function (){');
}

function compactGeneratedLineIndent(code) {
  return code.replace(/\n[ \t]+/g, '\n');
}

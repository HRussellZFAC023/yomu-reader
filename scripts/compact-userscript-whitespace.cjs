#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const file = path.join(__dirname, '..', 'dist', 'yomu.user.js');
const original = fs.readFileSync(file, 'utf8');
const MAX_COMPACTION_PASSES = 4;
let compacted = original;
let passes = 0;

for (; passes < MAX_COMPACTION_PASSES; passes += 1) {
  const next = compactGeneratedWhitespace(compacted);
  if (next === compacted) break;
  compacted = next;
}

if (compacted === original) {
  console.log('Userscript generated whitespace is already compact.');
  process.exit(0);
}

fs.writeFileSync(file, compacted);
const saved = Buffer.byteLength(original, 'utf8') - Buffer.byteLength(compacted, 'utf8');
console.log(`Compacted generated userscript whitespace in ${file} over ${passes.toLocaleString()} pass${passes === 1 ? '' : 'es'} (saved ${saved.toLocaleString()} bytes).`);

function compactGeneratedWhitespace(code) {
  const bodyStart = code.indexOf('(function');
  if (bodyStart === -1) return code;
  const header = code.slice(0, bodyStart);
  const body = code.slice(bodyStart);
  try {
    const transformed = esbuild.transformSync(body, {
      loader: 'js',
      charset: 'utf8',
      minifyWhitespace: true,
      minifyIdentifiers: false,
      minifySyntax: false,
      legalComments: 'none',
      lineLimit: 500,
    }).code.replace('(function(){', '(function (){');
    return `${header}${transformed}`;
  } catch {
    return code;
  }
}

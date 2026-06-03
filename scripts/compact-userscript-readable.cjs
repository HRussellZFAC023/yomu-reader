#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const file = path.join(__dirname, '..', 'dist', 'yomu.user.js');
const original = fs.readFileSync(file, 'utf8');
const compacted = compactReadableIndent(original);

if (compacted === original) {
  console.log('Userscript readable indentation already compact.');
  process.exit(0);
}

fs.writeFileSync(file, compacted);
const saved = Buffer.byteLength(original, 'utf8') - Buffer.byteLength(compacted, 'utf8');
console.log(`Compacted readable userscript indentation in ${file} (saved ${saved.toLocaleString()} bytes).`);

function compactReadableIndent(code) {
  let inTemplate = false;
  const indentationCompacted = code.split('\n').map(line => {
    const wasInTemplate = inTemplate;
    const nextLine = wasInTemplate ? line : compactLineIndent(line);
    inTemplate = templateStateAfterLine(line, inTemplate);
    return nextLine;
  }).join('\n');
  return compactBodyWhitespace(indentationCompacted);
}

function compactLineIndent(line) {
  return line.replace(/^ +/u, '');
}

function compactBodyWhitespace(code) {
  const bodyStart = code.indexOf('(function');
  if (bodyStart === -1) return code;
  const header = code.slice(0, bodyStart);
  const body = code.slice(bodyStart);
  try {
    // Keep identifiers intact for Greasy Fork review, but allow syntax folding
    // so release builds stay as compact as possible without obfuscation.
    const transformed = esbuild.transformSync(body, {
      loader: 'js',
      charset: 'utf8',
      minifyWhitespace: true,
      minifyIdentifiers: false,
      minifySyntax: true,
      legalComments: 'none',
      lineLimit: 2000,
    }).code.replace('(function(){', '(function (){');
    return `${header}${transformed}`;
  } catch {
    return code;
  }
}

function templateStateAfterLine(line, initialState) {
  let inTemplate = initialState;
  let escaped = false;
  for (const char of line) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === '`') inTemplate = !inTemplate;
  }
  return inTemplate;
}

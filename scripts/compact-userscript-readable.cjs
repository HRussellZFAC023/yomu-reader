#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

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
  return code.split('\n').map(line => {
    const wasInTemplate = inTemplate;
    const nextLine = wasInTemplate ? line : compactLineIndent(line);
    inTemplate = templateStateAfterLine(line, inTemplate);
    return nextLine;
  }).join('\n');
}

function compactLineIndent(line) {
  return line.replace(/^( {2,})/u, spaces => ' '.repeat(Math.max(1, Math.ceil(spaces.length / 2))));
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

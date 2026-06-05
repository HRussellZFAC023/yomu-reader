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
const MAX_COMPACTION_PASSES = 4;
const MAX_READABLE_LINE_LENGTH = 1_800;
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

writeText(DIST_USERSCRIPT_PATH, compacted);
const saved = byteLengthUtf8(original) - byteLengthUtf8(compacted);
console.log(`Compacted generated userscript whitespace in ${DIST_USERSCRIPT_PATH} over ${formatCount(passes)} pass${passes === 1 ? '' : 'es'} (saved ${formatCount(saved)} bytes).`);

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
      lineLimit: 480,
    }).code.replace('(function(){', '(function (){');
    return `${header}${splitLongGeneratedLines(transformed, MAX_READABLE_LINE_LENGTH)}`;
  } catch {
    return code;
  }
}

function splitLongGeneratedLines(code, maxLength) {
  return code
    .split('\n')
    .flatMap(line => splitLongGeneratedLine(line, maxLength))
    .join('\n');
}

function splitLongGeneratedLine(line, maxLength) {
  if (line.length <= maxLength) return [line];
  const parts = [];
  let start = 0;
  let quote = '';
  let escaped = false;
  let parenDepth = 0;
  let braceDepth = 0;
  let bracketDepth = 0;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = '';
      }
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '(') parenDepth += 1;
    else if (char === ')') parenDepth = Math.max(0, parenDepth - 1);
    else if (char === '{') braceDepth += 1;
    else if (char === '}') braceDepth = Math.max(0, braceDepth - 1);
    else if (char === '[') bracketDepth += 1;
    else if (char === ']') bracketDepth = Math.max(0, bracketDepth - 1);
    if (
      char === ';'
      && parenDepth === 0
      && braceDepth === 0
      && bracketDepth === 0
      && index - start >= maxLength / 2
    ) {
      parts.push(line.slice(start, index + 1));
      start = index + 1;
    }
  }
  parts.push(line.slice(start));
  return parts;
}

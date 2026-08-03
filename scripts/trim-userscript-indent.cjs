const fs = require('node:fs');
const path = require('node:path');
const { DIST_USERSCRIPT_PATH, ROOT, fileExists, readText, writeText } = require('./lib/userscript-build-utils.cjs');
const COMPACT_INDENT_MARKER = '// yomu-generated-indent: compact';

if (require.main === module) {
  for (const filePath of generatedScriptPaths()) {
    const code = readText(filePath);
    const compactInjectedIndent = filePath === DIST_USERSCRIPT_PATH
      || path.basename(filePath) === 'yomu-runtime.user.js';
    const trimmed = trimGeneratedEmptyCopyRows(
      filePath.endsWith('.user.js')
        ? trimCommonWrapperIndent(code, compactInjectedIndent)
        : code,
    );

    if (trimmed !== code) writeText(filePath, trimmed);
  }
}

function generatedScriptPaths() {
  const greasyForkDir = path.join(ROOT, 'dist', 'greasyfork');
  return [
    DIST_USERSCRIPT_PATH,
    path.join(ROOT, 'dist', 'newtab', 'app.js'),
    ...(
      fileExists(greasyForkDir)
        ? fs.readdirSync(greasyForkDir)
          .filter(name => name.endsWith('.user.js'))
          .map(name => path.join(greasyForkDir, name))
        : []
    ),
  ].filter(fileExists);
}

function trimGeneratedEmptyCopyRows(source) {
  return source.replace(/^([A-Za-z][A-Za-z0-9_]*)\t[ \t]*$/gm, '$1');
}

function trimCommonWrapperIndent(source, compactInjectedIndent = false) {
  if (compactInjectedIndent && (
    source.includes(COMPACT_INDENT_MARKER)
    // Backward compatibility for an already-compacted runtime built before
    // the explicit marker was introduced.
    || /^\(function\(\) \{\n"use strict";\n/.test(source)
  )) return source;
  let state = 'code';
  let escaped = false;
  let blockComment = false;
  const trimmed = source.split('\n').map(line => {
    const inTemplateAtLineStart = state === 'template';
    const nextLine = trimmedGeneratedLine(line, inTemplateAtLineStart, compactInjectedIndent);
    scanLine(nextLine);
    return nextLine;
  }).join('\n');
  return compactInjectedIndent ? stampCompactIndentMarker(trimmed) : trimmed;

  function scanLine(line) {
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      const next = line[index + 1];
      if (blockComment) {
        if (char === '*' && next === '/') {
          blockComment = false;
          index += 1;
        }
        continue;
      }
      if (state === 'code') {
        if (char === '/' && next === '/') break;
        if (char === '/' && next === '*') {
          blockComment = true;
          index += 1;
          continue;
        }
        if (char === '"' || char === "'" || char === '`') {
          state = char === '`' ? 'template' : char;
          escaped = false;
        }
        continue;
      }
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if ((state === '"' && char === '"') || (state === "'" && char === "'") || (state === 'template' && char === '`')) {
        state = 'code';
      }
    }
  }
}

// This generated-code transform keeps each indentation case explicit; source
// templates deliberately bypass every rewrite.
// fallow-ignore-next-line complexity
function trimmedGeneratedLine(line, inTemplate, compactInjectedIndent) {
  if (inTemplate) return line;
  let trimmed = line.startsWith('  ') ? line.slice(2) : line;
  if (trimmed.startsWith('    ')) trimmed = trimmed.slice(2);
  // The core and aggregate runtime are the two scripts injected on every
  // page. Compact generated indentation without touching template-literal
  // content, while retaining at least one leading space on every nested line.
  // This keeps the readable line structure and avoids bytes every page parses.
  if (compactInjectedIndent && trimmed.startsWith(' ')) {
    const removable = trimmed.startsWith('    ') ? 3 : (trimmed.startsWith('   ') ? 2 : 1);
    trimmed = trimmed.slice(removable);
  }
  return trimmed;
}

function stampCompactIndentMarker(source) {
  return source.replace(
    /(^|\n)(["']use strict["'];\n)/,
    `$1$2${COMPACT_INDENT_MARKER}\n`,
  );
}

module.exports = { trimCommonWrapperIndent };

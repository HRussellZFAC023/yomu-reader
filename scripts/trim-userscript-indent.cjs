const fs = require('node:fs');
const path = require('node:path');
const { DIST_USERSCRIPT_PATH, ROOT, fileExists, readText, writeText } = require('./lib/userscript-build-utils.cjs');

if (require.main === module) {
  for (const filePath of generatedScriptPaths()) {
    const code = readText(filePath);
    const trimmed = trimGeneratedEmptyCopyRows(
      filePath.endsWith('.user.js')
        ? trimCommonWrapperIndent(code, path.basename(filePath) === 'yomu-runtime.user.js')
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

function trimCommonWrapperIndent(source, compactRuntimeIndent = false) {
  if (compactRuntimeIndent && /^\(function\(\) \{\n"use strict";\n/.test(source)) return source;
  let state = 'code';
  let escaped = false;
  let blockComment = false;
  return source.split('\n').map(line => {
    const inTemplateAtLineStart = state === 'template';
    const nextLine = trimmedGeneratedLine(line, inTemplateAtLineStart, compactRuntimeIndent);
    scanLine(nextLine);
    return nextLine;
  }).join('\n');

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
function trimmedGeneratedLine(line, inTemplate, compactRuntimeIndent) {
  if (inTemplate) return line;
  let trimmed = line.startsWith('  ') ? line.slice(2) : line;
  if (trimmed.startsWith('    ')) trimmed = trimmed.slice(2);
  // The aggregate runtime is the only unconditional companion, so compact
  // one generated leading space at the first level and two at deeper levels,
  // without touching template-literal content. Nested code stays visibly
  // indented while avoiding bytes that every installed page would parse.
  if (compactRuntimeIndent && trimmed.startsWith(' ')) {
    trimmed = trimmed.slice(trimmed.startsWith('   ') ? 2 : 1);
  }
  return trimmed;
}

module.exports = { trimCommonWrapperIndent };

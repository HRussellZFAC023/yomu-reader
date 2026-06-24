const fs = require('node:fs');
const path = require('node:path');
const { DIST_USERSCRIPT_PATH, ROOT, fileExists, readText, writeText } = require('./lib/userscript-build-utils.cjs');

for (const filePath of generatedScriptPaths()) {
  const code = readText(filePath);
  const trimmed = trimGeneratedEmptyCopyRows(filePath === DIST_USERSCRIPT_PATH ? trimCommonWrapperIndent(code) : code);

  if (trimmed !== code) writeText(filePath, trimmed);
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

function trimCommonWrapperIndent(source) {
  let state = 'code';
  let escaped = false;
  let blockComment = false;
  return source.split('\n').map(line => {
    const inTemplateAtLineStart = state === 'template';
    const nextLine = !inTemplateAtLineStart && line.startsWith('  ') ? line.slice(2) : line;
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

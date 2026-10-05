const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { DIST_USERSCRIPT_PATH, ROOT, fileExists, readText, writeText } = require('./lib/userscript-build-utils.cjs');
const COMPACT_INDENT_MARKER = '// yomu-generated-indent: compact';
// Tokens whose text the indentation trim must never touch.
const LITERAL_KINDS = new Set([
  ts.SyntaxKind.StringLiteral,
  ts.SyntaxKind.RegularExpressionLiteral,
  ts.SyntaxKind.NoSubstitutionTemplateLiteral,
  ts.SyntaxKind.TemplateHead,
  ts.SyntaxKind.TemplateMiddle,
  ts.SyntaxKind.TemplateTail,
]);

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
  const literals = literalRanges(source);
  const lines = source.split('\n');
  let lineStart = 0;
  let literal = 0;
  const trimmed = lines.map(line => {
    while (literal < literals.length && literals[literal][1] <= lineStart) literal += 1;
    const inLiteral = literal < literals.length && literals[literal][0] < lineStart;
    const nextLine = trimmedGeneratedLine(line, inLiteral, compactInjectedIndent);
    lineStart += line.length + 1;
    return nextLine;
  }).join('\n');
  assertLiteralsUnchanged(source, trimmed);
  return compactInjectedIndent ? stampCompactIndentMarker(trimmed) : trimmed;
}

/**
 * [start, end) of every string, regex and template-literal token, in source
 * order, from a real parser: a character scanner cannot tell a regex such as
 * /["\\]/g from a string opening, and once out of step it rewrote template
 * text depending on unrelated code above it.
 */
function literalRanges(source) {
  const file = ts.createSourceFile('generated.js', source, ts.ScriptTarget.Latest, false, ts.ScriptKind.JS);
  const diagnostic = file.parseDiagnostics?.[0];
  if (diagnostic) {
    const { line, character } = file.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
    throw new Error(`trim-userscript-indent: cannot parse generated code at ${line + 1}:${character + 1}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ')}`);
  }
  const ranges = [];
  const visit = node => {
    if (LITERAL_KINDS.has(node.kind)) ranges.push([node.getStart(file), node.end]);
    ts.forEachChild(node, visit);
  };
  visit(file);
  return ranges.sort((left, right) => left[0] - right[0]);
}

// The build check: indentation trimming may only touch code, never the text
// of a string, regex or template literal.
function assertLiteralsUnchanged(before, after) {
  const texts = source => literalRanges(source).map(([start, end]) => source.slice(start, end));
  const expected = texts(before);
  const actual = texts(after);
  const index = expected.findIndex((text, position) => text !== actual[position]);
  if (expected.length !== actual.length || index >= 0) {
    throw new Error(`trim-userscript-indent changed literal ${index >= 0 ? index : expected.length} of ${expected.length}: ${JSON.stringify((expected[index] ?? '').slice(0, 80))}`);
  }
}

// This generated-code transform keeps each indentation case explicit; lines
// that start inside a literal deliberately bypass every rewrite.
// fallow-ignore-next-line complexity
function trimmedGeneratedLine(line, inLiteral, compactInjectedIndent) {
  if (inLiteral) return line;
  let trimmed = line.startsWith('  ') ? line.slice(2) : line;
  if (trimmed.startsWith('    ')) trimmed = trimmed.slice(2);
  // The core and aggregate runtime are the two scripts injected on every
  // page. Remove generated indentation completely without touching
  // template-literal content so learners do not parse formatting bytes on
  // every page.
  if (compactInjectedIndent && trimmed.startsWith(' ')) {
    trimmed = trimmed.replace(/^ +/, '');
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

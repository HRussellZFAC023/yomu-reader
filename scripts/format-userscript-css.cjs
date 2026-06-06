#!/usr/bin/env node
const {
  DIST_USERSCRIPT_PATH,
  USERSCRIPT_RELATIVE_PATH,
  readBuiltUserscript,
  writeText,
} = require('./userscript-build-utils.cjs');

const code = readBuiltUserscript();
const SIMPLE_ESCAPES = {
  "'": "'",
  '"': '"',
  '\\': '\\',
  b: '\b',
  f: '\f',
  n: '\n',
  r: '\r',
  t: '\t',
  v: '\v',
  0: '\0',
};

let replacements = 0;
const formatted = code.replace(/\bconst\s+([A-Za-z_$][\w$]*Css)\s*=\s*('(?:\\.|[^'\\])*');/g, (match, name, literal) => {
  const css = parseSingleQuotedStringLiteral(literal);
  if (css === null) return match;
  const readableCss = css.includes('\n') ? css : css.replace(/}/g, '}\n').trim();
  replacements += 1;
  return `const ${name} = \`\n${escapeTemplateLiteral(readableCss)}\n\`;`;
});

if (replacements === 0) {
  console.log(`No inline CSS literals needed formatting in ${USERSCRIPT_RELATIVE_PATH}.`);
  process.exit(0);
}

writeText(DIST_USERSCRIPT_PATH, formatted);
console.log(`Formatted ${replacements} inline CSS literal(s) in ${DIST_USERSCRIPT_PATH}`);

function escapeTemplateLiteral(value) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
}

function parseSingleQuotedStringLiteral(literal) {
  if (!isSingleQuotedStringLiteral(literal)) return null;
  let value = '';
  let index = 1;
  const end = literal.length - 1;
  while (index < end) {
    const decoded = readStringLiteralChar(literal, index, end);
    if (!decoded) return null;
    value += decoded.value;
    index = decoded.nextIndex;
  }
  return value;
}

function isSingleQuotedStringLiteral(literal) {
  return literal.startsWith("'") && literal.endsWith("'");
}

function readStringLiteralChar(literal, index, end) {
  if (literal[index] !== '\\') return { value: literal[index], nextIndex: index + 1 };
  return readEscapedStringLiteralChar(literal, index + 1, end);
}

function readEscapedStringLiteralChar(literal, index, end) {
  if (index >= end) return null;
  const lineContinuation = readLineContinuation(literal, index);
  if (lineContinuation) return lineContinuation;
  const decoded = decodeStringEscape(literal, index);
  return decoded ? { value: decoded.value, nextIndex: decoded.index + 1 } : null;
}

function readLineContinuation(literal, index) {
  if (literal[index] === '\n') return { value: '', nextIndex: index + 1 };
  if (literal[index] === '\r') return { value: '', nextIndex: literal[index + 1] === '\n' ? index + 2 : index + 1 };
  return null;
}

function decodeStringEscape(literal, index) {
  const escaped = literal[index];
  if (Object.prototype.hasOwnProperty.call(SIMPLE_ESCAPES, escaped)) return { value: SIMPLE_ESCAPES[escaped], index };
  if (escaped === 'x') return decodeHexEscape(literal, index);
  if (escaped === 'u') return decodeUnicodeEscape(literal, index);
  return { value: escaped, index };
}

function decodeHexEscape(literal, index) {
  const hex = literal.slice(index + 1, index + 3);
  if (!isFixedHex(hex, 2)) return null;
  return { value: String.fromCharCode(Number.parseInt(hex, 16)), index: index + 2 };
}

function decodeUnicodeEscape(literal, index) {
  if (literal[index + 1] === '{') return decodeCodePointEscape(literal, index);
  const hex = literal.slice(index + 1, index + 5);
  if (!isFixedHex(hex, 4)) return null;
  return { value: String.fromCharCode(Number.parseInt(hex, 16)), index: index + 4 };
}

function decodeCodePointEscape(literal, index) {
  const end = literal.indexOf('}', index + 2);
  if (end === -1) return null;
  const codePoint = literal.slice(index + 2, end);
  if (!isHex(codePoint)) return null;
  return { value: String.fromCodePoint(Number.parseInt(codePoint, 16)), index: end };
}

function isFixedHex(value, length) {
  return value.length === length && isHex(value);
}

function isHex(value) {
  return /^[0-9a-fA-F]+$/.test(value);
}

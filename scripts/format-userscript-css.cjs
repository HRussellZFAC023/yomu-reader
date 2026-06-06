#!/usr/bin/env node
const {
  DIST_USERSCRIPT_PATH,
  USERSCRIPT_RELATIVE_PATH,
  readBuiltUserscript,
  writeText,
} = require('./userscript-build-utils.cjs');

const code = readBuiltUserscript();

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
  if (!literal.startsWith("'") || !literal.endsWith("'")) return null;
  let value = '';
  for (let index = 1; index < literal.length - 1; index += 1) {
    const char = literal[index];
    if (char !== '\\') {
      value += char;
      continue;
    }

    index += 1;
    if (index >= literal.length - 1) return null;
    const escaped = literal[index];
    if (escaped === '\n') continue;
    if (escaped === '\r') {
      if (literal[index + 1] === '\n') index += 1;
      continue;
    }
    const decoded = decodeStringEscape(literal, index);
    if (!decoded) return null;
    value += decoded.value;
    index = decoded.index;
  }
  return value;
}

function decodeStringEscape(literal, index) {
  const escaped = literal[index];
  const simpleEscapes = {
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
  if (Object.prototype.hasOwnProperty.call(simpleEscapes, escaped)) {
    return { value: simpleEscapes[escaped], index };
  }
  if (escaped === 'x') {
    const hex = literal.slice(index + 1, index + 3);
    if (!/^[0-9a-fA-F]{2}$/.test(hex)) return null;
    return { value: String.fromCharCode(Number.parseInt(hex, 16)), index: index + 2 };
  }
  if (escaped === 'u') return decodeUnicodeEscape(literal, index);
  return { value: escaped, index };
}

function decodeUnicodeEscape(literal, index) {
  if (literal[index + 1] === '{') {
    const end = literal.indexOf('}', index + 2);
    if (end === -1) return null;
    const codePoint = literal.slice(index + 2, end);
    if (!/^[0-9a-fA-F]+$/.test(codePoint)) return null;
    return { value: String.fromCodePoint(Number.parseInt(codePoint, 16)), index: end };
  }
  const hex = literal.slice(index + 1, index + 5);
  if (!/^[0-9a-fA-F]{4}$/.test(hex)) return null;
  return { value: String.fromCharCode(Number.parseInt(hex, 16)), index: index + 4 };
}

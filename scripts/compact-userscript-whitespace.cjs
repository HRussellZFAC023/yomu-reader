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
const ESBUILD_LINE_LIMIT = 210;
const MAX_READABLE_LINE_LENGTH = 1_000;
const MIN_SPLIT_SEGMENT_LENGTH = 160;
const READABLE_SPLIT_CHARS = new Set([',', ';']);
const COMMENT_START_CHARS = new Set(['/', '*']);
const READABLE_SPLIT_STATE_HANDLERS = [
  consumeQuotedCharacter,
  consumeRegexCharacter,
  startQuotedCharacter,
  startRegexLiteral,
];
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
      minifySyntax: true,
      legalComments: 'none',
      lineLimit: ESBUILD_LINE_LIMIT,
    }).code.replace('(function(){', '(function (){');
    return splitReadableGeneratedLines(
      `${compactGeneratedLineIndent(header)}${compactGeneratedLineIndent(transformed)}`,
      MAX_READABLE_LINE_LENGTH,
    );
  } catch {
    return code;
  }
}

function compactGeneratedLineIndent(code) {
  return code.replace(/\n[ \t]+/g, '\n');
}

function splitReadableGeneratedLines(code, maxLength) {
  return code
    .split('\n')
    .flatMap(line => splitReadableGeneratedLine(line, maxLength))
    .join('\n');
}

function splitReadableGeneratedLine(line, maxLength) {
  if (line.length <= maxLength) return [line];
  const state = {
    line,
    parts: [],
    start: 0,
    index: 0,
    quote: '',
    escaped: false,
    inRegex: false,
    regexClass: false,
    previousSignificant: '',
  };

  for (; state.index < line.length; state.index += 1) {
    advanceReadableSplitState(state);
  }

  state.parts.push(line.slice(state.start));
  return state.parts;
}

function advanceReadableSplitState(state) {
  const char = state.line[state.index];
  if (handleReadableSplitState(state, char)) return;
  updatePreviousSignificant(state, char);
  splitAtReadablePunctuation(state, char);
}

function handleReadableSplitState(state, char) {
  for (const handler of READABLE_SPLIT_STATE_HANDLERS) {
    if (handler(state, char)) return true;
  }
  return false;
}

function consumeQuotedCharacter(state, char) {
  if (!state.quote) return false;
  updateEscapedDelimitedState(state, char, state.quote);
  return true;
}

function consumeRegexCharacter(state, char) {
  if (!state.inRegex) return false;
  updateRegexLiteralState(state, char);
  return true;
}

function updateEscapedDelimitedState(state, char, delimiter) {
  if (consumeEscapedCharacter(state, char)) return;
  if (char === delimiter) state.quote = '';
}

function updateRegexLiteralState(state, char) {
  if (consumeEscapedCharacter(state, char)) return;
  if (updateRegexCharacterClass(state, char)) return;
  if (isRegexTerminator(state, char)) finishRegexLiteral(state);
}

function consumeEscapedCharacter(state, char) {
  if (state.escaped) {
    state.escaped = false;
    return true;
  }
  if (char !== '\\') return false;
  state.escaped = true;
  return true;
}

function updateRegexCharacterClass(state, char) {
  if (char === '[') {
    state.regexClass = true;
    return true;
  }
  if (char === ']') {
    state.regexClass = false;
    return true;
  }
  return false;
}

function isRegexTerminator(state, char) {
  return char === '/' && !state.regexClass;
}

function finishRegexLiteral(state) {
  state.inRegex = false;
  while (/[a-z]/i.test(state.line[state.index + 1] ?? '')) state.index += 1;
}

function startQuotedCharacter(state, char) {
  if (char !== '"' && char !== "'" && char !== '`') return false;
  state.quote = char;
  return true;
}

function startRegexLiteral(state, char) {
  if (char !== '/') return false;
  if (startsComment(state)) return false;
  if (!canStartRegex(state.previousSignificant)) return false;
  state.inRegex = true;
  return true;
}

function startsComment(state) {
  return COMMENT_START_CHARS.has(state.line[state.index + 1] ?? '');
}

function updatePreviousSignificant(state, char) {
  if (!/\s/.test(char)) state.previousSignificant = char;
}

function splitAtReadablePunctuation(state, char) {
  if (!READABLE_SPLIT_CHARS.has(char)) return;
  if (state.index + 1 - state.start < MIN_SPLIT_SEGMENT_LENGTH) return;
  state.parts.push(state.line.slice(state.start, state.index + 1));
  state.start = state.index + 1;
}

function canStartRegex(previousSignificant) {
  return !previousSignificant || '([{=,:;!?&|+-*%^~<>'.includes(previousSignificant);
}

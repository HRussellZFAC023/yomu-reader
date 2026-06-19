#!/usr/bin/env node
const { DIST_USERSCRIPT_PATH, readText } = require('./lib/userscript-build-utils.cjs');
const { writeFileSync } = require('node:fs');

const PURE_ANNOTATION_RE = /\/\* @__PURE__ \*\/\s*/g;
const LINE_START_CONST_RE = /^(\s*)(const\b|for \(const\b)/gm;
const source = readText(DIST_USERSCRIPT_PATH);
let removedPureAnnotations = 0;
let softenedConstDeclarations = 0;
const stripped = source.replace(PURE_ANNOTATION_RE, () => {
  removedPureAnnotations += 1;
  return '';
}).replace(LINE_START_CONST_RE, (_match, indent, keyword) => {
  softenedConstDeclarations += 1;
  return `${indent}${keyword.replace('const', 'let')}`;
});

if (stripped !== source) {
  writeFileSync(DIST_USERSCRIPT_PATH, stripped);
  console.log(`Compacted ${DIST_USERSCRIPT_PATH}: removed ${removedPureAnnotations} pure annotations and softened ${softenedConstDeclarations} generated const declarations.`);
}

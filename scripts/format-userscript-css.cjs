#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');

const file = path.join(__dirname, '..', 'dist', 'yomu.user.js');
const code = fs.readFileSync(file, 'utf8');

let replacements = 0;
const formatted = code.replace(/\bconst\s+([A-Za-z_$][\w$]*Css)\s*=\s*('(?:\\.|[^'\\])*');/g, (match, name, literal) => {
  const css = Function(`"use strict"; return ${literal};`)();
  if (typeof css !== 'string') return match;
  const readableCss = css.includes('\n') ? css : css.replace(/}/g, '}\n').trim();
  replacements += 1;
  return `const ${name} = \`\n${escapeTemplateLiteral(readableCss)}\n\`;`;
});

if (replacements === 0) {
  console.error('No inline CSS literals were formatted in dist/yomu.user.js.');
  process.exit(1);
}

fs.writeFileSync(file, formatted);
console.log(`Formatted ${replacements} inline CSS literal(s) in ${file}`);

function escapeTemplateLiteral(value) {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\$\{/g, '\\${');
}

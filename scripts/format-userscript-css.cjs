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
  const css = Function(`"use strict"; return ${literal};`)();
  if (typeof css !== 'string') return match;
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

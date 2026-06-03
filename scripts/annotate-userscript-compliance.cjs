#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const pkg = require('../package.json');

const file = path.join(__dirname, '..', 'dist', 'yomu.user.js');
const code = fs.readFileSync(file, 'utf8');
const endMarker = '// ==/UserScript==';
const markerIndex = code.indexOf(endMarker);

if (markerIndex === -1) {
  console.error('dist/yomu.user.js is missing the userscript metadata end marker.');
  process.exit(1);
}

if (code.includes('Bundled library source information')) {
  console.log('Userscript compliance notes already present.');
  process.exit(0);
}

const notice = `

/*
Greasy Fork compliance notes:
- Reader UI CSS is declared as @resource yomuCss; no external JavaScript is loaded.
- Bundled library source information:
  - fflate ${pkg.dependencies.fflate}: https://github.com/101arrowz/fflate (MIT)
*/
`;
const insertAt = markerIndex + endMarker.length;
const before = code.slice(0, insertAt);
const after = code.slice(insertAt).replace(/^\n+/, '\n');

// Guard a trailing external-global invocation so the bundle also loads outside userscript managers.
const guardedAfter = after.replace(/\}\)\(fflate\);\s*$/, '})(typeof fflate === "undefined" ? undefined : fflate);\n');

fs.writeFileSync(file, `${before}${notice}${guardedAfter}`);
console.log(`Annotated ${file} with Greasy Fork compliance notes.`);

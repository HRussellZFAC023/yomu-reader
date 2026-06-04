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

if (code.includes('Bundled dependency source information')) {
    console.log('Userscript compliance notes already present.');
    process.exit(0);
}

const notice = `

/*
Greasy Fork compliance notes:
- Reader UI CSS is declared as @resource yomuCss; no remote JavaScript is loaded.
- Bundled dependency source information:
  - fflate ${pkg.dependencies.fflate}: https://github.com/101arrowz/fflate (MIT), bundled locally for ZIP dictionary import support.
*/
`;
const insertAt = markerIndex + endMarker.length;
const before = code.slice(0, insertAt);
const after = code.slice(insertAt).replace(/^\n+/, '\n');

fs.writeFileSync(file, `${before}${notice}${after}`);
console.log(`Annotated ${file} with Greasy Fork compliance notes.`);

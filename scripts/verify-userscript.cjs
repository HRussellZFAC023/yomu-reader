const fs = require('node:fs');
const path = require('node:path');
const pkg = require('../package.json');

const file = path.join(__dirname, '..', 'dist', 'yomu.user.js');
const code = fs.readFileSync(file, 'utf8');
const fail = message => {
  console.error(message);
  process.exit(1);
};

if (!code.startsWith('// ==UserScript==')) fail('dist/yomu.user.js is missing a userscript metadata block.');
if (!code.includes(`// @version      ${pkg.version}`)) fail('userscript version does not match package.json.');
if (!code.includes('// @match        *://*/*')) fail('userscript match metadata is missing.');
if (!code.includes('// @grant        GM_xmlhttpRequest')) fail('GM_xmlhttpRequest grant is missing.');
if (code.includes('// @require')) fail('userscript must be self-contained and cannot use @require.');
if (!code.includes('(function ()')) fail('userscript should be bundled as a plain IIFE for Tampermonkey copy/paste.');

console.log(`Verified ${file}`);

#!/usr/bin/env node
const {
  BUNDLED_DEPENDENCY_NOTICE_MARKER,
  DIST_USERSCRIPT_PATH,
  USERSCRIPT_METADATA_END,
  fail,
  packageJson,
  readBuiltUserscript,
  writeText,
} = require('./userscript-build-utils.cjs');

const code = readBuiltUserscript();
const markerIndex = code.indexOf(USERSCRIPT_METADATA_END);

if (markerIndex === -1) {
  fail('dist/yomu.user.js is missing the userscript metadata end marker.');
}

if (code.includes(BUNDLED_DEPENDENCY_NOTICE_MARKER)) {
  console.log('Userscript compliance notes already present.');
  process.exit(0);
}

const notice = `

/* Bundled dependency source information: fflate*/
`;
const insertAt = markerIndex + USERSCRIPT_METADATA_END.length;
const before = code.slice(0, insertAt);
const after = code.slice(insertAt).replace(/^\n+/, '\n');

writeText(DIST_USERSCRIPT_PATH, `${before}${notice}${after}`);
console.log(`Annotated ${DIST_USERSCRIPT_PATH} with Greasy Fork compliance notes.`);

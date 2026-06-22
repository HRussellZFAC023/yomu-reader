#!/usr/bin/env node
const {
  BUNDLED_DEPENDENCY_NOTICE_MARKER,
  DIST_USERSCRIPT_PATH,
  USERSCRIPT_METADATA_END,
  fail,
  packageJson,
  readBuiltUserscript,
  writeText,
} = require('./lib/userscript-build-utils.cjs');

let code = readBuiltUserscript();
const markerIndex = code.indexOf(USERSCRIPT_METADATA_END);

if (markerIndex === -1) {
  fail('dist/yomu.user.js is missing the userscript metadata end marker.');
}

const notice = `

/* Bundled dependency source information: fflate*/
`;
const insertAt = markerIndex + USERSCRIPT_METADATA_END.length;
const before = code.slice(0, insertAt);
const hasNotice = code.includes(BUNDLED_DEPENDENCY_NOTICE_MARKER);
const after = stripGeneratedPureAnnotations(stripUserscriptBodyComments(code.slice(insertAt).replace(/^\n+/, '\n')));

writeText(DIST_USERSCRIPT_PATH, `${before}${hasNotice ? '' : notice}${after}`);
console.log(`Annotated ${DIST_USERSCRIPT_PATH} with Greasy Fork compliance notes.`);

function stripUserscriptBodyComments(value) {
  return value.split('\n')
    .filter(line => !/^\s*\/\//.test(line))
    .join('\n');
}

function stripGeneratedPureAnnotations(value) {
  return value.replace(/\/\* @__PURE__ \*\/\s*/g, '');
}

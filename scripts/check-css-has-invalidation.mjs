#!/usr/bin/env node
// Fails on :has() rules in the reader stylesheet that make Chromium restyle a
// whole host page on every DOM insertion (see scripts/lib/css-has-invalidation.mjs).
//
//   node scripts/check-css-has-invalidation.mjs            src/reader/styles-reader.css and its @imports
//                                                          (the sources of dist/yomu.css)
//   node scripts/check-css-has-invalidation.mjs a.css ...  the named files
//
// Scope is the sheet Yomu injects into other people's pages. The Study app and
// the docs site are Yomu's own pages and keep their own :has() rules.
import path from 'node:path';
import { readFileSync } from 'node:fs';
import { findHasInvalidationRisks, readerStylesheetFiles } from './lib/css-has-invalidation.mjs';

const root = path.resolve(import.meta.dirname, '..');
const args = process.argv.slice(2);
const files = args.length
    ? args.map(file => path.resolve(file))
    : readerStylesheetFiles(path.join(root, 'src', 'reader', 'styles-reader.css'));

let failures = 0;
let allowed = 0;
for (const file of files) {
    for (const finding of findHasInvalidationRisks(readFileSync(file, 'utf8'))) {
        if (finding.allowed) {
            allowed++;
            continue;
        }
        failures++;
        console.error(`${path.relative(root, file)}:${finding.line}  ${finding.reason}\n    ${finding.selector}`);
    }
}

if (failures) {
    console.error(`\n${failures} :has() selector(s) can restyle the whole host page on any DOM insertion.`
        + '\nUse a state class set by the code that owns the state, or add'
        + '\n/* has-invalidation-allow: <reason> */ on the :has( line when the anchor is a small Yomu-owned subtree.');
    process.exit(1);
}
console.log(`CSS :has() invalidation check passed (${files.length} file(s), ${allowed} allowed with a reason).`);

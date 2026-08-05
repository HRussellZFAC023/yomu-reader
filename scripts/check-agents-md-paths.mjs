#!/usr/bin/env node

// AGENTS.md is read at the start of every agent session, so a dead path there is
// copied into work before anyone checks it. Three had rotted for months
// (`src/reader/i18n.ts`, `docs/adr/`, `docs/public/newtab/app.js`). This asserts
// every repo path AGENTS.md names in backticks or a markdown link still exists.

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const text = readFileSync(join(root, 'AGENTS.md'), 'utf8');
const candidates = new Set();
for (const [, path] of text.matchAll(/`([^`\s]+)`/g)) candidates.add(path);
for (const [, path] of text.matchAll(/\]\(([^)\s]+)\)/g)) candidates.add(path);

// A path, not prose: it must look like a repo-relative file or directory, and a
// bare word like `check` or a URL must not be mistaken for one.
const looksLikePath = path => /^[\w.@-]+(\/[\w.*@-]+)+\/?$/.test(path) && !path.includes('://');
// Paths the toolchain creates at run time are legitimately absent from a fresh
// checkout; asserting them red-flags every clean CI clone. Anything under a
// gitignored runtime root is exempt from the existence check.
const runtimeRoots = ['artifacts/'];
const isRuntimePath = path => runtimeRoots.some(prefix => path === prefix || path.startsWith(prefix));
const missing = [...candidates]
    .filter(looksLikePath)
    .filter(path => !path.includes('*'))
    .filter(path => !isRuntimePath(path))
    .filter(path => !existsSync(join(root, path.replace(/\/$/, ''))))
    .sort();

if (missing.length > 0) {
    console.error('AGENTS.md names repository paths that do not exist:');
    for (const path of missing) console.error(`  ${path}`);
    console.error('Every agent session reads this file, so fix the path or drop the reference.');
    process.exit(1);
}

console.log(`AGENTS.md paths passed (${candidates.size} references checked).`);

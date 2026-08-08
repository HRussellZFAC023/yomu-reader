#!/usr/bin/env node
// Every regression-guard smoke must be reachable from CI. Modelled on
// scripts/check-test-workflow-coverage.mjs, with one difference that matters:
// a smoke's reachability is not a directory prefix, it is a transitive
// `npm run` graph. `smoke:release` pulls in `smoke:layout-regressions`, which
// pulls in fourteen more; a workflow that names only the aggregate still covers
// all of them.
//
// It catches three real gaps:
//   1. a scripts/*smoke*.mjs with no package script at all (unrunnable);
//   2. a smoke package script no workflow reaches (written, never run — this is
//      how smoke:tatoeba-contract sat unreachable);
//   3. a name in NIGHTLY_SMOKES that is not a package script (nightly would
//      fail on it, or silently skip it).
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const WORKFLOW_DIR = join(ROOT, '.github/workflows');
const SMOKE_DIR = join(ROOT, 'scripts');
const SMOKE_FILE = /smoke.*\.mjs$/;
// scripts/lib is helper code by definition, even when a helper's descriptive
// filename contains "smoke". Keep entry-point exceptions limited to actual
// runners instead of growing a second list of every shared helper.
const NOT_A_GUARD = new Set([
    'scripts/run-nightly-smokes.mjs',
    'scripts/check-smoke-workflow-coverage.mjs',
]);
// Exemptions must name their precondition here rather than be silently absent.
const EXEMPT = new Map([
    ['scripts/academy-account-lifecycle-browser-smoke.mjs',
        'needs an Academy dev server already listening (ACADEMY_BASE_URL, default http://127.0.0.1:5205); an operator proof, not a self-contained CI guard'],
]);
// scripts/manual/** is operator tooling, run by hand against real signed-in
// sites. Those are exempt from workflow reachability but must still be runnable,
// so they are only checked for rule 1.
const MANUAL_PREFIX = 'scripts/manual/';

const packageJson = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
const scripts = packageJson.scripts ?? {};
// Read, never import: run-nightly-smokes.mjs runs every nightly smoke at module
// evaluation, so importing it for its export would launch the whole fleet.
const NIGHTLY_SMOKES = nightlySmokeNames(readFileSync(join(ROOT, 'scripts/run-nightly-smokes.mjs'), 'utf8'));

const workflowFiles = readdirSync(WORKFLOW_DIR).filter(name => name.endsWith('.yml') || name.endsWith('.yaml')).sort();
const workflowText = workflowFiles.map(name => readFileSync(join(WORKFLOW_DIR, name), 'utf8')).join('\n');

// Script names a workflow runs directly, plus the nightly aggregate's list.
const rootNames = new Set(NIGHTLY_SMOKES);
for (const name of Object.keys(scripts)) {
    if (new RegExp(`npm run (?:-s )?${escapeRegExp(name)}(?![\\w:-])`).test(workflowText)) rootNames.add(name);
}

// Expand `npm run x && npm run y` chains so aggregate coverage counts.
const reachableNames = new Set();
const queue = [...rootNames];
while (queue.length) {
    const name = queue.pop();
    if (reachableNames.has(name)) continue;
    reachableNames.add(name);
    const command = scripts[name];
    if (!command) continue;
    for (const match of command.matchAll(/npm run (?:-s )?([\w:@./-]+)/g)) queue.push(match[1]);
}

const guards = collect(SMOKE_DIR)
    .map(file => relative(ROOT, file))
    .filter(path => SMOKE_FILE.test(path) && !path.startsWith('scripts/lib/') && !NOT_A_GUARD.has(path));

const unrunnable = [];
const unreachable = [];
for (const guard of guards) {
    const owners = Object.entries(scripts).filter(([, command]) => command.includes(guard)).map(([name]) => name);
    if (!owners.length) {
        unrunnable.push(guard);
        continue;
    }
    if (guard.startsWith(MANUAL_PREFIX) || EXEMPT.has(guard)) continue;
    if (!owners.some(name => reachableNames.has(name))) unreachable.push(`${guard} (scripts: ${owners.join(', ')})`);
}

const nightlyGhosts = NIGHTLY_SMOKES.filter(name => !scripts[name]);

const gaps = unrunnable.length + unreachable.length + nightlyGhosts.length;
if (gaps) {
    console.error(`[smoke-workflows] FAIL: ${gaps} smoke coverage gap(s).`);
    for (const guard of unrunnable) console.error(`  no package script runs: ${guard}`);
    for (const guard of unreachable) console.error(`  no workflow reaches: ${guard}`);
    for (const name of nightlyGhosts) console.error(`  NIGHTLY_SMOKES names a missing package script: ${name}`);
    process.exit(1);
}

console.log(`[smoke-workflows] PASS: ${guards.length} smoke guard(s) runnable; every non-manual guard reachable from ${workflowFiles.length} workflow(s).`);
console.log(`  reachable script names: ${reachableNames.size}`);
console.log(`  manual-only guards (exempt from workflow reachability): ${guards.filter(guard => guard.startsWith(MANUAL_PREFIX)).length}`);
for (const [guard, reason] of EXEMPT) console.log(`  exempt: ${guard} — ${reason}`);

function collect(directory) {
    const files = [];
    for (const entry of readdirSync(directory).sort()) {
        const path = join(directory, entry);
        if (statSync(path).isDirectory()) files.push(...collect(path));
        else files.push(path);
    }
    return files;
}

function nightlySmokeNames(source) {
    const list = /export const NIGHTLY_SMOKES = \[([\s\S]*?)\];/.exec(source);
    if (!list) throw new Error('NIGHTLY_SMOKES not found in scripts/run-nightly-smokes.mjs');
    return [...list[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

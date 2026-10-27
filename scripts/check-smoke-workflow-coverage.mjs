#!/usr/bin/env node
// Every regression-guard smoke must be reachable from CI. Modelled on
// scripts/check-test-workflow-coverage.mjs, with one difference that matters:
// a smoke's reachability is not a directory prefix, it is a transitive
// `npm run` graph. A workflow naming an aggregate covers its transitive hosts.
// Release stays at seven; the geometry replacement hosts must remain in the
// PR layout job itself, even when nightly also reaches them.
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
    'scripts/prepare-release-smokes.mjs',
]);
const RELEASE_SMOKES = [
    'smoke:userscript-boot', 'smoke:popup-word-detail', 'smoke:subtitle-stability',
    'smoke:ocr-honesty', 'smoke:study-flow-stability', 'smoke:annotation-power:extension', 'smoke:gaming',
];
const REQUIRED_LAYOUT_HOSTS = [
    'smoke:ignored-words', 'smoke:layout-neutral-scan', 'smoke:prose-portal',
    'smoke:annotation-scroll', 'smoke:annotation-typography', 'smoke:chip-mirror',
    'smoke:reddit-chrome', 'smoke:drag-handle', 'smoke:trusted-form-submit-order',
    'smoke:subtitle-stability', 'smoke:piccoma-host-armour', 'smoke:ocr-line-register',
    'smoke:youtube-ipad-playback', 'smoke:youtube-dom-safe', 'smoke:page-ruby-metrics', 'smoke:furigana-tapband',
];
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
const reachableNames = expandNames(rootNames);

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
    if (guard.startsWith(MANUAL_PREFIX)) continue;
    if (!owners.some(name => reachableNames.has(name))) unreachable.push(`${guard} (scripts: ${owners.join(', ')})`);
}

const nightlyGhosts = NIGHTLY_SMOKES.filter(name => !scripts[name]);
const policyGaps = [];
const releaseNames = commandNames(scripts['smoke:release'] ?? '');
if (JSON.stringify(releaseNames) !== JSON.stringify(RELEASE_SMOKES)) {
    policyGaps.push(`smoke:release must run exactly these seven in order: ${RELEASE_SMOKES.join(', ')}`);
}
const ci = readFileSync(join(WORKFLOW_DIR, 'ci.yml'), 'utf8');
const layoutJob = /^  layout-smoke:\s*\n([\s\S]*?)(?=^  [\w-]+:|(?![\s\S]))/m.exec(ci)?.[1] ?? '';
const layoutRoots = Object.keys(scripts).filter(name => new RegExp(`npm run (?:-s )?${escapeRegExp(name)}(?![\\w:-])`).test(layoutJob));
const layoutNames = expandNames(layoutRoots);
for (const name of REQUIRED_LAYOUT_HOSTS) {
    if (!layoutNames.has(name)) policyGaps.push(`PR CI layout-smoke no longer reaches ${name}`);
}
if (new Set(NIGHTLY_SMOKES).size !== NIGHTLY_SMOKES.length) policyGaps.push('NIGHTLY_SMOKES contains duplicate hosts');
const nightlyFiles = new Map();
for (const name of NIGHTLY_SMOKES) {
    const files = new Set([...expandNames([name])].flatMap(owner => {
        const file = /\bnode (scripts\/[\w/.-]+\.mjs)\b/.exec(scripts[owner] ?? '')?.[1];
        return file && guards.includes(file) ? [file] : [];
    }));
    for (const file of files) {
        const names = nightlyFiles.get(file) ?? [];
        names.push(name);
        nightlyFiles.set(file, names);
    }
}
for (const [file, names] of nightlyFiles) {
    // These are different recorded-page runner modes, not merged smoke aliases.
    if (names.length > 1 && file !== 'scripts/recorded-pages-smoke.mjs') {
        policyGaps.push(`nightly runs ${file} more than once: ${names.join(', ')}; put its cells in the host`);
    }
}

const gaps = unrunnable.length + unreachable.length + nightlyGhosts.length + policyGaps.length;
if (gaps) {
    console.error(`[smoke-workflows] FAIL: ${gaps} smoke coverage gap(s).`);
    for (const guard of unrunnable) console.error(`  no package script runs: ${guard}`);
    for (const guard of unreachable) console.error(`  no workflow reaches: ${guard}`);
    for (const name of nightlyGhosts) console.error(`  NIGHTLY_SMOKES names a missing package script: ${name}`);
    for (const gap of policyGaps) console.error(`  ${gap}`);
    process.exit(1);
}

console.log(`[smoke-workflows] PASS: ${guards.length} smoke guard(s) runnable; every non-manual guard reachable from ${workflowFiles.length} workflow(s).`);
console.log(`  reachable script names: ${reachableNames.size}`);
console.log(`  manual-only guards (exempt from workflow reachability): ${guards.filter(guard => guard.startsWith(MANUAL_PREFIX)).length}`);
console.log(`  release: ${releaseNames.length}; required PR layout hosts: ${REQUIRED_LAYOUT_HOSTS.length}`);

function commandNames(command) {
    return [...command.matchAll(/npm run (?:-s )?([\w:@./-]+)/g)].map(match => match[1]);
}

function expandNames(roots) {
    const names = new Set();
    const queue = [...roots];
    while (queue.length) {
        const name = queue.pop();
        if (names.has(name)) continue;
        names.add(name);
        queue.push(...commandNames(scripts[name] ?? ''));
    }
    return names;
}

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
    // Comments may hold apostrophes (先生's popup); only quoted names count.
    return [...list[1].replace(/\/\/.*$/gm, '').matchAll(/'([^']+)'/g)].map(match => match[1]);
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

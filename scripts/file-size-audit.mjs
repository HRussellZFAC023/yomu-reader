#!/usr/bin/env node
// A file-size ratchet for the reader source (A35.23).
//
// The repository had no file or class size gate at all, and it shows: two files are
// over ten thousand lines and five are over five thousand. Those are the files every
// change ripples through, and the backlog records "controller.ts is a mega-file
// (route parse + modes + queues + render + keyboard + URL sync + reset) which is why
// every study change ripples".
//
// This is deliberately a RATCHET rather than a limit, for the same reason the
// complexity gate is: a gate that fails on day one is read as noise and stops being
// a gate. Existing debt is baselined per file, and only GROWTH fails. The baseline
// may only go down, and the script says so out loud when a file has shrunk enough to
// tighten it.
//
// Scope note: this counts LINES, not classes. A class-size gate needs the TypeScript
// AST and the complexity audit already walks it — if class size is ever gated, add it
// there rather than starting a second AST walk here.
import { readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const ROOT = path.resolve(import.meta.dirname, '..');
const BASELINE_FILE = path.join(ROOT, 'config', 'quality', 'file-size-baseline.json');
const UPDATE = process.argv.includes('--update-baseline');
// Only files big enough to be a structural problem are tracked. Below this a file is
// nobody's ripple risk, and tracking it would turn every ordinary edit into a
// baseline update.
const THRESHOLD = Number(process.env.YOMU_FILE_SIZE_THRESHOLD || 2000);
const TARGETS = [path.join(ROOT, 'src')];
const IGNORED = new Set(['node_modules', 'dist', 'dist-reader', 'artifacts']);

const files = [];
for (const target of TARGETS) {
    const info = await stat(target).catch(() => null);
    if (info?.isDirectory()) files.push(...await listSourceFiles(target));
}

const measured = new Map();
for (const file of files) {
    const lines = (await readFile(file, 'utf8')).split('\n').length;
    if (lines <= THRESHOLD) continue;
    measured.set(path.relative(ROOT, file).split(path.sep).join('/'), lines);
}

const sorted = [...measured.entries()].sort((a, b) => b[1] - a[1]);
console.log(`Files over ${THRESHOLD} lines: ${sorted.length}`);
for (const [file, lines] of sorted.slice(0, 12)) console.log(`${String(lines).padStart(6)}  ${file}`);

if (UPDATE) {
    await writeFile(BASELINE_FILE, `${JSON.stringify(Object.fromEntries(sorted), null, 4)}\n`);
    console.log(`\nRecorded ${sorted.length} file(s) over ${THRESHOLD} lines in ${path.relative(ROOT, BASELINE_FILE)}.`);
    process.exit(0);
}

const baseline = JSON.parse(await readFile(BASELINE_FILE, 'utf8').catch(() => '{}'));
const failures = [];
for (const [file, lines] of measured) {
    const allowed = baseline[file];
    if (allowed === undefined) {
        failures.push(`${file} is new over ${THRESHOLD} lines (${lines}). Split it rather than baselining it.`);
        continue;
    }
    if (lines > allowed) failures.push(`${file} grew ${allowed} -> ${lines} lines.`);
}
// A baselined file that dropped below the threshold entirely is a win, not a drift.
const shrunkOut = Object.keys(baseline).filter(file => !measured.has(file));
const tightenable = [...measured].filter(([file, lines]) => baseline[file] !== undefined && lines < baseline[file]);

if (failures.length) {
    console.error('\nFile-size baseline broken:');
    for (const failure of failures) console.error(`  ${failure}`);
    console.error('\nThese files are already the ones every change ripples through. Move code out'
        + ' rather than raising the baseline; re-record only after a real split with'
        + ' `node scripts/file-size-audit.mjs --update-baseline`.');
    process.exitCode = 1;
} else if (tightenable.length || shrunkOut.length) {
    // Say it loudly: an unlowered baseline is how a ratchet quietly stops ratcheting.
    console.log('\nBaseline can be tightened:');
    for (const [file, lines] of tightenable) console.log(`  ${file} ${baseline[file]} -> ${lines}`);
    for (const file of shrunkOut) console.log(`  ${file} dropped below ${THRESHOLD} lines entirely`);
    console.log('Re-record with: node scripts/file-size-audit.mjs --update-baseline');
} else {
    console.log('\nNo file over the baseline.');
}

async function listSourceFiles(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const found = [];
    for (const entry of entries) {
        if (entry.isDirectory()) {
            if (IGNORED.has(entry.name)) continue;
            found.push(...await listSourceFiles(path.join(dir, entry.name)));
            continue;
        }
        if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) found.push(path.join(dir, entry.name));
    }
    return found;
}

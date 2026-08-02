#!/usr/bin/env node
// A dead-code ratchet over `fallow dead-code` (U63).
//
// The CI job ran `fallow dead-code --fail-on-issues` across the whole project and
// there are 131 findings, so it failed on every commit for months — including
// docs-only ones. A gate that always fails is read as noise and stops being a
// gate, which is exactly what happened: the job went red so long that a real
// regression inside it would have been invisible.
//
// Same shape as the complexity and file-size ratchets: existing debt is recorded
// per finding, only NEW findings fail, and the script says so out loud when the
// baseline can be tightened. The baseline may only shrink.
//
// Why not `fallow --changed-since`: touching a file for an unrelated reason would
// surface every pre-existing finding in it, which reintroduces the random-failure
// problem this is meant to remove. A recorded baseline fails on what you ADD,
// wherever you add it.
import { execFile } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, '..');
const BASELINE_FILE = path.join(ROOT, 'config', 'quality', 'dead-code-baseline.json');
const UPDATE = process.argv.includes('--update-baseline');

// `fallow` exits non-zero when it finds anything, which is the behaviour we are
// wrapping — a non-zero exit with parsable output on stdout is success for us.
async function runFallow() {
    try {
        const { stdout } = await execFileAsync(
            'npx',
            ['fallow', 'dead-code', '--format', 'compact'],
            { cwd: ROOT, maxBuffer: 32 * 1024 * 1024 },
        );
        return stdout;
    } catch (error) {
        if (typeof error.stdout === 'string' && error.stdout.length > 0) return error.stdout;
        throw error;
    }
}

/**
 * A finding's identity is `kind:file:symbol` — deliberately WITHOUT the line
 * number, so that moving code around does not read as a new finding while a
 * genuinely new unused export still does.
 */
function findingKey(line) {
    const trimmed = line.trim();
    // `unused-file` has no line or symbol -- `unused-file:path/to/file.mjs`. Parsing
    // only the four-part shape silently dropped all five of them, which would have
    // left a whole category ungated. Match it first.
    const fileOnly = /^(unused-file):(.+)$/.exec(trimmed);
    if (fileOnly) return `${fileOnly[1]}:${fileOnly[2].split(path.sep).join('/')}:`;
    const match = /^([a-z-]+):(.+?):(\d+):(.*)$/.exec(trimmed);
    if (!match) return null;
    const [, kind, file, , symbol] = match;
    return `${kind}:${file.split(path.sep).join('/')}:${symbol}`;
}

const output = await runFallow();
const measured = new Map();
for (const line of output.split('\n')) {
    const key = findingKey(line);
    if (key) measured.set(key, line.trim());
}

const byKind = new Map();
for (const key of measured.keys()) {
    const kind = key.slice(0, key.indexOf(':'));
    byKind.set(kind, (byKind.get(kind) ?? 0) + 1);
}
console.log(`Dead-code findings: ${measured.size}`);
for (const [kind, count] of [...byKind].sort((a, b) => b[1] - a[1])) {
    console.log(`${String(count).padStart(5)}  ${kind}`);
}

if (UPDATE) {
    await writeFile(BASELINE_FILE, `${JSON.stringify([...measured.keys()].sort(), null, 4)}\n`);
    console.log(`\nRecorded ${measured.size} finding(s) in ${path.relative(ROOT, BASELINE_FILE)}.`);
    process.exit(0);
}

const baseline = new Set(JSON.parse(await readFile(BASELINE_FILE, 'utf8').catch(() => '[]')));
const added = [...measured.keys()].filter(key => !baseline.has(key));
const cleared = [...baseline].filter(key => !measured.has(key));

if (added.length) {
    console.error(`\nNew dead code (${added.length}):`);
    for (const key of added) console.error(`  ${measured.get(key)}`);
    console.error('\nDelete it, or export it from somewhere that is actually used. Re-record only'
        + ' after genuinely clearing debt with `node scripts/dead-code-audit.mjs --update-baseline`.');
    process.exitCode = 1;
} else if (cleared.length) {
    // Say it loudly: an unlowered baseline is how a ratchet quietly stops ratcheting.
    console.log(`\nBaseline can be tightened — ${cleared.length} finding(s) no longer present:`);
    for (const key of cleared.slice(0, 12)) console.log(`  ${key}`);
    if (cleared.length > 12) console.log(`  …and ${cleared.length - 12} more`);
    console.log('Re-record with: node scripts/dead-code-audit.mjs --update-baseline');
} else {
    console.log('\nNo new dead code.');
}

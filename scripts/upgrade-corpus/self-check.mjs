#!/usr/bin/env node
// Proves the upgrade test measures v2, not its own harness: it runs
// tests/reader/upgrade-from-v1.9.3.test.ts against the v1.9.3 SOURCE, which
// must pass every case. A v2 failure is then a behaviour change from the
// release learners are upgrading from, never a fixture or realm-stub artefact.
//
//   node scripts/upgrade-corpus/self-check.mjs --references <dir with v193-reference>
//
// The copy lives next to the reference checkouts (never inside them). v1.9.3
// named two v2 entry points differently; they are mapped to v1.9.3's own:
//   parseReaderSettingsBackup      -> getReaderSettingsExport (1.9.3's recogniser)
//   validateCloudSettingsEnvelope  -> identity (1.9.3 restored snapshots unvalidated)
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..', '..');
const TEST = path.join(repo, 'tests', 'reader', 'upgrade-from-v1.9.3.test.ts');
const CORPUS = path.join(repo, 'tests', 'reader', 'fixtures', 'upgrade-v1.9.3');

const index = process.argv.indexOf('--references');
const references = index > 0 ? path.resolve(process.argv[index + 1]) : '';
if (!references) {
    console.error('Usage: node scripts/upgrade-corpus/self-check.mjs --references <dir with v193-reference>');
    process.exit(2);
}
const root = path.join(references, 'v193-reference');
const work = path.join(references, 'upgrade-corpus-self-check');

function onV193(source) {
    const replacements = [
        ["'../../src/", `'${root}/src/`],
        [
            `import { parseReaderSettingsBackup } from '${root}/src/reader/settings/file-io';`,
            `import { getReaderSettingsExport as parseReaderSettingsBackup } from '${root}/src/reader/settings/file-io';`,
        ],
        [
            `import { validateCloudSettingsEnvelope } from '${root}/src/reader/settings/cloud-settings-envelope';`,
            'const validateCloudSettingsEnvelope = (value: unknown) => value as { storage?: unknown };',
        ],
        ["path.resolve(import.meta.dirname, 'fixtures', 'upgrade-v1.9.3')", JSON.stringify(CORPUS)],
    ];
    return replacements.reduce((text, [from, to]) => {
        if (!text.includes(from)) throw new Error(`Self-check rewrite target is gone from the test: ${from}`);
        return text.split(from).join(to);
    }, source);
}

rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
symlinkSync(path.join(repo, 'node_modules'), path.join(work, 'node_modules'));
const copy = path.join(work, 'upgrade-on-v1.9.3.test.ts');
writeFileSync(copy, onV193(readFileSync(TEST, 'utf8')));

const result = spawnSync(process.execPath, [
    path.join(repo, 'node_modules', 'vitest', 'vitest.mjs'), 'run',
    '--config', path.join(here, 'vitest.capture.config.mjs'), '--root', root,
], {
    cwd: root,
    stdio: 'inherit',
    env: { ...process.env, YOMU_CAPTURE_ROOT: root, YOMU_CAPTURE_INCLUDE: copy },
});
process.exit(result.status ?? 1);

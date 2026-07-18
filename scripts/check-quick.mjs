#!/usr/bin/env node
// Quick iteration gate (<60s target): incremental typecheck + only the tests
// affected by the current diff (vitest --changed, module-graph based — test
// filenames here are feature-named, so path heuristics don't work).
//
// This is an ADVISORY gate for everyday iteration. The four generated-shard
// mega files (jpdb, new-tab-review, subtitles-controller, settings-form) are
// excluded because a change to any widely-imported src module would pull in a
// multi-minute file; full `npm run check` remains the release gate.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function run(label, cmd, args, extraEnv = {}) {
    const start = Date.now();
    console.log(`[check:quick] ${label}...`);
    const res = spawnSync(cmd, args, { cwd: ROOT, stdio: 'inherit', env: { ...process.env, ...extraEnv } });
    console.log(`[check:quick] ${label}: ${((Date.now() - start) / 1000).toFixed(1)}s (exit ${res.status})`);
    if (res.status !== 0) process.exit(res.status ?? 1);
}

function capture(cmd, args) {
    const res = spawnSync(cmd, args, { cwd: ROOT, encoding: 'utf8' });
    return res.status === 0 ? res.stdout.trim() : '';
}

const baseRef = capture('git', ['merge-base', 'HEAD', 'origin/main']) || 'HEAD';
const changed = capture('git', ['diff', '--name-only', baseRef]).split('\n').filter(Boolean)
    .concat(capture('git', ['diff', '--name-only']).split('\n').filter(Boolean))
    .concat(capture('git', ['ls-files', '--others', '--exclude-standard']).split('\n').filter(Boolean));
const uniqueChanged = [...new Set(changed)];

run('typecheck (incremental)', process.execPath, [join(ROOT, 'node_modules/typescript/bin/tsc'), '--noEmit', '--incremental', '--tsBuildInfoFile', 'node_modules/.cache/check-quick.tsbuildinfo']);

if (!uniqueChanged.length) {
    console.log('[check:quick] no changes vs merge-base; skipping tests.');
    process.exit(0);
}

const MEGA_FILES = [
    'tests/reader/jpdb.test.ts',
    'tests/reader/new-tab-review.test.ts',
    'tests/reader/subtitles-controller.test.ts',
    'tests/reader/settings-form.test.ts',
];

// Reader tests affected by the diff, minus the mega files (unless directly edited).
const changedMega = MEGA_FILES.filter(f => uniqueChanged.includes(f));
const vitestArgs = [
    join(ROOT, 'node_modules/vitest/vitest.mjs'), 'run',
    `--changed=${baseRef}`,
    ...MEGA_FILES.filter(f => !changedMega.includes(f)).flatMap(f => ['--exclude', f]),
];
run('reader tests (affected by diff)', process.execPath, vitestArgs, { YOMU_QUICK_GATE: '1' });
for (const mega of changedMega) {
    run(`directly-edited mega file ${mega}`, process.execPath, [join(ROOT, 'node_modules/vitest/vitest.mjs'), 'run', mega]);
}

// Academy tests only when academy paths changed and fixtures are present.
const touchesAcademy = uniqueChanged.some(p => p.startsWith('src/academy/') || p.startsWith('tests/academy/') || p.startsWith('public/academy/'));
if (touchesAcademy && existsSync(join(ROOT, 'artifacts/yomu-academy'))) {
    run('academy tests (affected by diff)', process.execPath, [
        join(ROOT, 'node_modules/vitest/vitest.mjs'), 'run',
        '--config', 'config/vite/academy.config.ts',
        `--changed=${baseRef}`,
    ]);
} else if (touchesAcademy) {
    console.warn('[check:quick] academy paths changed but artifacts/yomu-academy missing; skipping academy tests.');
}

console.log('[check:quick] PASS (advisory — run `npm run check` before release).');

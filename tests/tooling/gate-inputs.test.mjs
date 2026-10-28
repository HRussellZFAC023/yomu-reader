import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { StageRunner } from '../../scripts/lib/stage-runner.mjs';
import { repositorySnapshot, selectInputs } from '../../scripts/lib/stage-cache.mjs';
import { testInputs } from '../../scripts/lib/affected-tests.mjs';
import { selectAffectedTests } from '../../scripts/lib/test-selection.mjs';
import { readTargets } from '../../scripts/lib/read-targets.mjs';
import ts from 'typescript';
import { toolingStageContract } from '../../scripts/lib/gate-inputs.mjs';
import { typecheckInputsAsync } from '../../scripts/lib/typecheck-inputs.mjs';

test('every compiler-loaded repository file participates in the typecheck key', async () => {
    const root = resolve('.');
    const inputs = await typecheckInputsAsync(root);
    const listed = execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '--listFilesOnly', '--incremental', 'false', '-p', 'tsconfig.json'], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
    const declared = selectInputs(repositorySnapshot(root), inputs);
    for (const file of listed.trim().split(/\r?\n/).filter(file => !file.includes('/node_modules/'))) {
        assert.ok(declared[file.slice(root.length + 1)], `Compiler reads undeclared input ${file}`);
    }
    assert.ok(inputs.includes('docs/.vitepress/locales/site-locales.ts'));
    assert.ok(inputs.includes('public/academy/content/lessons/004-l1-l03.json'));
});

test('repository-wide test keys include filesystem dependencies, workflows and hidden configuration', () => {
    const root = resolve('.');
    const snapshot = repositorySnapshot(root);
    const declared = selectInputs(snapshot, testInputs);
    // The policy is repository-wide, including paths assembled dynamically.
    for (const path of Object.keys(snapshot)) {
        if (!/^docs\/\.vitepress\/(?:dist|cache|\.temp)\//.test(path)) assert.ok(declared[path], `Undeclared readable repository file ${path}`);
    }
    for (const file of ['.github/workflows/release.yml', '.fallowrc.jsonc', '.nvmrc', 'AGENTS.md', 'CONTEXT.md', 'wrangler.academy.jsonc', 'dist/yomu.user.js', 'dist/yomu.css']) {
        assert.ok(declared[file], file);
    }
});

test('installed lock identity invalidates passes even through a shared node_modules symlink', t => {
    const root = mkdtempSync(join(tmpdir(), 'yomu-installed-key-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    execFileSync('git', ['init'], { cwd: root, stdio: 'pipe' });
    mkdirSync(join(root, 'installed'));
    symlinkSync('installed', join(root, 'node_modules'));
    const runner = new StageRunner(root);
    const stage = { name: 'probe', command: 'true', inputs: [] };
    const absent = runner.key(stage);
    writeFileSync(join(root, 'node_modules/.package-lock.json'), '{"packages":{"tool":{"version":"1"}}}');
    const first = runner.key(stage);
    assert.notEqual(first, absent);
    writeFileSync(join(root, 'node_modules/.package-lock.json'), '{"packages":{"tool":{"version":"2"}}}');
    assert.notEqual(runner.key(stage), first);
});

test('native tooling keys cover workflow and script-owned manifest bytes', () => {
    const snapshot = repositorySnapshot(resolve('.'));
    const { inputs } = toolingStageContract(snapshot, []);
    const declared = selectInputs(snapshot, inputs);
    for (const file of ['.github/workflows/release.yml', '.github/workflows/ci.yml', 'src/academy/domain/cast-standardization-manifest.ts', 'tests/academy/grounded-audio-registry.test.ts']) {
        assert.ok(declared[file], file);
    }
});


test('G-03b restored guards remain reachable through their filesystem and import inputs', async () => {
    const root = resolve('.');
    const readers = [
        ['docs/public/pdf-reader/index.html', 'tests/reader/hosted-settings-authority.test.ts'],
        ['docs/public/video-player/index.html', 'tests/reader/hosted-settings-authority.test.ts'],
        ['docs/privacy/index.md', 'tests/reader/docs-publication-guard.test.ts'],
        ['docs/new-root-note.md', 'tests/reader/docs-publication-guard.test.ts'],
        ['scripts/sync-academy.cjs', 'tests/reader/academy-build-manifest.test.ts'],
        ['scripts/lib/extension-runtime-hardening.mjs', 'tests/reader/extension-runtime-hardening.test.ts'],
    ];
    const reader = await selectAffectedTests(root, readers.map(([file]) => file));
    assert.equal(reader.full, false, reader.reason);
    for (const [file, host] of readers) {
        assert.ok(reader.tests.includes(host), `${file}: missing ${host}`);
        assert.ok(selectInputs({ [file]: true }, reader.readIndex[host])[file], `${host}: undeclared read ${file}`);
        assert.ok(!reader.unresolved[host], `${host}: unbounded filesystem reads`);
    }
    const imports = await selectAffectedTests(root, ['src/reader/subtitles/controller.ts', 'src/reader/dom/html.ts']);
    if (imports.full) assert.match(imports.reason, /resolved config\/setupFiles dependency changed/);
    for (const host of ['tests/reader/subtitles-controller/01-tracks-fullscreen-rail.test.ts', 'tests/reader/settings-dialog-controller.test.ts']) {
        assert.ok(imports.full || imports.tests.includes(host), host);
    }
    const audioInputs = ['src/academy/audio/manifest.json', 'workers/yomu-academy/media-manifest.json'];
    const academy = await selectAffectedTests(root, ['workers/yomu-academy/media-manifest.json'], { config: 'config/vite/academy.config.ts' });
    if (academy.full) assert.match(academy.reason, /resolved config\/setupFiles dependency changed/);
    const audio = 'tests/academy/grounded-audio-registry.test.ts';
    assert.ok(academy.full || academy.tests.includes(audio), audio);
    if (!academy.full) assert.ok(!academy.tests.includes('tests/academy/production-workflow-lifecycle.test.ts'), 'pure workflow consumers must not inherit unrelated filesystem capabilities');
    const reads = readTargets(readFileSync(audio, 'utf8'), resolve(audio), root, ts);
    for (const file of audioInputs) assert.ok(selectInputs({ [file]: true }, reads.targets)[file], file);
    assert.deepEqual(reads.unknown, []);
});

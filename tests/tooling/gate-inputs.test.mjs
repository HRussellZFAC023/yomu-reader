import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { StageRunner } from '../../scripts/lib/stage-runner.mjs';
import { repositorySnapshot, selectInputs } from '../../scripts/lib/stage-cache.mjs';
import { testInputs } from '../../scripts/lib/affected-tests.mjs';
import { typecheckInputs } from '../../scripts/lib/typecheck-inputs.mjs';

test('every compiler-loaded repository file participates in the typecheck key', () => {
    const root = resolve('.');
    const inputs = typecheckInputs(root);
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

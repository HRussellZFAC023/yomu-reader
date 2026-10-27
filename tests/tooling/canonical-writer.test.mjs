import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StageRunner } from '../../scripts/lib/stage-runner.mjs';
test('idempotent template writers cache canonical bytes and reject mutations to other inputs', async t => {
    const root = mkdtempSync(join(tmpdir(), 'yomu-canonical-writer-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    execFileSync('git', ['init'], { cwd: root, stdio: 'pipe' });
    writeFileSync(join(root, 'template.txt'), 'placeholder');
    writeFileSync(join(root, 'source.txt'), 'source');
    const runner = new StageRunner(root);
    const stage = {
        name: 'stamp', command: 'node -e "const fs=require(\'fs\');fs.writeFileSync(\'template.txt\',\'canonical\')"',
        inputs: ['template.txt', 'source.txt'], outputs: ['template.txt'], canonicalizesOutputs: true,
    };
    await runner.run(stage);
    assert.equal(readFileSync(join(root, 'template.txt'), 'utf8'), 'canonical');
    assert.equal(runner.cache.hit(stage.name, runner.key(stage), stage.outputs), true);
    await runner.run(stage);
    assert.equal(runner.timings[1].cached, true);
    const bad = { ...stage, command: 'node -e "require(\'fs\').writeFileSync(\'source.txt\',\'mutation\')"' };
    const badKey = runner.key(bad);
    await assert.rejects(runner.run(bad), /input changed during execution/);
    assert.equal(runner.cache.hit(bad.name, badKey, bad.outputs), false);
});

test('a successful compiler cannot cache a pass if a concurrent writer changes its inputs', async t => {
    const root = mkdtempSync(join(tmpdir(), 'yomu-stable-reader-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    execFileSync('git', ['init'], { cwd: root, stdio: 'pipe' });
    writeFileSync(join(root, 'source.ts'), 'export const value = 1;');
    const runner = new StageRunner(root);
    const stage = { name: 'compiler', command: `node -e "require('node:fs').writeFileSync('source.ts','export const value = 2;')"`, inputs: ['source.ts'], stableInputs: true };
    const key = runner.key(stage);
    await assert.rejects(runner.run(stage), /inputs changed during execution/);
    assert.equal(runner.cache.hit(stage.name, key), false);
});

import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runtimeDeathReason, vitestOutputIndicatesFailure } from '../../scripts/lib/check-log-guard.mjs';
import { StageRunner } from '../../scripts/lib/stage-runner.mjs';

// Reporter shapes from the July exit-status incident and August dead workers.
const green = ' Test Files  486 passed (486)\n      Tests  6563 passed | 1 skipped (6564)';
for (const [name, output, reason] of [
    ['failed files', ' Test Files  2 failed | 314 passed (316)', /2 failed/],
    ['failed tests', '      Tests  1 failed | 12 passed (13)', /1 failed/],
    ['unhandled errors', green + '\nUnhandled Errors\n', /unhandled/],
    ['green summary', green, null],
    ['failed fetch prose', '✓ retries a failed fetch (3 tests) 12ms\n' + green, null],
]) test(`Vitest guard: ${name}`, () => {
    const actual = vitestOutputIndicatesFailure(output);
    if (reason) assert.match(actual, reason);
    else assert.equal(actual, null);
});
const oom = 'FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory\nError: Worker exited unexpectedly\n Test Files  484 passed (486)';
test('names memory exhaustion from the dead-worker transcript', () => assert.equal(runtimeDeathReason(oom), 'a worker ran out of memory'));
test('recognises an unexpected worker exit', () => assert.equal(runtimeDeathReason('Error: Worker exited unexpectedly'), 'a worker exited before finishing its files'));
test('does not classify a green run as worker death', () => {
    assert.equal(runtimeDeathReason(green), null);
});
test('distinguishes failing tests from a dead worker', () => {
    const red = ' Test Files  1 failed | 485 passed (486)\n Tests  3 failed | 6560 passed (6563)';
    assert.equal(runtimeDeathReason(red), null);
    assert.match(vitestOutputIndicatesFailure(red), /1 failed/);
});
test('recognises an OS kill', () => assert.equal(runtimeDeathReason('shard was killed by signal SIGKILL'), 'a worker was killed by the operating system'));
test('StageRunner rejects failed Vitest output even when its child exits zero', async t => {
    const root = mkdtempSync(join(tmpdir(), 'yomu-failed-summary-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    execFileSync('git', ['init'], { cwd: root, stdio: 'pipe' });
    const runner = new StageRunner(root, { noCache: true });
    await assert.rejects(runner.execute({ name: 'lying-child', test: true, command: `node -e "console.log(' Test Files  2 failed | 314 passed (316)')"` }), /vitest summary reports 2 failed/);
});

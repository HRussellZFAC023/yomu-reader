import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { testPlan } from '../../scripts/lib/affected-tests.mjs';

test('related passes never replace a full baseline; config/setup/runner/lock changes force full', t => {
    const root = mkdtempSync(join(tmpdir(), 'yomu-related-test-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    execFileSync('git', ['init'], { cwd: root, stdio: 'pipe' });
    const initial = { 'src/a.ts': { oid: 'a' }, 'tests/reader/a.test.ts': { oid: 'test-a' }, 'package-lock.json': { oid: 'lock' } };
    const first = testPlan(root, initial);
    assert.equal(first.full, true);
    first.saveFullPass();
    const changed = { ...initial, 'src/a.ts': { oid: 'b' }, 'tests/reader/b.test.ts': { oid: 'new-test' } };
    assert.deepEqual(testPlan(root, changed).changed, ['src/a.ts', 'tests/reader/b.test.ts']);
    assert.equal(testPlan(root, changed).full, false);
    assert.deepEqual(testPlan(root, initial).changed, []);
    for (const file of ['package-lock.json', 'vite.config.ts', 'tsconfig.json', 'tests/reader/setup.ts', 'scripts/run-ci-tests.mjs']) {
        assert.equal(testPlan(root, { ...initial, [file]: { oid: 'changed' } }).full, true, file);
    }
    assert.equal(testPlan(root, initial, { noCache: true }).full, true);
    assert.equal(testPlan(root, initial, { env: { TZ: 'different' } }).full, true);
    assert.equal(testPlan(root, initial, { env: { ACADEMY_REQUIRE_N3_SOURCE_FIDELITY: '1' } }).full, true);
    assert.equal(testPlan(root, initial, { suite: 'academy' }).full, true);
    mkdirSync(join(root, 'dist'));
    writeFileSync(join(root, 'dist/ignored.js'), 'broken shipped bytes');
    assert.ok(testPlan(root, initial).changed.includes('dist/ignored.js'));
});

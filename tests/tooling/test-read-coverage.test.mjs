import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { testReadCoverage } from '../../scripts/lib/test-read-coverage.mjs';

test('the preload observes real reads and the CI audit rejects an incomplete bounded declaration', t => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'yomu-read-trace-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    writeFileSync(join(root, 'actual.txt'), 'real bytes');
    writeFileSync(join(root, 'host.cjs'), `globalThis.__vitest_worker__={filepath:__filename}; require('node:fs').readFileSync('actual.txt');`);
    execFileSync(process.execPath, ['--require', resolve('scripts/lib/test-read-trace.cjs'), 'host.cjs'], {
        cwd: root, env: { ...process.env, YOMU_READ_TRACE_DIR: root },
    });
    const events = readdirSync(root).filter(file => file.endsWith('.jsonl')).flatMap(file => readFileSync(join(root, file), 'utf8').trim().split('\n').map(line => JSON.parse(line)));
    assert.deepEqual(events, [{ test: 'host.cjs', path: 'actual.txt' }]);
    const graph = { tests: { 'host.cjs': [join(root, 'host.cjs')] } };
    const modules = { 'host.cjs': { reads: { targets: ['decoy.txt'], unknown: [] } } };
    assert.equal(testReadCoverage(root, graph, modules, events).failures.length, 1);
    modules['host.cjs'].reads.targets.push('actual.txt');
    assert.deepEqual(testReadCoverage(root, graph, modules, events).failures, []);
    modules['host.cjs'].reads.unknown.push('unresolved helper read');
    assert.deepEqual(testReadCoverage(root, graph, modules, [{ test: 'host.cjs', path: 'other.txt' }]).precautionary, ['host.cjs']);
});

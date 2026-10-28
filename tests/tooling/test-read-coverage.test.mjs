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
    writeFileSync(join(root, 'child.txt'), 'child bytes');
    writeFileSync(join(root, 'child.cjs'), `require('node:fs').readFileSync('child.txt'); console.log('child stdout');`);
    writeFileSync(join(root, 'host.cjs'), `globalThis.__vitest_worker__={filepath:__filename}; require('node:fs').readFileSync('actual.txt');
        require('node:util').promisify(require('node:child_process').execFile)(process.execPath,['child.cjs']).then(result=>{
            if(result.stdout.trim()!=='child stdout') throw Error('lost promisifier contract');
        });`);
    execFileSync(process.execPath, ['--require', resolve('scripts/lib/test-read-trace.cjs'), 'host.cjs'], {
        cwd: root, env: { ...process.env, YOMU_READ_TRACE_DIR: root, YOMU_READ_TRACE_ROOT: root },
    });
    const events = readdirSync(root).filter(file => file.endsWith('.jsonl')).flatMap(file => readFileSync(join(root, file), 'utf8').trim().split('\n').map(line => JSON.parse(line)));
    assert.deepEqual(events.sort((a,b)=>a.path.localeCompare(b.path)), [{ test: 'host.cjs', path: 'actual.txt' }, { test: 'host.cjs', path: 'child.txt' }]);
    const graph = { tests: { 'host.cjs': [join(root, 'host.cjs')] } };
    const modules = { 'host.cjs': { reads: { targets: ['decoy.txt', 'child.txt'], unknown: [] } } };
    graph.shared = [join(root, 'config.mjs')];
    modules['config.mjs'] = { reads: { targets: [], unknown: ['Vite config loader'] } };
    assert.equal(testReadCoverage(root, graph, modules, events).failures.length, 1, 'config loader opacity cannot silence a bounded test');
    modules['host.cjs'].reads.targets.push('actual.txt');
    assert.deepEqual(testReadCoverage(root, graph, modules, events).failures, []);
    modules['host.cjs'].reads.unknown.push('unresolved helper read');
    assert.deepEqual(testReadCoverage(root, graph, modules, [{ test: 'host.cjs', path: 'other.txt' }]).precautionary, ['host.cjs']);
});

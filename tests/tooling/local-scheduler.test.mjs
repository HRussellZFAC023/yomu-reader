// Mechanism fixture for the installed Vitest queue and project boundaries.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

test('one transform graph preserves all three environment/setup lanes under one fork budget', t => {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'yomu-local-pools-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const put = (path, bytes) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), bytes); };
    put('package.json', '{"type":"module","version":"2.2.0"}');
    put('artifacts/check-logs/affected-tests-reader.json', JSON.stringify({ tests: ['tests/reader/styles.test.ts'] }));
    put('artifacts/check-logs/affected-tests-academy.json', JSON.stringify({ tests: ['tests/academy/kana-sound-map.test.ts', 'tests/academy/other.test.ts', 'tests/academy/entrypoint-lifecycle.test.ts'] }));
    put('config/ci/local-contract-tests.json', '{}');
    put('tests/reader/setup.ts', 'globalThis.__g04ReaderSetup = true;');
    for (const file of ['config/vite/local-gate.config.ts', 'config/vite/local-gate-selection.ts', 'config/vite/reader-test.ts', 'config/vite/local-gate-runner.ts', 'scripts/lib/test-workers.mjs', 'scripts/lib/local-gate-pool.mjs', 'scripts/lib/local-gate-worker.mjs', 'scripts/lib/slot-queue.mjs', 'config/vite/academy-test.ts']) {
        mkdirSync(dirname(join(root, file)), { recursive: true });
        copyFileSync(file, join(root, file));
    }
    symlinkSync(resolve('node_modules'), join(root, 'node_modules'));
    for (const [file, browser, setup] of [['tests/reader/app-version.test.ts', false, false], ['tests/reader/styles.test.ts', true, true], ['tests/academy/kana-sound-map.test.ts', true, false]]) {
        put(file, `it('project globals',()=>{ expect(__YOMU_VERSION__).toBe('2.2.0'); expect(typeof document !== 'undefined').toBe(${browser}); expect(Boolean(globalThis.__g04ReaderSetup)).toBe(${setup}); });`);
    }
    put('tests/academy/shared.ts', "import {randomUUID} from 'node:crypto'; export const identity = randomUUID();");
    put('tests/reader/shared.ts', "import {randomUUID} from 'node:crypto'; export const identity = randomUUID();");
    for (const [file, output] of [['tests/reader/app-version.test.ts', 'node-a'], ['tests/reader/speaking-score.test.ts', 'node-b']]) {
        put(file, `import {identity} from './shared'; import {writeFileSync} from 'node:fs'; it('reviewed Node module reuse without Reader setup',()=>{expect(typeof document).toBe('undefined'); expect(Boolean(globalThis.__g04ReaderSetup)).toBe(false); writeFileSync('${output}', identity);});`);
    }
    for (const [file, output] of [['tests/academy/kana-sound-map.test.ts', 'shared-a'], ['tests/academy/other.test.ts', 'shared-b'], ['tests/academy/entrypoint-lifecycle.test.ts', 'owned']]) {
        put(file, `import {identity} from './shared'; import {writeFileSync} from 'node:fs'; it('fresh environment, reviewed module policy',()=>{expect(Boolean(globalThis.__g04ReaderSetup)).toBe(false); expect(document.querySelector('[data-leak]')).toBeNull(); document.body.innerHTML='<i data-leak></i>'; writeFileSync('${output}', identity);});`);
    }
    const script = `
        import {createVitest} from 'vitest/node';
        const ctx=await createVitest('test',{root:process.cwd(),config:'config/vite/local-gate.config.ts',watch:false},{envFile:false});
        if(ctx.config.maxWorkers!==2 || ctx.config.poolOptions.forks.isolate!==true) throw Error('unbounded shared pool');
        for(const p of ctx.projects) if(p.getSerializableConfig().defines.__YOMU_VERSION__!=='2.2.0') throw Error('mutated project defines');
        console.log(ctx.projects.length); await ctx.close();`;
    const env = { ...process.env, YOMU_CI_MAX_WORKERS: '2', YOMU_CHECK_SESSION: '', NO_COLOR: '1' };
    assert.equal(execFileSync(process.execPath, ['--input-type=module', '-e', script], { cwd: root, env, encoding: 'utf8' }).trim(), '1');
    const result = spawnSync(process.execPath, ['node_modules/vitest/vitest.mjs', 'run', '--config', 'config/vite/local-gate.config.ts'], { cwd: root, env, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /6 passed \(6\)/);
    assert.equal(readFileSync(join(root, 'node-a'), 'utf8'), readFileSync(join(root, 'node-b'), 'utf8'), 'reviewed Node modules retain full-runner reuse');
    assert.equal(readFileSync(join(root, 'shared-a'), 'utf8'), readFileSync(join(root, 'shared-b'), 'utf8'), 'shared Academy modules are evaluated once');
    assert.notEqual(readFileSync(join(root, 'shared-a'), 'utf8'), readFileSync(join(root, 'owned'), 'utf8'), 'mock owner has a fresh process');
});

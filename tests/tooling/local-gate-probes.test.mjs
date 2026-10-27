// Mechanism fixtures: prove selection and failure propagation, not product UX.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { selectAffectedTests } from '../../scripts/lib/test-selection.mjs';
import { StageRunner } from '../../scripts/lib/stage-runner.mjs';
import { typecheckInputs } from '../../scripts/lib/typecheck-inputs.mjs';

function fixture(t) {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'yomu-negative-gate-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    symlinkSync(resolve('node_modules'), join(root, 'node_modules'));
    const put = (path, bytes) => { mkdirSync(dirname(join(root, path)), { recursive: true }); writeFileSync(join(root, path), bytes); };
    put('package.json', '{"type":"module"}');
    put('.gitignore', 'node_modules\nartifacts\n');
    put('vitest.config.mjs', `export default { test: { include: ['*.test.ts'], globals: true, environment: 'node', pool: 'forks', minWorkers: 1, maxWorkers: 1, setupFiles: ['./setup.ts'] } };`);
    put('setup.ts', "import './settings-services';");
    put('settings-services.ts', 'export const ready = true;');
    put('.github/workflows/release.yml', 'heap: 2304');
    put('interactions.css', '@media (prefers-reduced-motion: reduce) {}');
    put('read.ts', "import {readFileSync} from 'node:fs'; export const css = () => readFileSync('interactions.css','utf8');");
    put('workflow.test.ts', "import {readFileSync} from 'node:fs'; it('release',()=>expect(readFileSync('.github/workflows/release.yml','utf8')).toContain('2304'));");
    put('styles.test.ts', "import {css} from './read'; it('reduced motion',()=>expect(css()).toContain(': reduce'));");
    put('leaf.ts', 'export const value = 1;');
    put('leaf.test.ts', "import {value} from './leaf'; it('node leaf',()=>expect(value).toBe(1));");
    put('merged.test.ts', "describe('first merged host',()=>it('first',()=>expect(1).toBe(1))); describe('second merged host',()=>it('second',()=>expect(2).toBe(2))); ");
    return { root, put, runner: new StageRunner(root) };
}

test('G-01b workflow, CSS fs-reader, setup, Node leaf and merged-host corruptions cannot cache a local pass', async t => {
    const { root, put, runner } = fixture(t);
    const execute = async (changed, name) => {
        const plan = await selectAffectedTests(root, changed, { config: 'vitest.config.mjs' });
        assert.ok(plan.full || plan.tests.length, `${name}: selection must not be empty`);
        runner.refresh();
        const files = plan.full ? [] : plan.tests;
        const stage = { name, command: `node node_modules/vitest/vitest.mjs run --config vitest.config.mjs ${files.join(' ')}`, inputs: ['**'], test: true };
        const key = runner.key(stage);
        await assert.rejects(runner.run(stage), /exit 1|failed/i);
        assert.equal(runner.cache.hit(name, key), false, 'failed selections never get pass markers');
        return plan;
    };
    for (const [path, corrupt, expected] of [
        ['.github/workflows/release.yml', 'heap: 1024', 'workflow.test.ts'],
        ['interactions.css', '@media (prefers-reduced-motion: no-preference) {}', 'styles.test.ts'],
        ['leaf.ts', 'export const value = 2;', 'leaf.test.ts'],
        ['merged.test.ts', "it('merged failure',()=>expect(1).toBe(2));", 'merged.test.ts'],
        ['settings-services.ts', "throw new Error('setup graph probe');", null],
    ]) {
        const original = readFileSync(join(root, path));
        try {
            put(path, corrupt);
            const plan = await execute([path], path.replaceAll('/', '-'));
            if (expected) assert.ok(plan.tests.includes(expected));
            else assert.equal(plan.full, true, 'setup dependency changes force every test');
        } finally { put(path, original); }
    }
});

test('public Academy JSON changes invalidate a previously passing compiler stage and fail locally', async t => {
    const { root, put, runner } = fixture(t);
    put('public/academy/content/lesson.json', '{"sourceCoverage":{"members":1}}');
    put('consumer.ts', "import lesson from './public/academy/content/lesson.json'; export const count: number = lesson.sourceCoverage.members;");
    put('tsconfig.json', '{"compilerOptions":{"noEmit":true,"resolveJsonModule":true,"allowSyntheticDefaultImports":true,"module":"ESNext","moduleResolution":"bundler","skipLibCheck":true},"files":["consumer.ts"]}');
    const stage = { name: 'typecheck', command: 'node node_modules/typescript/bin/tsc --noEmit', inputs: typecheckInputs(root) };
    runner.refresh();
    await runner.run(stage);
    await runner.run(stage);
    assert.equal(runner.timings.at(-1).cached, true);
    put('public/academy/content/lesson.json', '{"sourceCoverage":{"memberList":1}}');
    runner.refresh();
    await assert.rejects(runner.run(stage), /exit 2/);
});

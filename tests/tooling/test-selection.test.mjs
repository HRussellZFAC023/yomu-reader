import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { selectAffectedTests } from '../../scripts/lib/test-selection.mjs';

function fixture(t, setup = true) {
    const root = realpathSync(mkdtempSync(join(tmpdir(), 'yomu-sound-selection-')));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    symlinkSync(resolve('node_modules'), join(root, 'node_modules'));
    const put = (path, source) => writeFileSync(join(root, path), source);
    put('package.json', '{"type":"module"}');
    put('vitest.config.mjs', `export default { resolve: { alias: { '@shared': '${root}/shared.ts' } }, test: { include: ['*.test.ts'], setupFiles: ${setup ? "['./setup.ts']" : '[]'} } };`);
    put('setup.ts', "import '@shared';");
    put('shared.ts', 'export const shared = 1;');
    put('a.ts', 'export const a = 1;');
    put('a.test.ts', "import { a } from './a'; it('a', () => expect(a).toBe(1));");
    put('b.test.ts', "it('b', () => expect(2).toBe(2));");
    put('unreferenced.txt', 'no test reads this');
    return { root, put, select: changed => selectAffectedTests(root, changed, { config: 'vitest.config.mjs' }) };
}

test('resolved setup aliases are shared inputs; ordinary imports select their test; unreferenced non-modules log zero', async t => {
    const { select } = fixture(t);
    const nodeEnv = process.env.NODE_ENV;
    assert.equal((await select(['shared.ts'])).full, true);
    assert.deepEqual((await select(['a.ts'])).tests, ['a.test.ts']);
    const empty = await select(['unreferenced.txt']);
    assert.deepEqual(empty.tests, []);
    assert.match(empty.reason, /zero tests: no import dependants/);
    assert.equal(process.env.NODE_ENV, nodeEnv, 'graph discovery must not mutate the gate environment');
});

test('unbounded reads remain conservative until explicitly bounded; deleted imports fail safely', async t => {
    const { root, put, select } = fixture(t, false);
    put('read.ts', "import { readFileSync } from 'node:fs'; export const read = (path: string) => readFileSync(path, 'utf8');");
    put('fs.test.ts', "import { read } from './read'; it('css', () => expect(read('style.css')).toContain('reduce'));");
    put('style.css', '@media (prefers-reduced-motion: reduce) {}');
    put('hosted-worker.js', 'window.worker = 1;');
    put('spawn.test.ts', "import { execFileSync } from 'node:child_process'; it('spawn', () => execFileSync('true'));");
    for (const changed of ['style.css', 'hosted-worker.js', 'unreferenced.txt']) {
        assert.deepEqual((await select([changed])).tests, ['fs.test.ts', 'spawn.test.ts']);
    }
    put('late.test.ts', "it('late', async () => { const name = './a'; await vi.importActual(name); });");
    assert.ok((await select(['a.ts'])).tests.includes('late.test.ts'));
    rmSync(join(root, 'a.ts'));
    assert.equal((await select(['a.ts'])).full, true);
});

test('filesystem reads installed by setupFiles require every test even for an unreferenced non-module', async t => {
    const { put, select } = fixture(t);
    put('shared.ts', "import { readFileSync } from 'node:fs'; export const shared = readFileSync('unreferenced.txt', 'utf8');");
    const plan = await select(['unreferenced.txt']);
    assert.equal(plan.full, true);
    assert.match(plan.reason, /setupFiles has changed or unbounded filesystem/);
});

test('graph discovery errors cannot become empty passing selections', async t => {
    const { root } = fixture(t);
    const plan = await selectAffectedTests(root, ['a.ts'], { createContext: () => { throw new Error('unresolved dependency'); } });
    assert.equal(plan.full, true);
    assert.match(plan.reason, /could not prove/);
});

test('discovery includes mock-isolated tests that the shared Academy pass excludes', async t => {
    const { put, select } = fixture(t, false);
    put('vitest.config.mjs', `export default { test: { include: ['*.test.ts'], exclude: process.env.VITEST_ISOLATE === '1' ? [] : ['isolated.test.ts'] } };`);
    put('isolated.test.ts', "it('isolated entrypoint', () => expect(true).toBe(true));");
    assert.deepEqual((await select(['isolated.test.ts'])).tests, ['isolated.test.ts']);
});

test('bounded fs readers select only matching CSS, including removal, and an unrelated module cannot taint them', async t => {
    const { root, put, select } = fixture(t, false);
    put('read.ts', "// @yomu-reads style.css\nimport {readFileSync} from 'node:fs'; export const read = (file: string) => readFileSync(file, 'utf8');");
    put('fs.test.ts', "import {read} from './read'; it('css', () => expect(read('style.css')).toContain('reduce'));");
    put('style.css', '@media (prefers-reduced-motion: reduce) {}');
    assert.deepEqual((await select(['style.css'])).tests, ['fs.test.ts']);
    assert.deepEqual((await select(['unreferenced.txt'])).tests, []);
    rmSync(join(root, 'style.css'));
    assert.deepEqual((await select(['style.css'])).tests, ['fs.test.ts']);
});

test('byte-checked discovery cache reuses body edits and rediscovers new import edges and module membership', async t => {
    const { root, put, select } = fixture(t, false);
    const { execFileSync } = await import('node:child_process');
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    put('.gitignore', 'node_modules\nartifacts\n');
    assert.equal((await select(['a.ts'])).graphReused, false);
    put('a.ts', 'export const a = 2; // body changed');
    const reused = await select(['a.ts']);
    assert.equal(reused.graphReused, true);
    assert.deepEqual(reused.tests, ['a.test.ts']);
    put('c.ts', 'export const c = 3;');
    put('a.ts', "export {c as a} from './c';");
    const newEdge = await select(['c.ts']);
    assert.equal(newEdge.graphReused, false);
    assert.deepEqual(newEdge.tests, ['a.test.ts']);
    put('a.ts', 'export const a = 4;');
    assert.deepEqual((await select(['c.ts'])).tests, []);
});

test('generated filename churn does not invalidate a source-only import graph or lose fs readers', async t => {
    const { root, put, select } = fixture(t, false);
    const { execFileSync } = await import('node:child_process');
    const { mkdirSync } = await import('node:fs');
    execFileSync('git', ['init', '--quiet'], { cwd: root });
    put('.gitignore', 'node_modules\nartifacts\n');
    put('fs.test.ts', "import{readFileSync}from'node:fs'; it('generated',()=>readFileSync('dist/app.js','utf8'));");
    await select(['a.ts']);
    mkdirSync(join(root, 'dist'));
    put('dist/app.js', 'generated');
    const plan = await select(['dist/app.js']);
    assert.equal(plan.graphReused, true);
    assert.deepEqual(plan.tests, ['fs.test.ts']);
});

test('a test annotation cannot silence an imported helper, which must own its declaration', async t => {
    const { put, select } = fixture(t, false);
    put('read.ts', "import {readFileSync} from 'node:fs'; export const read=(file: string)=>readFileSync(file,'utf8');");
    put('fs.test.ts', "// @yomu-reads declared.txt\nimport {read} from './read'; it('helper',()=>read('actual.txt'));");
    assert.deepEqual((await select(['actual.txt'])).tests, ['fs.test.ts']);
    assert.deepEqual((await select(['unreferenced.txt'])).tests, ['fs.test.ts']);
    put('read.ts', "// @yomu-reads actual.txt\nimport {readFileSync} from 'node:fs'; export const read=(file: string)=>readFileSync(file,'utf8');");
    assert.deepEqual((await select(['actual.txt'])).tests, ['fs.test.ts']);
    assert.deepEqual((await select(['unreferenced.txt'])).tests, []);
});

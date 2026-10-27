import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, matchesGlob } from 'node:path';
import { StageCache, repositorySnapshot, selectInputs, stageKey } from '../../scripts/lib/stage-cache.mjs';

test('compiled input declarations preserve glob matching, exclusions and hidden configs', () => {
    const paths = ['src/a.ts', 'src/nested/a.ts', 'src/.hidden.ts', 'docs/.vitepress/config.mts', 'README.md', 'tsconfig.json', 'src/a.css'];
    const snapshot = Object.fromEntries(paths.map(path => [path, {}]));
    const visible = value => value.replace(/(^|\/)\./g, '$1__dot__');
    for (const patterns of [['src/**'], ['**', '!src/nested/**'], ['docs/**'], ['README.md', 'tsconfig*.json'], ['src/**/*.ts', '!src/.hidden.ts']]) {
        const expected = paths.filter(path => patterns.some(pattern => !pattern.startsWith('!') && matchesGlob(visible(path), visible(pattern)))
            && !patterns.some(pattern => pattern.startsWith('!') && matchesGlob(visible(path), visible(pattern.slice(1)))));
        assert.deepEqual(Object.keys(selectInputs(snapshot, patterns)), expected);
    }
});

test('content keys track staged, modified, untracked and deleted inputs; unrelated bytes do not invalidate', t => {
    const root = mkdtempSync(join(tmpdir(), 'yomu-cache-test-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const git = args => execFileSync('git', args, { cwd: root, stdio: 'pipe' });
    git(['init']);
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src/a.ts'), 'one');
    writeFileSync(join(root, 'README.md'), 'unrelated');
    git(['add', 'src/a.ts', 'README.md']);
    const key = () => stageKey({ command: 'test', inputs: selectInputs(repositorySnapshot(root), ['src/**']) });
    const original = key();
    assert.deepEqual(Object.keys(selectInputs({ 'docs/.vitepress/config.mts': {}, '.fallowrc.jsonc': {} }, ['**'])), ['docs/.vitepress/config.mts', '.fallowrc.jsonc']);
    writeFileSync(join(root, 'README.md'), 'other');
    assert.equal(key(), original);
    writeFileSync(join(root, 'src/a.ts'), 'two');
    const changed = key();
    assert.notEqual(changed, original);
    git(['add', 'src/a.ts']);
    assert.equal(key(), changed, 'staging identical bytes preserves the key');
    writeFileSync(join(root, 'src/b.ts'), 'new');
    assert.notEqual(key(), changed);
    rmSync(join(root, 'src/b.ts'));
    assert.equal(key(), changed);
    rmSync(join(root, 'src/a.ts'));
    assert.notEqual(key(), changed);
    assert.notEqual(stageKey({ command: 'other', inputs: {} }), stageKey({ command: 'test', inputs: {} }));
    assert.notEqual(stageKey({ command: 'test', inputs: {}, env: { CI: '1' } }), stageKey({ command: 'test', inputs: {} }));
    assert.notEqual(stageKey({ command: 'test', inputs: {}, node: 'other' }), stageKey({ command: 'test', inputs: {} }));
});

test('only successes cache; no-cache executes; writer outputs are verified including additions and deletions', async t => {
    const root = mkdtempSync(join(tmpdir(), 'yomu-cache-run-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    const directory = join(root, 'cache');
    const cache = new StageCache(root, { directory });
    const stage = { name: 'build', key: 'abc', outputs: ['dist/**'] };
    let executions = 0;
    const execute = () => { executions++; mkdirSync(join(root, 'dist'), { recursive: true }); writeFileSync(join(root, 'dist/app.js'), 'built'); };
    await assert.rejects(cache.run(stage, () => { throw new Error('failed'); }));
    assert.equal(cache.hit(stage.name, stage.key, stage.outputs), false);
    assert.equal((await cache.run(stage, execute)).cached, false);
    assert.equal((await cache.run(stage, execute)).cached, true);
    assert.equal(executions, 1);
    writeFileSync(join(root, 'dist/app.js'), 'corrupt');
    assert.equal((await cache.run(stage, execute)).cached, false);
    writeFileSync(join(root, 'dist/extra.js'), 'unexpected');
    assert.equal(cache.hit(stage.name, stage.key, stage.outputs), false);
    rmSync(join(root, 'dist/extra.js'));
    rmSync(join(root, 'dist/app.js'));
    assert.equal(cache.hit(stage.name, stage.key, stage.outputs), false);
    await cache.run(stage, execute);
    const forced = new StageCache(root, { directory, noCache: true });
    assert.equal((await forced.run(stage, execute)).cached, false);
    assert.equal(readFileSync(join(root, 'dist/app.js'), 'utf8'), 'built');
    const otherWorktree = new StageCache(root, { directory });
    assert.equal(otherWorktree.hit(stage.name, stage.key, stage.outputs), true);
    await assert.rejects(forced.run(stage, () => { throw new Error('forced failure'); }));
    assert.equal(cache.hit(stage.name, stage.key, stage.outputs), false, 'a forced failure retires an older pass');
});

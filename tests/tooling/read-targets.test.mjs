import { test } from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import { readTargets } from '../../scripts/lib/read-targets.mjs';

const inspect = source => readTargets(source, '/repo/tests/check.test.ts', '/repo', ts);
test('literal, joined, URL, glob and template reads are bounded to their own targets', () => {
    const reads = inspect(`
        import { readFileSync as read, readdirSync } from 'node:fs';
        const ROOT = process.cwd();
        const STYLE = path.join(ROOT, 'src', 'styles');
        read(path.join(STYLE, 'a.css'));
        read(new URL('../fixtures/input.json', import.meta.url));
        read(\`src/styles/\${name}.css\`);
        readdirSync(path.join(ROOT, 'public/academy'));
        import.meta.glob('../fixtures/*.json');
        const match = /x/.exec('x');
    `);
    assert.deepEqual(reads.targets, ['fixtures/*.json', 'fixtures/input.json', 'public/academy/**', 'src/styles/**', 'src/styles/a.css']);
    assert.deepEqual(reads.unknown, []);
});
test('generic readers and subprocesses stay unknown; annotations explicitly bound them', () => {
    const code = `import fs from 'node:fs'; import {execFileSync as execute} from 'node:child_process';
        fs.readFileSync(path); execute(process.execPath, args);`;
    assert.equal(inspect(code).unknown.length, 2);
    const bounded = inspect(`// @yomu-reads src/styles/** .github/workflows/release.yml\n${code}`);
    assert.deepEqual(bounded.targets, ['.github/workflows/release.yml', 'src/styles/**']);
    assert.deepEqual(bounded.unknown, []);
    assert.deepEqual(inspect(`const fs = require('fs'); fs.readFileSync(input);`).unknown.length, 1);
});
test('literal dynamic modules and subprocess bundle entrypoints declare import closures', () => {
    const reads = inspect(`// @yomu-imports src/entry.ts\nconst module = './module'; vi.importActual(module); import('./other');`);
    assert.deepEqual(reads.modules, ['/repo/src/entry.ts', '/repo/tests/module', '/repo/tests/other']);
    assert.deepEqual(inspect(`vi.importActual(computed);`).unknown, ['vi.importActual(computed)']);
});
test('filesystem API escapes and re-exports stay conservative; inline require reads are indexed', () => {
    assert.ok(inspect("export {readFileSync} from 'node:fs';").unknown.length);
    assert.ok(inspect("import {readFileSync} from 'node:fs'; export const read = readFileSync;").unknown.length);
    assert.deepEqual(inspect("require('node:fs').readFileSync('style.css');").targets, ['style.css']);
});

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
test('CommonJS subprocess aliases cannot disappear from the opaque-read index', () => {
    assert.ok(inspect("const {execFileSync: run} = require('node:child_process'); run('node', args);").unknown.length);
});
test('namespace aliases, computed fs members and escaped subprocess functions remain conservative', () => {
    for (const code of [
        "import fs from 'node:fs'; const io = fs; io.readFileSync(input);",
        "const fs = require('node:fs'); fs[operation](input);",
        "import {execFileSync} from 'node:child_process'; const run = execFileSync; run('node', args);",
        "import * as cp from 'node:child_process'; const run = cp; run.execFileSync('node', args);",
    ]) assert.ok(inspect(code).unknown.length, code);
    assert.deepEqual(inspect("const fs = require('node:fs'); fs.readFileSync('style.css');").unknown, []);
});

test('nearest bindings never borrow shadowed or mutable path initializers', () => {
    for (const code of [
        "const file='decoy'; function load(file: string) { readFileSync(file); }",
        "let file='decoy'; file='actual'; readFileSync(file);",
        "const file='decoy'; for (const file of files) readFileSync(file);",
        "const {file} = object; readFileSync(file);",
        "const file='decoy'; function load() { if (flag) {var file='actual';} readFileSync(file); }",
    ]) {
        const reads = inspect("import {readFileSync} from 'node:fs';" + code);
        assert.deepEqual(reads.targets, []);
        assert.ok(reads.unknown.length, code);
    }
    assert.deepEqual(inspect("import {readFileSync} from 'node:fs'; const file='outer'; { const file='inner'; readFileSync(file); } readFileSync(file);").targets, ['inner', 'outer']);
});
test('createRequire aliases, promises aliases and root-absolute Vite globs retain inputs', () => {
    const reads = inspect(`import {createRequire as factory} from 'node:module';
        const load = factory(import.meta.url); load('./fixture.json');
        import {promises as fsp} from 'node:fs'; fsp.readFile('promises.txt');
        import.meta.glob('/tests/fixtures/*.txt');`);
    assert.deepEqual(reads.modules, ['/repo/tests/fixture.json']);
    assert.deepEqual(reads.targets, ['promises.txt', 'tests/fixtures/*.txt']);
    assert.deepEqual(reads.unknown, []);
    assert.ok(inspect("import {build} from 'esbuild'; build(options);").unknown.length);
});
test('none may only declare a module without filesystem reads', () => {
    assert.throws(() => inspect('// @yomu-reads none actual.txt\nexport const value=1;'), /none must stand alone/);
    assert.throws(() => inspect("// @yomu-reads none\nimport {readFileSync} from 'node:fs'; readFileSync(path);"), /none cannot annotate filesystem reads/);
    assert.deepEqual(inspect('// @yomu-reads none\nexport const value=1;').unknown, []);
});

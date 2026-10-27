import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StageRunner } from '../../scripts/lib/stage-runner.mjs';

const require = createRequire(import.meta.url);
const ts = require('typescript');
const source = ts.createSourceFile('run-check.mjs', readFileSync('scripts/run-check.mjs', 'utf8'), ts.ScriptTarget.Latest, true);
function declaration(name) {
    let found;
    function visit(node) {
        if (ts.isCallExpression(node) && node.expression.getText(source) === 'run' && node.arguments[0]?.text === name) found = node;
        ts.forEachChild(node, visit);
    }
    visit(source);
    assert.ok(found, `missing stage ${name}`);
    return found;
}
function strings(node) {
    assert.ok(ts.isArrayLiteralExpression(node));
    return node.elements.map(element => { assert.ok(ts.isStringLiteralLike(element)); return element.text; });
}
function option(name, field) {
    const options = declaration(name).arguments[3];
    return strings(options.properties.find(property => property.name?.getText(source) === field).initializer);
}
function fixture(t) {
    const root = mkdtempSync(join(tmpdir(), 'yomu-writer-contract-'));
    t.after(() => rmSync(root, { recursive: true, force: true }));
    execFileSync('git', ['init'], { cwd: root, stdio: 'pipe' });
    mkdirSync(join(root, 'docs/public'), { recursive: true });
    mkdirSync(join(root, 'scripts'));
    return { root, runner: new StageRunner(root) };
}

test('the declared smoke coverage key includes additions to the walked scripts tree and the nightly list', t => {
    const { root, runner } = fixture(t);
    const stage = { name: 'smoke-workflow-coverage', command: 'true', inputs: strings(declaration('smoke-workflow-coverage').arguments[2]) };
    const before = runner.key(stage);
    for (const path of ['scripts/probe-smoke.mjs', 'scripts/run-nightly-smokes.mjs']) {
        writeFileSync(join(root, path), '// changed');
        runner.refresh();
        assert.notEqual(runner.key(stage), before, path);
        rmSync(join(root, path));
    }
});

test('Academy keys every hosted dependency its revision actually reads', t => {
    const { HOSTED_DEPENDENCIES } = require('../../scripts/lib/academy-revision.cjs');
    const { root, runner } = fixture(t);
    const stage = { name: 'build-academy', command: 'true', inputs: [], diskInputs: option('build-academy', 'diskInputs') };
    for (const path of HOSTED_DEPENDENCIES) {
        const before = runner.key(stage);
        writeFileSync(join(root, path), 'new hosted bytes');
        assert.notEqual(runner.key(stage), before, path);
        rmSync(join(root, path));
    }
    assert.ok(source.text.indexOf('await sync;') < declaration('build-academy').pos);
});

test('sync restore declarations preserve an edited hand-maintained icon', async t => {
    const { root, runner } = fixture(t);
    const icon = join(root, 'docs/public/yomu-icon.svg');
    writeFileSync(icon, 'old icon');
    const stage = { name: 'sync', command: `node -e "require('node:fs').writeFileSync('docs/public/yomu.css','generated')"`, inputs: [], outputs: option('sync-docs-userscript', 'outputs'), restoreOutputs: true };
    await runner.run(stage);
    writeFileSync(icon, 'new icon');
    await runner.run(stage);
    assert.equal(runner.timings.at(-1).cached, true);
    assert.equal(readFileSync(icon, 'utf8'), 'new icon');
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { StageRunner } from '../../scripts/lib/stage-runner.mjs';
import { hostedSyncSourceInputs, toolingStageContract } from '../../scripts/lib/gate-inputs.mjs';

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

test('hosted sync discovers new runtime edges and keys their bytes without rebuilding for unrelated source', t => {
    const { root, runner } = fixture(t);
    for (const dir of ['core', 'settings', 'app']) mkdirSync(join(root, 'src/reader', dir), { recursive: true });
    const boot = join(root, 'src/reader/core/hosted-appearance-boot.ts');
    writeFileSync(boot, 'export const boot = 1;');
    writeFileSync(join(root, 'src/reader/settings/hosted-appearance-settings.ts'), 'export const settings = 1;');
    writeFileSync(join(root, 'src/reader/app/site-nav.ts'), 'export const nav = 1;');
    const key = () => {
        runner.refresh();
        const inputs = hostedSyncSourceInputs(root);
        return runner.key({ name: 'sync', command: 'true', inputs, diskInputs: inputs });
    };
    const before = key();
    writeFileSync(join(root, 'src/reader/core/unrelated.ts'), 'export const other = 1;');
    assert.equal(key(), before);
    writeFileSync(boot, "export { other } from './unrelated';");
    assert.ok(hostedSyncSourceInputs(root).includes('src/reader/core/unrelated.ts'));
    const linked = key();
    assert.notEqual(linked, before);
    writeFileSync(join(root, 'src/reader/core/unrelated.ts'), 'export const other = 2;');
    assert.notEqual(key(), linked);
});

test('tooling cache observes repository and compiler membership plus test bytes', t => {
    const { root, runner } = fixture(t);
    mkdirSync(join(root, 'src'));
    mkdirSync(join(root, 'tests'));
    const product = join(root, 'src/product.ts');
    writeFileSync(product, 'export const value = 1;');
    const key = (compiler = ['src/product.ts']) => {
        runner.refresh();
        return runner.key({ name: 'tooling', command: 'true', ...toolingStageContract(runner.snapshot, compiler) });
    };
    const before = key();
    writeFileSync(product, 'export const value = 2;');
    assert.equal(key(), before);
    assert.notEqual(key(['src/product.ts', 'public/data.json']), before);
    writeFileSync(join(root, 'src/new.ts'), 'export const added = 1;');
    const added = key();
    assert.notEqual(added, before);
    mkdirSync(join(root, 'tests/tooling'));
    writeFileSync(join(root, 'tests/tooling/a.test.mjs'), "it('path', () => read('src/new.ts')); ");
    assert.notEqual(key(), added);
    const withTest = key();
    writeFileSync(join(root, 'tests/tooling/a.test.mjs'), '// changed tooling test');
    assert.notEqual(key(), withTest);
    writeFileSync(join(root, 'src/product.ts'), 'export const value = 3;');
    const changedProduct = key();
    writeFileSync(join(root, 'src/product.ts'), 'export const value = 4;');
    assert.equal(key(), changedProduct);
});

test('Academy keys its runtime imports and CSS import closure without unrelated Reader source', async t => {
    const { academyBuildInputs } = await import('../../scripts/lib/gate-inputs.mjs');
    const { root, runner } = fixture(t);
    for (const path of ['src/academy', 'src/reader/styles']) mkdirSync(join(root, path), { recursive: true });
    writeFileSync(join(root, 'src/academy/entrypoint.ts'), "import '../reader/styles.css'; export const academy = 1;");
    writeFileSync(join(root, 'src/reader/styles.css'), "@import './styles/shared.css';");
    const css = join(root, 'src/reader/styles/shared.css');
    writeFileSync(css, 'body { color: red; }');
    const key = () => { runner.refresh(); return runner.key({ name: 'academy', command: 'true', inputs: academyBuildInputs(root) }); };
    const before = key();
    writeFileSync(join(root, 'src/reader/unrelated.ts'), 'export const value = 1;');
    assert.equal(key(), before);
    writeFileSync(css, 'body { color: green; }');
    assert.notEqual(key(), before);
});

test('generated asset names and retention data do not invalidate native tooling source proofs', t => {
    const { root, runner } = fixture(t);
    mkdirSync(join(root, 'config/ci'), { recursive: true });
    const key = () => { runner.refresh(); return runner.key({ name: 'tooling', command: 'true', ...toolingStageContract(runner.snapshot, ['src/a.ts']) }); };
    const before = key();
    writeFileSync(join(root, 'docs/public/yomu.abc.css'), 'generated');
    writeFileSync(join(root, 'config/ci/content-addressed-retention.json'), '{"generated":true}');
    assert.equal(key(), before);
});

test('JavaScript cache excludes independent CSS but retains CSS value dependencies and unfamiliar loaders', async t => {
    const { javascriptBuildInputs } = await import('../../scripts/lib/gate-inputs.mjs');
    const { root, runner } = fixture(t);
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'src/entry.ts'), 'export const value = 1;');
    writeFileSync(join(root, 'src/style.css'), 'body {color:red}');
    const input = () => { runner.refresh(); return runner.key({name:'code',command:'true',inputs:javascriptBuildInputs(root, ['src/**'], ['src/entry.ts'])}); };
    const before = input();
    writeFileSync(join(root, 'src/style.css'), 'body {color:green}');
    assert.equal(input(), before);
    writeFileSync(join(root, 'src/entry.ts'), "import './style.css';");
    const withCss = input();
    writeFileSync(join(root, 'src/style.css'), 'body {color:blue}');
    assert.notEqual(input(), withCss);
    writeFileSync(join(root, 'src/entry.ts'), "import text from './style.css?unknown'; export {text};");
    const unfamiliar = input();
    writeFileSync(join(root, 'src/style.css'), 'body {color:black}');
    assert.notEqual(input(), unfamiliar);
});

test('worker stage keys declared source/workflows and new static dependencies, not unrelated Reader bytes', async t => {
    const {workerStageInputs}=await import('../../scripts/lib/gate-inputs.mjs');
    const {root,runner}=fixture(t);
    for(const dir of ['tests/workers','workers/shared','src/reader','.github/workflows'])mkdirSync(join(root,dir),{recursive:true});
    writeFileSync(join(root,'tests/workers/probe.test.ts'),"import {value} from '../../workers/shared/value';");
    writeFileSync(join(root,'workers/shared/value.ts'),'export const value=1;');
    writeFileSync(join(root,'src/reader/unrelated.ts'),'export const other=1;');
    const key=()=>{runner.refresh();return runner.key({name:'workers',command:'true',inputs:workerStageInputs(root,runner.snapshot)});};
    const before=key();writeFileSync(join(root,'src/reader/unrelated.ts'),'export const other=2;');assert.equal(key(),before);
    writeFileSync(join(root,'.github/workflows/production-health.yml'),'changed cron');assert.notEqual(key(),before);
});

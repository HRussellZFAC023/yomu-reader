'use strict';

const assert = require('node:assert/strict');
const { readFileSync, writeFileSync, mkdtempSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const { test } = require('node:test');
const { createInstrumenter } = require('istanbul-lib-instrument');
const { mergeReaderQualityCoverage } = require('./merge-reader-quality-coverage.mjs');

function measure(source, filename, invoke) {
    const instrumenter = createInstrumenter({ coverageVariable: '__FIXTURE_COVERAGE__',
        coverageGlobalScope: 'globalThis', coverageGlobalScopeFunc: false });
    const sandbox = { module: { exports: {} }, globalThis: {}, Buffer, setTimeout };
    runInNewContext(instrumenter.instrumentSync(source, filename), sandbox);
    invoke(sandbox.module.exports);
    return JSON.parse(JSON.stringify(sandbox.globalThis.__FIXTURE_COVERAGE__));
}

function fixture() {
    const root = mkdtempSync(join(tmpdir(), 'pages-coverage-merge-'));
    const readerFile = join(root, 'reader-fixture.cjs');
    const gamingFile = join(root, 'gaming-fixture.cjs');
    const reader = measure('module.exports = n => n + 1;', readerFile, fn => fn(1));
    const gaming = measure('module.exports = n => n * 2;', gamingFile, fn => fn(2));
    const gate = join(__dirname, 'lib/pages-deploy-gate.cjs');
    const pages = measure(readFileSync(gate, 'utf8'), gate, api => {
        assert.equal(api.EXPECTED_JOBS.length, 26);
        assert.throws(() => api.checkoutCommit('', 'fixture/repository'), /checkout step/);
    });
    const paths = ['reader', 'gaming', 'pages', 'merged'].map(name => join(root, `${name}.json`));
    [reader, gaming, pages].forEach((map, index) => writeFileSync(paths[index], JSON.stringify(map)));
    return { reader, gaming, pages, paths, gate, readerFile, gamingFile, merge: () => mergeReaderQualityCoverage(...paths) };
}

test('merges real executed Pages counters and preserves both Reader/Gaming maps', () => {
    const control = fixture();
    control.merge();
    const merged = JSON.parse(readFileSync(control.paths[3], 'utf8'));
    assert.deepEqual(merged[control.readerFile], control.reader[control.readerFile]);
    assert.deepEqual(merged[control.gamingFile], control.gaming[control.gamingFile]);
    assert.deepEqual(merged[control.gate], control.pages[control.gate]);
});

for (const [name, change, error] of [
    ['missing Pages map', control => { control.paths[2] += '.missing'; }, /ENOENT/],
    ['empty Pages map', control => writeFileSync(control.paths[2], '{}'), /real deployment gate/],
    ['unrelated-only Pages map', control => writeFileSync(control.paths[2], JSON.stringify(control.reader)), /real deployment gate/],
    ['all-zero Pages map', control => {
        Object.keys(control.pages[control.gate].s).forEach(key => { control.pages[control.gate].s[key] = 0; });
        writeFileSync(control.paths[2], JSON.stringify(control.pages));
    }, /actual statement coverage/],
    ['invalid JSON Pages map', control => writeFileSync(control.paths[2], '{'), /JSON/],
    ['malformed Istanbul Pages map', control => writeFileSync(control.paths[2], JSON.stringify({ [control.gate]: { path: control.gate, s: { 0: 1 } } })), /coverage|Coverage/],
    ['empty Reader map', control => writeFileSync(control.paths[0], '{}'), /Both real coverage scopes/],
    ['empty Gaming map', control => writeFileSync(control.paths[1], '{}'), /Both real coverage scopes/],
]) {
    test(`fails before writing merged output: ${name}`, () => {
        const control = fixture();
        change(control);
        assert.throws(control.merge, error);
        assert.equal(existsSync(control.paths[3]), false);
    });
}

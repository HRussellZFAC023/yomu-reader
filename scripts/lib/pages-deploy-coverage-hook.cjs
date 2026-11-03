'use strict';

const { readFileSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const Module = require('node:module');
const { createInstrumenter } = require('istanbul-lib-instrument');

const target = resolve(__dirname, 'pages-deploy-gate.cjs');
const loadCommonJs = Module._extensions['.cjs'] || Module._extensions['.js'];
const instrumenter = createInstrumenter({ coverageVariable: '__YOMU_PAGES_COVERAGE__',
    coverageGlobalScope: 'globalThis', coverageGlobalScopeFunc: false });

// The single Node test file runs in one child. Instrument only its real gate
// module; the parent test runner has no counters and cannot overwrite the map.
Module._extensions['.cjs'] = (module, filename) => {
    if (filename !== target) return loadCommonJs(module, filename);
    module._compile(instrumenter.instrumentSync(readFileSync(filename, 'utf8'), filename), filename);
};

process.on('exit', () => {
    if (!globalThis.__YOMU_PAGES_COVERAGE__) return;
    writeFileSync(process.env.YOMU_PAGES_COVERAGE_OUTPUT, JSON.stringify(globalThis.__YOMU_PAGES_COVERAGE__));
});

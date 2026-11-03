import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const coverageRequire = createRequire(require.resolve('@vitest/coverage-istanbul'));
const { createCoverageMap } = coverageRequire('istanbul-lib-coverage');

// Reader serializes a bootstrap into a separate page realm. Instrumenting that
// function while running native bootstrap tests injects an unavailable counter.
// The two real test passes measure their respective source boundaries, then
// Istanbul merges shared Reader functions and the Node-tested Pages boundary
// into the same Fallow input map.
function readMeasuredPagesCoverage(input) {
    const pages = createCoverageMap(JSON.parse(readFileSync(input, 'utf8')));
    const gate = path.resolve(import.meta.dirname, 'lib/pages-deploy-gate.cjs');
    if (!pages.files().includes(gate)) throw new Error('Pages coverage must contain the real deployment gate.');
    if (!Object.values(pages.fileCoverageFor(gate).s).some(count => count > 0)) {
        throw new Error('Pages gate tests did not produce actual statement coverage.');
    }
    return pages;
}

export function mergeReaderQualityCoverage(readerInput, gamingInput, pagesInput, output) {
    const coverage = createCoverageMap(JSON.parse(readFileSync(readerInput, 'utf8')));
    const gaming = createCoverageMap(JSON.parse(readFileSync(gamingInput, 'utf8')));
    const pages = readMeasuredPagesCoverage(pagesInput);
    if (!coverage.files().length || !gaming.files().length) throw new Error('Both real coverage scopes must contain source files.');
    coverage.merge(gaming);
    coverage.merge(pages);
    writeFileSync(output, JSON.stringify(coverage.toJSON()));
    console.log(`[quality-coverage] Merged Reader, Gaming, and Pages Istanbul maps: ${coverage.files().length} source files.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);
    if (args.length !== 4) throw new Error('Expected reader map, gaming map, Pages map, and output path.');
    mergeReaderQualityCoverage(...args);
}

import { join } from 'node:path';
import { StageCache, outputHashes, selectInputs, readJson, stageKey, writeJson } from './stage-cache.mjs';
import { runtimeEnv, testEnvironment } from './stage-runner.mjs';

const TEST_INPUTS = ['**', '!docs/.vitepress/dist/**', '!docs/.vitepress/cache/**', '!docs/.vitepress/.temp/**'];
const FULL_INPUTS = ['package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig*.json', 'config/vite/**', 'config/dictionaries/vitest.config.ts', 'tests/**/setup*', 'scripts/run-ci-*.mjs', 'scripts/lib/ci-*.mjs', 'scripts/lib/test-workers.mjs', 'scripts/lib/affected-tests.mjs', 'scripts/lib/test-selection.mjs', 'scripts/lib/read-targets.mjs', 'scripts/lib/selection-graph.mjs', 'scripts/run-local-tests.mjs', 'scripts/lib/local-gate-pool.mjs', 'scripts/lib/local-gate-worker.mjs', 'scripts/lib/slot-queue.mjs', 'config/ci/local-contract-tests.json'];

function changedInputs(previous, current) {
    return [...new Set([...Object.keys(previous), ...Object.keys(current)])]
        .filter(path => JSON.stringify(previous[path]) !== JSON.stringify(current[path])).sort();
}

export function testPlan(root, snapshot, { noCache = false, env = {}, suite = 'reader' } = {}) {
    const cache = new StageCache(root);
    const compatibilityEnv = { ...Object.fromEntries([...runtimeEnv, ...testEnvironment].map(name => [name, process.env[name] ?? null])), ...env };
    const compatibility = stageKey({ command: 'full-test-baseline-v2', inputs: selectInputs(snapshot, FULL_INPUTS), env: compatibilityEnv, extra: outputHashes(root, ['node_modules/.package-lock.json']) });
    const baselinePath = join(cache.directory, 'full-tests', suite, `${compatibility}.json`);
    const baseline = readJson(baselinePath);
    // Ignored products are also readable by tests. A changed disk artifact must
    // affect selection as well as the stage key, or an empty selection could
    // replace a real test run after that artifact was corrupted.
    const inputs = { ...selectInputs(snapshot, TEST_INPUTS), ...Object.fromEntries(Object.entries(outputHashes(root, ['dist/**', 'docs/public/**'])).map(([path, hash]) => [path, { diskHash: hash }])) };
    const changed = baseline ? changedInputs(baseline.inputs, inputs) : [];
    return {
        full: noCache || Boolean(process.env.CI) || !baseline,
        reason: noCache || process.env.CI ? 'forced full suite; caches/selection disabled' : !baseline ? 'no compatible full-pass baseline' : 'unchanged full-pass baseline',
        changed,
        inputs,
        compatibility,
        // A related pass is never promoted to a full baseline.
        saveFullPass() { writeJson(baselinePath, { inputs, compatibility }); },
    };
}

export const testInputs = TEST_INPUTS;

import { join } from 'node:path';
import { StageCache, selectInputs, readJson, stageKey, writeJson } from './stage-cache.mjs';
import { runtimeEnv } from './stage-runner.mjs';

const TEST_INPUTS = ['src/**', 'tests/**', 'workers/**', 'scripts/**', 'config/**', 'public/**', 'docs/**', '!docs/.vitepress/dist/**', '!docs/.vitepress/cache/**', '!docs/.vitepress/.temp/**', 'README.md', 'CHANGELOG.md', 'package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig*.json'];
const FULL_INPUTS = ['package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig*.json', 'config/vite/**', 'config/dictionaries/vitest.config.ts', 'tests/**/setup*', 'scripts/run-ci-*.mjs', 'scripts/lib/ci-*.mjs', 'scripts/lib/test-workers.mjs', 'scripts/lib/affected-tests.mjs'];

function changedInputs(previous, current) {
    return [...new Set([...Object.keys(previous), ...Object.keys(current)])]
        .filter(path => JSON.stringify(previous[path]) !== JSON.stringify(current[path])).sort();
}

export function testPlan(root, snapshot, { noCache = false, env = {}, suite = 'reader' } = {}) {
    const cache = new StageCache(root);
    const compatibilityEnv = { ...Object.fromEntries(runtimeEnv.map(name => [name, process.env[name] ?? null])), ...env };
    const compatibility = stageKey({ command: 'full-test-baseline', inputs: selectInputs(snapshot, FULL_INPUTS), env: compatibilityEnv });
    const baselinePath = join(cache.directory, 'full-tests', suite, `${compatibility}.json`);
    const baseline = readJson(baselinePath);
    const inputs = selectInputs(snapshot, TEST_INPUTS);
    const changed = baseline ? changedInputs(baseline.inputs, inputs) : [];
    return {
        full: noCache || !baseline,
        changed,
        inputs,
        compatibility,
        // A related pass is never promoted to a full baseline.
        saveFullPass() { writeJson(baselinePath, { inputs, compatibility }); },
    };
}

export const testInputs = TEST_INPUTS;

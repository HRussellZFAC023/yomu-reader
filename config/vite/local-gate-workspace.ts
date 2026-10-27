import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { readerNodeFiles, readerTestDefines } = createRequire(import.meta.url)('./reader-test.ts') as typeof import('./reader-test');

const readPlan = (suite: string): string[] => JSON.parse(readFileSync(`artifacts/check-logs/affected-tests-${suite}.json`, 'utf8')).tests;
const reader = readPlan('reader');
const academy = readPlan('academy');
const contracts = JSON.parse(readFileSync('config/ci/local-contract-tests.json', 'utf8')) as Record<string, string>;
const localNode = readerNodeFiles.filter(file => !contracts[file]);
const node = new Set<string>(readerNodeFiles);
const project = (name: string, files: string[], environment: 'node' | 'jsdom', setupFiles: string[] = []) => ({
    define: { ...readerTestDefines },
    test: {
        name, include: files.length ? files : ['artifacts/no-selected-tests/**/*.test.ts'],
        environment, setupFiles, globals: true, retry: 0, testTimeout: 30_000,
        pool: 'forks' as const, poolOptions: { forks: { isolate: true } },
    },
});
export default [
    project('reader-node', localNode, 'node'),
    project('reader-jsdom', reader.filter(file => !node.has(file)), 'jsdom', ['tests/reader/setup.ts']),
    // Academy's mock owner is isolated along with every selected Academy file.
    project('academy', academy, 'jsdom'),
];

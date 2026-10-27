import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const { readerNodeFiles } = createRequire(import.meta.url)('./reader-test.ts') as typeof import('./reader-test');

const readPlan = (suite: string): string[] => JSON.parse(readFileSync(`artifacts/check-logs/affected-tests-${suite}.json`, 'utf8')).tests;
const contracts = JSON.parse(readFileSync('config/ci/local-contract-tests.json', 'utf8')) as Record<string, string>;
const node = new Set<string>(readerNodeFiles);
export const localNode = readerNodeFiles.filter(file => !contracts[file]);
export const localReader = readPlan('reader').filter(file => !node.has(file) && !contracts[file]);
export const localAcademy = readPlan('academy');

#!/usr/bin/env node
// CI backstop for bounded filesystem annotations. Run after a traced full suite.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { selectAffectedTests } from './lib/test-selection.mjs';
import { testReadCoverage } from './lib/test-read-coverage.mjs';

const root = process.cwd();
const suite = process.argv[2];
if (!['reader', 'academy'].includes(suite)) throw new Error('expected reader or academy');
const plan = await selectAffectedTests(root, ['__read_coverage_audit__'], { config: suite === 'academy' ? 'config/vite/academy.config.ts' : undefined });
if (plan.full) throw new Error(plan.reason);
const { graph, modules } = JSON.parse(readFileSync(`artifacts/check-logs/graph-${suite}.json`, 'utf8'));
const events = readdirSync('artifacts/test-read-trace').filter(file => file.endsWith('.jsonl'))
    .flatMap(file => readFileSync(join('artifacts/test-read-trace', file), 'utf8').trim().split('\n').filter(Boolean).map(line => JSON.parse(line)))
    .filter(event => event.test.startsWith(`tests/${suite}/`));
if (!readdirSync('artifacts/test-read-trace').some(file => file.endsWith('.preload'))) throw new Error('filesystem trace preload did not run');
const { failures, precautionary } = testReadCoverage(root, graph, modules, events);
console.log(`${suite}: ${events.length} observed reads; ${precautionary.length} precautionary tests; ${failures.length} uncovered bounded reads`);
for (const failure of failures) console.error(failure);
if (failures.length) process.exitCode = 1;

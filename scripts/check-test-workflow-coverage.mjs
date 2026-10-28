#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const WORKFLOW = readFileSync(join(ROOT, '.github/workflows/ci.yml'), 'utf8');
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;
const gates = [
    {
        directory: 'tests/reader',
        workflowCommand: 'node scripts/run-ci-tests.mjs',
    },
    {
        directory: 'tests/academy',
        workflowCommand: 'npm run test:academy:ci',
    },
    {
        directory: 'tests/workers',
        workflowCommand: 'npm run test:workers',
    },
];

const allTests = collect(join(ROOT, 'tests')).filter(file => TEST_FILE.test(file));
const assigned = new Set();
const missingCommands = [];

for (const gate of gates) {
    if (!WORKFLOW.includes(gate.workflowCommand)) missingCommands.push(gate.workflowCommand);
    for (const file of allTests) {
        const path = relative(ROOT, file);
        if (path === gate.directory || path.startsWith(`${gate.directory}/`)) assigned.add(file);
    }
}

const orphaned = allTests.filter(file => !assigned.has(file));
if (missingCommands.length || orphaned.length) {
    console.error(`[test-workflows] FAIL: ${orphaned.length + missingCommands.length} workflow coverage gap(s).`);
    for (const command of missingCommands) console.error(`  missing workflow command: ${command}`);
    for (const file of orphaned) console.error(`  orphaned test: ${relative(ROOT, file)}`);
    process.exit(1);
}

console.log(`[test-workflows] PASS: ${assigned.size}/${allTests.length} test files assigned to push/PR gates; orphaned 0.`);
for (const gate of gates) {
    const count = allTests.filter(file => relative(ROOT, file).startsWith(`${gate.directory}/`)).length;
    console.log(`  ${gate.directory}: ${count}`);
}

function collect(directory) {
    const files = [];
    for (const entry of readdirSync(directory).sort()) {
        const path = join(directory, entry);
        if (statSync(path).isDirectory()) files.push(...collect(path));
        else files.push(path);
    }
    return files;
}

#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const TEST_ROOT = join(ROOT, 'tests/academy');
const baseline = JSON.parse(readFileSync(join(ROOT, 'config/ci/academy-known-failures.json'), 'utf8'));
const knownFailures = new Set(baseline.failures.map(failureKey));
const expectedFiles = collect(TEST_ROOT).filter(file => /\.test\.[cm]?[jt]sx?$/.test(file));
const outputDirectory = mkdtempSync(join(tmpdir(), 'yomu-academy-ci-'));
const outputFile = join(outputDirectory, 'vitest.json');

try {
    const result = spawnSync(join(ROOT, 'node_modules/.bin/vitest'), [
        'run',
        '--config', 'config/vite/academy.config.ts',
        '--reporter=json',
        `--outputFile=${outputFile}`,
    ], {
        cwd: ROOT,
        env: { ...process.env, VITEST_ISOLATE: '1' },
        stdio: 'inherit',
    });

    if (!statExists(outputFile)) {
        console.error(`[academy-ci] Vitest produced no JSON report (exit ${result.status ?? 'unknown'}).`);
        process.exit(result.status ?? 1);
    }

    const report = JSON.parse(readFileSync(outputFile, 'utf8'));
    const results = report.testResults ?? [];
    const executedFiles = new Set(results.map(result => relative(ROOT, result.name)));
    const missingFiles = expectedFiles
        .map(file => relative(ROOT, file))
        .filter(file => !executedFiles.has(file));
    const failed = results.flatMap(result => (result.assertionResults ?? [])
        .filter(assertion => assertion.status === 'failed')
        .map(assertion => ({
            file: relative(ROOT, result.name),
            name: assertion.fullName.trim(),
        })));
    const unexpected = failed.filter(failure => !knownFailures.has(failureKey(failure)));
    const quarantined = failed.filter(failure => knownFailures.has(failureKey(failure)));
    const recovered = baseline.failures.filter(failure =>
        !failed.some(current => failureKey(current) === failureKey(failure)));

    console.log(`[academy-ci] Executed ${executedFiles.size}/${expectedFiles.length} Academy test files.`);
    console.log(`[academy-ci] ${report.numTotalTests ?? 'unknown'} assertions; ${quarantined.length} known failures remain quarantined; ${recovered.length} recovered.`);
    for (const failure of quarantined) {
        console.warn(`[academy-ci] QUARANTINED ${failure.file} :: ${failure.name}`);
    }
    for (const failure of recovered) {
        console.log(`[academy-ci] RECOVERED ${failure.file} :: ${failure.name}`);
    }
    for (const failure of unexpected) {
        console.error(`[academy-ci] UNEXPECTED ${failure.file} :: ${failure.name}`);
    }
    for (const file of missingFiles) console.error(`[academy-ci] NOT EXECUTED ${file}`);

    if (unexpected.length || missingFiles.length) process.exit(1);
    console.log('[academy-ci] PASS: every Academy test file executed and no failure escaped the explicit baseline.');
} finally {
    rmSync(outputDirectory, { recursive: true, force: true });
}

function failureKey(failure) {
    return `${failure.file}\0${failure.name.trim()}`;
}

function statExists(path) {
    try {
        return statSync(path).isFile();
    } catch {
        return false;
    }
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

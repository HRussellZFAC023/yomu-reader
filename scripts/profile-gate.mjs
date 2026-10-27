#!/usr/bin/env node
// Isolated wall-clock measurements; logs/reports stay in ignored artifacts/.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { availableParallelism, loadavg, freemem } from 'node:os';
import { resolve, delimiter } from 'node:path';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const args = process.argv.slice(2);
const selected = args.find(arg => arg.startsWith('--stages='))?.slice(9).split(',');
const label = args.find(arg => arg.startsWith('--label='))?.slice(8) ?? 'profile';
const commands = args.includes('--build-steps')
    ? pkg.scripts['build:userscript'].split(' && ').map((command, i) => [`build-${i + 1}`, command])
    : [
        ['repository-hygiene', 'npm run -s check:repository'],
        ['content-addressed-retention', 'node scripts/prune-content-addressed-assets.mjs --check'],
        ['committed-artifacts', 'npm run -s check:artifacts'],
        ['smoke-workflow-coverage', 'node scripts/check-smoke-workflow-coverage.mjs'],
        ['css-has', 'npm run -s check:css-has'],
        ['recorded-pages', 'npm run -s check:recorded-pages'],
        ...['typecheck', 'test:ci', 'build', 'build:academy:prevalidated', 'docs:build', 'verify'].map(name => [name, `npm run -s ${name}`]),
    ];
mkdirSync('artifacts/check-profile', { recursive: true });
const results = [];
for (const [name, command] of commands) {
    if (selected && !selected.includes(name)) continue;
    console.log(`[profile] start ${name}: ${command}`);
    const start = performance.now();
    const result = spawnSync('sh', ['-c', command], {
        encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
        env: { ...process.env, PATH: `${resolve('node_modules/.bin')}${delimiter}${process.env.PATH}` },
    });
    const seconds = (performance.now() - start) / 1000;
    writeFileSync(`artifacts/check-profile/${label}-${name.replaceAll(':', '-')}.log`, `${result.stdout ?? ''}${result.stderr ?? ''}`);
    results.push({ name, command, seconds, status: result.status ?? 1 });
    console.log(`[profile] ${name}: ${seconds.toFixed(2)}s, exit ${result.status}`);
    writeFileSync(`artifacts/check-profile/${label}.json`, JSON.stringify({ node: process.version, cores: availableParallelism(), load: loadavg(), freeBytes: freemem(), results }, null, 2));
    if (result.status !== 0) process.exitCode = 1;
}

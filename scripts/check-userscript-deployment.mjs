#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { verifyUserscriptDeployment } from './lib/userscript-deployment.mjs';

const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--file')) {
    throw new Error('Usage: node scripts/check-userscript-deployment.mjs [--file dist/yomu.user.js]');
}
const sources = args.length ? [args[1]] : [
    'https://yomureader.com/yomu.user.js',
    'https://update.greasyfork.org/scripts/581653/%E3%82%88%E3%82%80.user.js',
];

for (const location of sources) {
    try {
        let source;
        if (args.length) source = readFileSync(location, 'utf8');
        else {
            const response = await fetch(location, { signal: AbortSignal.timeout(20_000), cache: 'no-store' });
            if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
            source = await response.text();
        }
        const report = await verifyUserscriptDeployment(source);
        console.log(`${location}: version ${report.version}`);
        for (const result of report.results) {
            console.log(`${result.ok ? 'ok' : 'FAIL'} ${result.kind} ${result.url}: ${result.detail}`);
        }
        if (!report.ok) process.exitCode = 1;
    } catch (error) {
        console.error(`FAIL ${location}: ${error.message}`);
        process.exitCode = 1;
    }
}

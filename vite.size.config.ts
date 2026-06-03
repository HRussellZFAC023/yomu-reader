// Wraps the userscript build with a per-module rendered-size reporter.
// Usage: npm run size:modules  (writes dist/module-sizes.json and prints a
// diff against .module-sizes-baseline.json, if present).
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import baseConfigFn from './vite.config';

const base = (baseConfigFn as (env: { command: string; mode: string }) => Record<string, unknown>)({
    command: 'build',
    mode: 'production',
});

const snapshotFile = path.resolve(__dirname, '.module-sizes.json');
const baselineFile = path.resolve(__dirname, '.module-sizes-baseline.json');

// Build into a scratch directory so size reporting never disturbs real dist
// artifacts (yomu.css, compliance annotations, newtab build).
const baseBuild = (base as { build: Record<string, unknown> }).build;
baseBuild.outDir = '.size-report';
baseBuild.emptyOutDir = true;

interface ModuleSizeRow {
    id: string;
    bytes: number;
}

interface ModuleSizeSnapshot {
    total: number;
    modules: ModuleSizeRow[];
}

function moduleSizeReporter(): Plugin {
    return {
        name: 'yomu-module-size-reporter',
        generateBundle(_options, bundle) {
            for (const chunk of Object.values(bundle)) {
                if (chunk.type !== 'chunk') continue;
                const rows: ModuleSizeRow[] = Object.entries(chunk.modules)
                    .map(([id, rendered]) => ({
                        id: path.relative(__dirname, id),
                        bytes: rendered.renderedLength,
                    }))
                    .sort((a, b) => b.bytes - a.bytes);
                const total = rows.reduce((sum, row) => sum + row.bytes, 0);
                fs.mkdirSync(path.dirname(snapshotFile), { recursive: true });
                fs.writeFileSync(snapshotFile, `${JSON.stringify({ total, modules: rows }, null, 1)}\n`);
                printReport(rows, total, readSnapshot(baselineFile));
            }
        },
    };
}

function readSnapshot(file: string): ModuleSizeSnapshot | null {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        return null;
    }
}

function printReport(rows: ModuleSizeRow[], total: number, baseline: ModuleSizeSnapshot | null): void {
    console.log(`\nPer-module rendered bytes (top 25 of ${rows.length}; total ${total.toLocaleString()}):`);
    const baselineByModule = new Map((baseline?.modules ?? []).map(row => [row.id, row.bytes]));
    for (const row of rows.slice(0, 25)) {
        const before = baselineByModule.get(row.id);
        const delta = before === undefined ? '' : ` (${row.bytes - before >= 0 ? '+' : ''}${(row.bytes - before).toLocaleString()})`;
        console.log(`${String(row.bytes).padStart(9)}  ${row.id}${delta}`);
    }
    if (baseline) {
        console.log(`Total delta vs baseline: ${total - baseline.total >= 0 ? '+' : ''}${(total - baseline.total).toLocaleString()} bytes`);
    } else {
        console.log('No baseline snapshot; copy dist/module-sizes.json to .module-sizes-baseline.json to diff future runs.');
    }
}

(base as { plugins: Plugin[] }).plugins.push(moduleSizeReporter());

export default base;

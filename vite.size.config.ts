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
    printTopModuleSizeRows(rows, moduleSizeBaselineMap(baseline));
    console.log(moduleSizeBaselineReport(total, baseline));
}

function moduleSizeBaselineMap(baseline: ModuleSizeSnapshot | null): Map<string, number> {
    return new Map(moduleSizeBaselineRows(baseline).map(row => [row.id, row.bytes]));
}

function moduleSizeBaselineRows(baseline: ModuleSizeSnapshot | null): ModuleSizeRow[] {
    return baseline ? baseline.modules : [];
}

function printTopModuleSizeRows(rows: ModuleSizeRow[], baselineByModule: Map<string, number>): void {
    for (const row of rows.slice(0, 25)) console.log(moduleSizeReportRow(row, baselineByModule));
}

function moduleSizeReportRow(row: ModuleSizeRow, baselineByModule: Map<string, number>): string {
    return `${String(row.bytes).padStart(9)}  ${row.id}${moduleSizeDelta(row, baselineByModule.get(row.id))}`;
}

function moduleSizeDelta(row: ModuleSizeRow, baselineBytes: number | undefined): string {
    return baselineBytes === undefined ? '' : ` (${signedNumber(row.bytes - baselineBytes)})`;
}

function totalSizeDeltaReport(total: number, baselineTotal: number): string {
    return `Total delta vs baseline: ${signedNumber(total - baselineTotal)} bytes`;
}

function moduleSizeBaselineReport(total: number, baseline: ModuleSizeSnapshot | null): string {
    if (!baseline) return missingBaselineReport();
    return totalSizeDeltaReport(total, baseline.total);
}

function signedNumber(value: number): string {
    return `${value >= 0 ? '+' : ''}${value.toLocaleString()}`;
}

function missingBaselineReport(): string {
    return 'No baseline snapshot; copy dist/module-sizes.json to .module-sizes-baseline.json to diff future runs.';
}

(base as { plugins: Plugin[] }).plugins.push(moduleSizeReporter());

export default base;

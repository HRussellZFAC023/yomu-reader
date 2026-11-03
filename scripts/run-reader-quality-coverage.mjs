import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { mergeReaderQualityCoverage } from './merge-reader-quality-coverage.mjs';

const root = path.resolve(import.meta.dirname, '..');
const require = createRequire(import.meta.url);
const vitest = path.join(path.dirname(require.resolve('vitest/package.json')), 'vitest.mjs');
const workDir = path.resolve(root, process.env.YOMU_QUALITY_COVERAGE_WORK_DIR || 'artifacts');
const tempDir = path.join(workDir, 'quality-coverage-temp');
mkdirSync(tempDir, { recursive: true });
const scopes = {
    reader: {
        include: ['src/reader/**/*.ts', 'docs/public/hosted-reader-worker.js'],
        directory: 'fallow-coverage',
        tests: [
            'reading-media-boundary', 'detached-reading-overlay', 'reading-lane-layout',
            'projected-reading-crowding', 'projected-reading-scheduling', 'additive-mirror-source-projection',
            'synthetic-mirror-source-ranges', 'projection-sibling-realign', 'furigana-tap-band',
            'subtitle-control-rail', 'hover-lookup', 'decoration-policy', 'mirror-page-reveal',
            'mirror-observer-leak', 'repaint-loop-mirror', 'recycled-mirror-projection', 'hosted-runtime-graph',
            'collection-save-diagnostics', 'translation-language', 'hosted-settings-live-sync',
            'storage-bridge-ready-retry', 'parser-span-authority-contract',
            'definition-translation', 'definition-translation-lifecycle', 'jpdb-definition-translation',
            'google-translation', 'private-deck-status', 'private-deck-status-legacy-study',
            'popover-collect-action', 'offhost-account-data-privacy', 'jiten-word-list-mining',
            'jpdb/01-jpdb-api-deck-parse',
        ],
        directories: ['subtitles-controller'],
    },
    gaming: {
        include: ['src/gaming/**/*.ts', 'src/reader/app/boot.ts', 'src/reader/app/main.ts',
            'src/reader/app/startup.ts', 'src/reader/settings/file-io.ts'],
        directory: 'fallow-gaming-coverage',
        tests: [
            'gaming-selected-text', 'gaming-selected-text-command', 'gaming-selected-text-main',
            'gaming-selected-text-renderer', 'gaming-selected-text-shortcut-controls', 'gaming-first-run',
            'gaming-lifecycle', 'gaming-settings-import', 'gaming-settings-storage', 'gaming-settings-file', 'gaming-packaged-reader-styles',
            'reader-boot', 'reader-boot-storage-barrier', 'settings-file-io',
        ],
        directories: [],
    },
};
const selected = process.argv[2];
if (selected && !Object.hasOwn(scopes, selected)) throw new Error(`Unknown quality coverage scope: ${selected}`);
for (const name of selected ? [selected] : Object.keys(scopes)) {
    const scope = scopes[name];
    const args = ['run', '--coverage.enabled', '--coverage.provider=istanbul', '--coverage.reporter=json',
        '--maxWorkers=1', '--coverage.processingConcurrency=1',
        `--coverage.reportsDirectory=${path.join(workDir, scope.directory)}`,
        ...scope.include.map(pattern => `--coverage.include=${pattern}`),
        ...scope.tests.map(test => `tests/reader/${test}.test.ts`),
        ...scope.directories.map(directory => `tests/reader/${directory}`)];
    const result = spawnSync(process.execPath, [vitest, ...args], {
        cwd: root, stdio: 'inherit', env: { ...process.env, TMPDIR: tempDir, TEMP: tempDir, TMP: tempDir },
    });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status ?? 1);
}
if (!selected) {
    const outputDir = path.join(root, 'artifacts/fallow-coverage');
    mkdirSync(outputDir, { recursive: true });
    mergeReaderQualityCoverage(path.join(workDir, scopes.reader.directory, 'coverage-final.json'),
        path.join(workDir, scopes.gaming.directory, 'coverage-final.json'), path.join(outputDir, 'coverage-final.json'));
}

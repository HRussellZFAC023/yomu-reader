import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';
import { addUserscriptGraphInitScripts } from '../../scripts/lib/smoke-test-helpers.mjs';
import { profileDriverProvenance, transitiveLocalImportFiles } from '../../scripts/lib/youtube-performance-provenance.mjs';
import { mergeScenarioFunctionProfiles } from '../../scripts/lib/youtube-performance-replays.mjs';
import { createPerformanceEvidenceJournal } from '../../scripts/lib/youtube-performance-report.mjs';
import { fixedAmbientOperationPlan } from '../../scripts/lib/youtube-performance-workload.mjs';

const temporaryDirectories: string[] = [];

afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('YouTube performance harness', () => {
    it('injects the declared companion graph and core as one ordered init script', async () => {
        const root = temporaryDirectory();
        const dist = join(root, 'dist');
        const hosted = join(root, 'docs/public/greasyfork');
        mkdirSync(dist, { recursive: true });
        mkdirSync(hosted, { recursive: true });
        const companionName = 'runtime.0123456789ab.user.js';
        writeFileSync(join(hosted, companionName), 'globalThis.__graphOrder.push("companion");');
        const corePath = join(dist, 'yomu.user.js');
        writeFileSync(
            corePath,
            [`// @require https://yomureader.com/greasyfork/${companionName}#sha256=ignored`, 'globalThis.__graphOrder.push("core");'].join(
                '\n',
            ),
        );
        const registrations: Array<{ content: string }> = [];
        const context = {
            async addInitScript(script: { content: string }) {
                registrations.push(script);
            },
        };

        await addUserscriptGraphInitScripts(context as never, corePath, {
            prefixContent: 'globalThis.__graphOrder = ["bootstrap"];',
            sourceUrl: 'yomu-profile://artifact-graph/test.js',
        });

        expect(registrations).toHaveLength(1);
        const sandbox = {} as { __graphOrder?: string[] };
        runInNewContext(registrations[0].content, sandbox);
        expect(sandbox.__graphOrder).toEqual(['bootstrap', 'companion', 'core']);
        expect(registrations[0].content).toMatch(/sourceURL=yomu-profile:\/\/artifact-graph\/test\.js$/u);
    });

    it('injects an immutable graph snapshot without rereading changed artifacts', async () => {
        const root = temporaryDirectory();
        const corePath = join(root, 'yomu.user.js');
        writeFileSync(corePath, 'globalThis.__artifactVersion = "changed";');
        const registrations: Array<{ content: string }> = [];
        const context = {
            async addInitScript(script: { content: string }) {
                registrations.push(script);
            },
        };

        await addUserscriptGraphInitScripts(context as never, corePath, {
            content: 'globalThis.__artifactVersion = "snapshotted";',
            sourceUrl: 'yomu-profile://artifact-graph/immutable.js',
        });

        expect(registrations[0].content).toContain('"snapshotted"');
        expect(registrations[0].content).not.toContain('"changed"');
    });

    it('hashes the complete transitive local driver closure and tool/runtime identity', () => {
        const repositoryRoot = resolve(import.meta.dirname, '../..');
        const entry = resolve(repositoryRoot, 'scripts/manual/youtube-performance-profile.mjs');
        const provenance = profileDriverProvenance(entry, repositoryRoot);
        const paths = provenance.files.map(file => file.path);

        expect(paths).toEqual(
            expect.arrayContaining([
                'scripts/manual/youtube-performance-profile.mjs',
                'scripts/lib/smoke-harness.mjs',
                'scripts/lib/paths.mjs',
                'scripts/lib/smoke-test-helpers.mjs',
                'scripts/lib/youtube-performance-cdp.mjs',
                'scripts/lib/youtube-performance-replays.mjs',
                'scripts/lib/youtube-performance-report.mjs',
                'scripts/lib/youtube-performance-workload.mjs',
            ]),
        );
        expect(provenance.toolFiles.map(file => file.path)).toContain('package-lock.json');
        expect(provenance.tools.playwright?.version).toBeTruthy();
        expect(provenance.browserRegistry).toMatchObject({
            browsers: expect.any(Array),
        });
        expect(provenance.runtime).toMatchObject({
            node: process.version,
            v8: process.versions.v8,
            icu: process.versions.icu,
        });
    });

    it('walks nested imports once and changes identity when a transitive helper changes', () => {
        const root = temporaryDirectory();
        writeFileSync(join(root, 'entry.mjs'), "import './a.mjs';\nimport './b.mjs';\n");
        writeFileSync(join(root, 'a.mjs'), "import './shared.mjs';\n");
        writeFileSync(join(root, 'b.mjs'), "export { value } from './shared.mjs';\n");
        writeFileSync(join(root, 'shared.mjs'), 'export const value = 1;\n');

        const before = transitiveLocalImportFiles(join(root, 'entry.mjs'), root);
        const beforeHash = hashFiles(before);
        writeFileSync(join(root, 'shared.mjs'), 'export const value = 2;\n');
        const afterHash = hashFiles(transitiveLocalImportFiles(join(root, 'entry.mjs'), root));

        expect(before).toHaveLength(4);
        expect(afterHash).not.toBe(beforeHash);
    });

    it('checkpoints provenance and writes a structured terminal failure', () => {
        const output = temporaryDirectory();
        const journal = createPerformanceEvidenceJournal(output, {
            profilerDriver: { sourceSha256: 'driver' },
        });
        journal.markStep({ scenario: 'api', replay: 'cpu', step: 'lookup' });
        journal.fail(new Error('lookup timed out'), {
            measuredStepFailure: { workloadFailure: true },
        });
        const failure = JSON.parse(readFileSync(join(output, 'failure.json'), 'utf8'));

        expect(failure).toMatchObject({
            status: 'failed',
            profilerDriver: { sourceSha256: 'driver' },
            lastStep: { scenario: 'api', replay: 'cpu', step: 'lookup' },
            failure: { name: 'Error', message: 'lookup timed out' },
            measuredStepFailure: { workloadFailure: true },
        });
        expect(readFileSync(join(output, 'profile.partial.json'), 'utf8')).toContain('lookup timed out');
    });

    it('keeps fixed ambient operations identical across instrumentation replays', () => {
        expect(fixedAmbientOperationPlan(5)).toEqual([
            { cycle: 0, phase: 'playing', scrollOffset: 0, playbackTicks: 1 },
            { cycle: 1, phase: 'playing', scrollOffset: 180, playbackTicks: 1 },
            { cycle: 2, phase: 'paused', scrollOffset: 360, playbackTicks: 0 },
            { cycle: 3, phase: 'paused', scrollOffset: 540, playbackTicks: 0 },
            { cycle: 4, phase: 'playing', scrollOffset: 720, playbackTicks: 1 },
        ]);
        expect(() => fixedAmbientOperationPlan(0)).toThrow(/must be positive/u);
    });

    it('merges only CPU samples and coverage calls into authoritative metrics', () => {
        const metrics = profileReplay('metrics', { durationMs: 14 });
        const cpu = profileReplay('cpu', { durationMs: 80, functionProfile: { sampled: { sampledMs: 3 } } });
        const coverage = profileReplay('coverage', { durationMs: 90, functionProfile: { calls: { totalCalls: 7 } } });

        const merged = mergeScenarioFunctionProfiles(metrics, cpu, coverage);

        expect(merged.steps[0]).toMatchObject({
            durationMs: 14,
            functionProfile: { sampled: { sampledMs: 3 }, calls: { totalCalls: 7 } },
        });
        expect(merged.replays).toMatchObject({
            metrics: { instrumentation: 'none' },
            cpu: { instrumentation: 'sampled-cpu' },
            coverage: { instrumentation: 'precise-call-counts' },
            workloadIdentity: 'asserted-across-all-replays',
        });
    });

    it('rejects a replay when its fixed operation ledger differs', () => {
        const metrics = profileReplay('metrics');
        const cpu = profileReplay('cpu', { functionProfile: { sampled: {} } });
        const coverage = profileReplay('coverage', { functionProfile: { calls: {} } });
        coverage.steps[0].interaction.operations[0].scrollOffset = 999;

        expect(() => mergeScenarioFunctionProfiles(metrics, cpu, coverage)).toThrow(/workload mismatch/u);
    });

    it.each([
        ['metrics', { sampled: {} }],
        ['cpu', { sampled: {}, calls: {} }],
        ['coverage', { sampled: {}, calls: {} }],
    ])('rejects cross-channel function evidence in the %s replay', (mode, functionProfile) => {
        const metrics = profileReplay('metrics', mode === 'metrics' ? { functionProfile } : {});
        const cpu = profileReplay('cpu', {
            functionProfile: mode === 'cpu' ? functionProfile : { sampled: {} },
        });
        const coverage = profileReplay('coverage', {
            functionProfile: mode === 'coverage' ? functionProfile : { calls: {} },
        });

        expect(() => mergeScenarioFunctionProfiles(metrics, cpu, coverage)).toThrow(/carried/u);
    });
});

function temporaryDirectory(): string {
    const directory = mkdtempSync(join(tmpdir(), 'yomu-youtube-profiler-'));
    temporaryDirectories.push(directory);
    return directory;
}

function hashFiles(paths: string[]): string {
    const hash = createHash('sha256');
    for (const path of paths) hash.update(readFileSync(path));
    return hash.digest('hex');
}

function profileReplay(mode: string, step: Record<string, any> = {}) {
    return {
        mode,
        steps: [
            {
                name: 'youtubeFixedAmbientBenchmark',
                durationMs: 1,
                interaction: {
                    workload: 'fixed-ambient-benchmark',
                    comparable: true,
                    requestedCycles: 1,
                    cycles: 1,
                    playbackTicks: 1,
                    operations: [{ cycle: 0, phase: 'playing', scrollOffset: 0, playbackTicks: 1, restoredHosts: 1 }],
                },
                ...step,
            },
        ],
        mobileAmbient: null,
        mobileStress: null,
    };
}

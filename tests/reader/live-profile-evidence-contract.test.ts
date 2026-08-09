import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs script module without type declarations
import { createLiveProfileEvidenceContract } from '../../scripts/lib/live-profile-evidence-contract.mjs';

const temporaryDirectories: string[] = [];
const requestedRuns = 'chromium:none,chromium:cpu,chromium:coverage,webkit:none';

afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('live profile evidence contract', () => {
    it('validates the exact ordered split graph, stylesheet, runtime, tools, and clean paths', () => {
        const fixture = artifactFixture();
        const contract = profileContract();

        const evidence = contract.preflight({
            repositoryRoot: fixture.root,
            userscriptPath: fixture.corePath,
            cssPath: fixture.cssPath,
            profilerDriver: validProfilerDriver(),
        });

        expect(evidence.artifacts.descriptor).toMatchObject({
            validated: true,
            splitGraph: true,
            version: '9.9.9',
            dirtyPaths: [],
            files: [
                { name: fixture.companionName, sha256: fixture.companionSha256 },
                { name: 'yomu.user.js' },
            ],
            css: { name: 'yomu.css', sha256: fixture.cssSha256 },
        });
        expect(evidence.artifacts.content.indexOf('companion')).toBeLessThan(evidence.artifacts.content.indexOf('core'));
        expect(evidence.requestedRuns.map((run: { key: string }) => run.key)).toEqual(requestedRuns.split(','));
        expect(evidence.workload).toMatchObject({ comparable: false, scope: 'whole live YouTube watch page' });
    });

    it.each([
        ['Node', { runtime: { node: 'v22.22.3' } }, /does not match \.nvmrc/u],
        ['ICU', { runtime: { icu: '78.2' } }, /ICU runtime/u],
        ['tool lock', { tools: { playwright: { lockedVersion: '0.0.0' } } }, /does not match package-lock/u],
        ['driver dirt', { dirtyPaths: [' M scripts/manual/profile.mjs'] }, /inputs are dirty/u],
    ])('fails closed for mismatched %s provenance', (_name, patch, expected) => {
        const fixture = artifactFixture();
        const driver = mergeProfilerDriver(validProfilerDriver(), patch);

        expect(() => profileContract().preflight({
            repositoryRoot: fixture.root,
            userscriptPath: fixture.corePath,
            cssPath: fixture.cssPath,
            profilerDriver: driver,
        })).toThrow(expected);
    });

    it('fails closed when a product artifact is dirty', () => {
        const fixture = artifactFixture();
        writeFileSync(fixture.corePath, `${readFileSync(fixture.corePath, 'utf8')}\n// dirty\n`);

        expect(() => profileContract().preflight({
            repositoryRoot: fixture.root,
            userscriptPath: fixture.corePath,
            cssPath: fixture.cssPath,
            profilerDriver: validProfilerDriver(),
        })).toThrow(/product artifacts are dirty/u);
    });

    it.each([
        ['companion filename', { companionFileHash: '000000000000' }, /companion filename hash mismatch/u],
        ['companion SRI', { companionSri: 'invalid' }, /companion SRI mismatch/u],
        ['stylesheet filename', { cssFileHash: '000000000000' }, /stylesheet filename hash mismatch/u],
        ['stylesheet SRI', { cssSri: 'invalid' }, /stylesheet SRI mismatch/u],
    ])('rejects an invalid %s declaration even when the repository is clean', (_name, options, expected) => {
        const fixture = artifactFixture(options);

        expect(() => profileContract().preflight({
            repositoryRoot: fixture.root,
            userscriptPath: fixture.corePath,
            cssPath: fixture.cssPath,
            profilerDriver: validProfilerDriver(),
        })).toThrow(expected);
    });

    it('requires every requested replay, progressing playback, and mode-specific evidence', () => {
        const contract = profileContract();
        const complete = requestedRuns.split(',').map(successfulReplay);

        expect(contract.complete(complete)).toMatchObject({
            requestedRunsComplete: true,
            actualYoutubeDom: true,
            runtimeHealthy: true,
            playbackProgressed: true,
        });
        expect(() => contract.complete(complete.slice(1))).toThrow(/evidence is incomplete/u);
        expect(() => contract.complete(complete.map(result => result.mode === 'cpu'
            ? { ...result, functionEvidence: { mode: 'cpu' } }
            : result))).toThrow(/evidence is incomplete/u);
        expect(() => contract.complete(complete.map(result => result.mode === 'none' && result.engine === 'chromium'
            ? { ...result, interaction: { ...result.interaction, playback: { progressed: false } } }
            : result))).toThrow(/evidence is incomplete/u);
    });

    it('fails unknown GM endpoints and serializes terminal failure evidence', () => {
        const contract = profileContract();
        expect(contract.classifyBridgeRequest('https://www.youtube.com/api/timedtext?lang=ja')).toBe('youtube-timedtext');
        expect(() => contract.classifyBridgeRequest('https://example.com/new-service')).toThrow(/unrecognized GM request/u);

        const failure = contract.failure(new Error('browser launch failed'), { requestedRuns: ['chromium:none'] });
        expect(failure).toMatchObject({
            status: 'failed',
            failure: { name: 'Error', message: 'browser launch failed' },
            requestedRuns: ['chromium:none'],
        });
    });
});

function profileContract() {
    return createLiveProfileEvidenceContract({
        requestedRuns,
        workloadKind: 'ambient',
        ambientDurationMs: 30_000,
    });
}

function validProfilerDriver(): Record<string, any> {
    const tool = {
        version: '1.2.3',
        lockedVersion: '1.2.3',
        integrity: 'sha512-test',
        manifestSha256: 'manifest',
    };
    return {
        dirtyPaths: [],
        runtime: {
            expectedNode: '24.16.0',
            node: 'v24.16.0',
            icu: '78.3',
        },
        tools: {
            playwright: { ...tool },
            'playwright-core': { ...tool },
            typescript: { ...tool },
        },
    };
}

function mergeProfilerDriver(base: Record<string, any>, patch: Record<string, any>): Record<string, any> {
    return {
        ...base,
        ...patch,
        runtime: { ...base.runtime, ...(patch.runtime ?? {}) },
        tools: {
            ...base.tools,
            ...Object.fromEntries(Object.entries(patch.tools ?? {}).map(([name, value]) => [
                name,
                { ...base.tools[name], ...(value as object) },
            ])),
        },
    };
}

function artifactFixture(options: Record<string, string> = {}) {
    const root = mkdtempSync(join(tmpdir(), 'yomu-live-profile-contract-'));
    temporaryDirectories.push(root);
    const dist = join(root, 'dist');
    const hosted = join(root, 'docs/public/greasyfork');
    mkdirSync(dist, { recursive: true });
    mkdirSync(hosted, { recursive: true });
    const companion = 'globalThis.__profileOrder = ["companion"];\n';
    const css = '.jpdb-reader { color: green; }\n';
    const companionSha256 = digestHex(companion);
    const cssSha256 = digestHex(css);
    const companionName = `yomu-runtime.${fixtureOption(options, 'companionFileHash', companionSha256.slice(0, 12))}.user.js`;
    const corePath = join(dist, 'yomu.user.js');
    const cssPath = join(dist, 'yomu.css');
    writeFileSync(join(hosted, companionName), companion);
    writeFileSync(cssPath, css);
    writeFileSync(corePath, [
        '// @version 9.9.9',
        `// @require https://yomureader.com/greasyfork/${companionName}#sha256=${fixtureOption(options, 'companionSri', digestBase64(companion))}`,
        `// @resource yomuCss https://yomureader.com/yomu.${fixtureOption(options, 'cssFileHash', cssSha256.slice(0, 12))}.css#sha256=${fixtureOption(options, 'cssSri', digestBase64(css))}`,
        'globalThis.__profileOrder.push("core");',
    ].join('\n'));
    git(root, ['init', '--quiet']);
    git(root, ['add', '.']);
    git(root, ['-c', 'user.name=Yomu Test', '-c', 'user.email=yomu@example.test', 'commit', '--quiet', '-m', 'fixture']);
    return { root, corePath, cssPath, companionName, companionSha256, cssSha256 };
}

function fixtureOption(options: Record<string, string>, key: string, fallback: string): string {
    return options[key] ?? fallback;
}

function successfulReplay(key: string): Record<string, any> {
    const [engine, mode] = key.split(':');
    return {
        engine,
        mode,
        browser: { channel: 'playwright-bundled', executablePath: '/browser', version: '1' },
        interaction: {
            playback: { progressed: true },
            nativeControls: { autoHideObserved: true, yomuDidNotRetainFocus: true },
            subtitles: { hover: { opened: true } },
            ocr: { hover: { opened: true } },
        },
        workload: {
            scope: 'whole live YouTube watch page',
            instrumented: mode === 'cpu' || mode === 'coverage',
        },
        functionEvidence: replayFunctionEvidence(engine, mode),
        network: { actualYoutubeRequests: 10 },
        final: {
            youtube: { app: true, player: true },
            yomu: { runtimeHealth: 'ready' },
        },
    };
}

function replayFunctionEvidence(engine: string, mode: string): Record<string, any> | null {
    if (engine === 'webkit') return null;
    const evidence = {
        none: () => ({ mode }),
        cpu: () => ({
            mode,
            summaryScope: { kind: 'yomu-artifact-graph' },
            sampled: { totalSampleCount: 5, sampleCount: 2 },
        }),
        coverage: () => ({
            mode,
            summaryScope: { kind: 'yomu-artifact-graph' },
            calls: { functionsPresent: 3, functionsCalled: 2 },
        }),
    }[mode];
    if (!evidence) throw new Error(`Unsupported test replay mode: ${mode}`);
    return evidence();
}

function git(root: string, args: string[]): void {
    execFileSync('git', args, { cwd: root, stdio: 'ignore' });
}

function digestHex(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

function digestBase64(value: string): string {
    return createHash('sha256').update(value).digest('base64');
}

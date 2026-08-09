import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs script module without type declarations
import { createLiveProfileEvidenceContract } from '../../scripts/lib/live-profile-evidence-contract.mjs';
import { summarizeCpuProfile, summarizePreciseCoverage } from '../../scripts/lib/youtube-performance-evidence.mjs';

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
        ['browser registry', { browserRegistry: null }, /browser registry provenance is missing/u],
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
        ['stylesheet form', { cssDeclaration: '// @resource yomuCss https://example.com/yomu.css' }, /must be content-addressed/u],
    ])('rejects an invalid %s declaration even when the repository is clean', (_name, options, expected) => {
        const fixture = artifactFixture(options);

        expect(() => profileContract().preflight({
            repositoryRoot: fixture.root,
            userscriptPath: fixture.corePath,
            cssPath: fixture.cssPath,
            profilerDriver: validProfilerDriver(),
        })).toThrow(expected);
    });

    it('counts all raw yomuCss declarations before validating their form', () => {
        const fixture = artifactFixture({ extraCssDeclaration: '// @resource yomuCss https://example.com/untrusted.css' });

        expect(() => profileContract().preflight({
            repositoryRoot: fixture.root,
            userscriptPath: fixture.corePath,
            cssPath: fixture.cssPath,
            profilerDriver: validProfilerDriver(),
        })).toThrow(/exactly one yomuCss resource/u);
    });

    it('attributes one ordered bootstrap to distinct harness and product sources', () => {
        const fixture = artifactFixture();
        const evidence = preflightEvidence(fixture);
        const bootstrap = evidence.bootstrap({
            gmProgram: 'globalThis.__bootstrapOrder = ["gm"]; function gmHarnessFunction() { return new Error().stack; } globalThis.gmHarnessFunction = gmHarnessFunction;',
            instrumentationProgram: 'globalThis.__bootstrapOrder.push("instrumentation");',
        });
        const sandbox = {} as Record<string, any>;

        runInNewContext(bootstrap.content, sandbox);

        expect(sandbox.__bootstrapOrder).toEqual(['gm', 'instrumentation', 'product']);
        expect(sandbox.gmHarnessFunction()).toContain(bootstrap.sources.gm);
        expect(sandbox.productGraphFunction()).toContain(bootstrap.sources.product);
        const cpu = summarizeCpuProfile(cpuProfileForSources(bootstrap.sources), evidence.artifacts.descriptor);
        const coverage = summarizePreciseCoverage(coverageForSources(bootstrap.sources), evidence.artifacts.descriptor, []);
        expect(cpu).toMatchObject({ totalSampleCount: 2, sampleCount: 1 });
        expect(cpu.selfTime.map((frame: Record<string, any>) => frame.functionName)).toEqual(['productGraphFunction']);
        expect(coverage.callCounts.map((frame: Record<string, any>) => frame.functionName)).toEqual(['productGraphFunction']);
    });

    it('requires every requested replay and exact product, workload, browser, and ambient evidence', () => {
        const fixture = artifactFixture();
        const evidence = preflightEvidence(fixture);
        const complete = requestedRuns.split(',').map(key => successfulReplay(key, evidence.artifacts.descriptor));

        expect(evidence.complete(complete)).toMatchObject({
            requestedRunsComplete: true,
            actualYoutubeDom: true,
            runtimeHealthy: true,
            playbackProgressed: true,
            ambientWindowProgressed: true,
        });
        expect(() => evidence.complete(complete.slice(1))).toThrow(/evidence is incomplete/u);
        expect(() => evidence.complete(complete.map(result => result.mode === 'cpu'
            ? { ...result, functionEvidence: { mode: 'cpu' } }
            : result))).toThrow(/evidence is incomplete/u);
        expect(() => evidence.complete(complete.map(result => result.mode === 'none' && result.engine === 'chromium'
            ? { ...result, interaction: { ...result.interaction, playback: { progressed: false } } }
            : result))).toThrow(/evidence is incomplete/u);
    });

    it('requires real timedtext and complete hover/control evidence on every interaction replay', () => {
        const fixture = artifactFixture();
        const evidence = preflightEvidence(fixture, 'interaction');
        const complete = requestedRuns.split(',')
            .map(key => successfulReplay(key, evidence.artifacts.descriptor, 'interaction'));

        expect(evidence.complete(complete)).toMatchObject({
            requestedRunsComplete: true,
            chromiumSubtitleHover: true,
            chromiumSubtitleHoverClosed: true,
            chromiumOcrHover: true,
            chromiumOcrHoverClosed: true,
        });
        for (const target of complete) {
            const incomplete = structuredClone(complete);
            const replay = incomplete.find(result => result.engine === target.engine && result.mode === target.mode);
            if (!replay) throw new Error(`Missing replay fixture for ${target.engine}:${target.mode}.`);
            replay.yomuBridgeRequests.timedText = [];
            expect(() => evidence.complete(incomplete)).toThrow(/evidence is incomplete/u);
        }
    });

    it.each([
        ['timedtext 429', (result: Record<string, any>) => { result.yomuBridgeRequests.timedText[0].response.status = 429; }],
        ['timedtext empty', (result: Record<string, any>) => { result.yomuBridgeRequests.timedText[0].response.bytes = 0; }],
        ['timedtext endpoint', (result: Record<string, any>) => { result.yomuBridgeRequests.timedText[0].endpoint = 'https://example.com/api/timedtext'; }],
        ['timedtext transport', (result: Record<string, any>) => { result.yomuBridgeRequests.timedText[0].transport = 'emulated-gm-bridge'; }],
        ['timedtext format', (result: Record<string, any>) => { result.yomuBridgeRequests.timedText[0].response.format = 'empty'; }],
        ['subtitle root', (result: Record<string, any>) => { result.interaction.subtitles.rootPresent = false; }],
        ['subtitle open', (result: Record<string, any>) => { result.interaction.subtitles.hover.opened = false; }],
        ['subtitle close', (result: Record<string, any>) => { result.interaction.subtitles.hover.closed = false; }],
        ['subtitle text', (result: Record<string, any>) => { result.interaction.subtitles.hover.text = ''; }],
        ['OCR line', (result: Record<string, any>) => { result.interaction.ocr.linePresent = false; }],
        ['OCR open', (result: Record<string, any>) => { result.interaction.ocr.hover.opened = false; }],
        ['OCR close', (result: Record<string, any>) => { result.interaction.ocr.hover.closed = false; }],
        ['native awake', (result: Record<string, any>) => { result.interaction.nativeControls.awake.chromeOpacity = 0; }],
        ['native idle', (result: Record<string, any>) => { result.interaction.nativeControls.idle.playerAutohide = false; result.interaction.nativeControls.idle.chromeOpacity = 1; }],
        ['focus release', (result: Record<string, any>) => { result.interaction.nativeControls.idle.yomuFocused = 1; }],
        ['hover release', (result: Record<string, any>) => { result.interaction.nativeControls.idle.yomuHovered = 1; }],
    ])('rejects incomplete interaction %s evidence', (_name, mutate) => {
        const fixture = artifactFixture();
        const evidence = preflightEvidence(fixture, 'interaction');
        const results = requestedRuns.split(',')
            .map(key => successfulReplay(key, evidence.artifacts.descriptor, 'interaction'));
        mutate(results.at(-1) as Record<string, any>);

        expect(() => evidence.complete(results)).toThrow(/evidence is incomplete/u);
    });

    it.each([
        ['product CPU sample', (result: Record<string, any>) => { result.functionEvidence.sampled.sampleCount = 0; }, 'cpu'],
        ['called product function', (result: Record<string, any>) => { result.functionEvidence.calls.functionsCalled = 0; }, 'coverage'],
        ['source URL', (result: Record<string, any>) => { result.functionEvidence.summaryScope.sourceUrl = 'yomu-profile://wrong'; }, 'cpu'],
        ['graph SHA', (result: Record<string, any>) => { result.functionEvidence.summaryScope.sha256 = 'wrong'; }, 'coverage'],
        ['CDP metrics', (result: Record<string, any>) => { result.workload.cdpDelta = null; }, 'none'],
        ['empty CDP metrics', (result: Record<string, any>) => { result.workload.cdpDelta = {}; }, 'none'],
        ['finite CDP metrics', (result: Record<string, any>) => { result.workload.cdpDelta.TaskDuration = Number.NaN; }, 'none'],
        ['meaningful CDP metrics', (result: Record<string, any>) => { result.workload.cdpDelta.ScriptDuration = 0; }, 'none'],
        ['page metrics', (result: Record<string, any>) => { result.workload.page = null; }, 'none'],
        ['empty page metrics', (result: Record<string, any>) => { result.workload.page = {}; }, 'none'],
        ['page elapsed time', (result: Record<string, any>) => { result.workload.page.elapsedMs = 0; }, 'none'],
        ['page frame counters', (result: Record<string, any>) => { result.workload.page.animationFrames = 0; }, 'none'],
        ['browser executable identity', (result: Record<string, any>) => { result.browser.executable.sha256 = ''; }, 'none'],
        ['browser registry version', (result: Record<string, any>) => { result.browser.version = '2'; }, 'none'],
        ['browser registry revision', (result: Record<string, any>) => { result.browser.registry.revision = 'wrong'; }, 'none'],
        ['browser headed mode', (result: Record<string, any>) => { result.browser.headless = false; }, 'none'],
        ['workload kind', (result: Record<string, any>) => { result.workload.kind = 'interaction'; }, 'cpu'],
        ['non-comparability', (result: Record<string, any>) => { result.workload.comparable = true; }, 'cpu'],
        ['ambient end progression', (result: Record<string, any>) => { result.interaction.ambientWindow.progressed = false; }, 'cpu'],
        ['ambient end delta', (result: Record<string, any>) => { result.interaction.ambientWindow.deltaSeconds = 0; }, 'cpu'],
        ['ambient wall duration', (result: Record<string, any>) => { result.interaction.ambientWindow.elapsedWallMs = 100; }, 'cpu'],
        ['ambient progress ratio', (result: Record<string, any>) => { result.interaction.ambientWindow.deltaSeconds = 0.1; result.interaction.ambientWindow.progressRatio = 0.003; }, 'cpu'],
        ['ambient sample cadence', (result: Record<string, any>) => { result.interaction.ambientWindow.maxSampleGapMs = 30_000; }, 'cpu'],
        ['ambient stalled interval', (result: Record<string, any>) => { result.interaction.ambientWindow.stalledIntervalCount = 1; }, 'cpu'],
        ['ambient unpaused state', (result: Record<string, any>) => { result.interaction.ambientWindow.unpaused = false; }, 'cpu'],
        ['ambient non-stalled state', (result: Record<string, any>) => { result.interaction.ambientWindow.nonStalled = false; }, 'cpu'],
    ])('rejects missing %s evidence', (_name, mutate, mode) => {
        const fixture = artifactFixture();
        const evidence = preflightEvidence(fixture);
        const results = requestedRuns.split(',').map(key => successfulReplay(key, evidence.artifacts.descriptor));
        const target = results.find(result => result.engine === 'chromium' && result.mode === mode);
        mutate(target as Record<string, any>);

        expect(() => evidence.complete(results)).toThrow(/evidence is incomplete/u);
    });

    it('fails unknown GM endpoints and serializes terminal failure evidence', () => {
        const contract = profileContract();
        expect(contract.classifyBridgeRequest('https://www.youtube.com/api/timedtext?lang=ja')).toBe('youtube-timedtext');
        expect(contract.classifyBridgeRequest('https://jpdb.io/api/v1/parse?token=one')).toBe('jpdb-parse');
        expect(contract.classifyBridgeRequest('https://jpdb.io/search?q=読む')).toBe('jpdb-search');
        expect(() => contract.classifyBridgeRequest('https://jpdb.io/api/v1/parse/extra')).toThrow(/unrecognized GM request/u);
        expect(() => contract.classifyBridgeRequest('http://jpdb.io/api/v1/parse')).toThrow(/unrecognized GM request/u);
        expect(() => contract.classifyBridgeRequest('https://example.com/new-service')).toThrow(/unrecognized GM request/u);

        const failure = contract.failure(new Error('browser launch failed'), { requestedRuns: ['chromium:none'] });
        expect(failure).toMatchObject({
            status: 'failed',
            failure: { name: 'Error', message: 'browser launch failed' },
            requestedRuns: ['chromium:none'],
        });
    });
});

function profileContract(workloadKind = 'ambient') {
    return createLiveProfileEvidenceContract({
        requestedRuns,
        workloadKind,
        ambientDurationMs: 30_000,
    });
}

function preflightEvidence(fixture: ReturnType<typeof artifactFixture>, workloadKind = 'ambient'): Record<string, any> {
    return profileContract(workloadKind).preflight({
        repositoryRoot: fixture.root,
        userscriptPath: fixture.corePath,
        cssPath: fixture.cssPath,
        profilerDriver: validProfilerDriver(),
    });
}

function validProfilerDriver(): Record<string, any> {
    const tool = {
        version: '1.2.3',
        lockedVersion: '1.2.3',
        integrity: 'sha512-test',
        manifestSha256: 'c'.repeat(64),
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
        browserRegistry: {
            sha256: 'b'.repeat(64),
            browsers: [
                { name: 'chromium', revision: '1194', browserVersion: '1' },
                { name: 'webkit', revision: '2215', browserVersion: '1' },
            ],
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
        fixtureOption(options, 'cssDeclaration', `// @resource yomuCss https://yomureader.com/yomu.${fixtureOption(options, 'cssFileHash', cssSha256.slice(0, 12))}.css#sha256=${fixtureOption(options, 'cssSri', digestBase64(css))}`),
        fixtureOption(options, 'extraCssDeclaration', ''),
        'globalThis.__profileOrder.push("core"); globalThis.__bootstrapOrder?.push("product"); function productGraphFunction() { return new Error().stack; } globalThis.productGraphFunction = productGraphFunction;',
    ].filter(Boolean).join('\n'));
    git(root, ['init', '--quiet']);
    git(root, ['add', '.']);
    git(root, ['-c', 'user.name=Yomu Test', '-c', 'user.email=yomu@example.test', 'commit', '--quiet', '-m', 'fixture']);
    return { root, corePath, cssPath, companionName, companionSha256, cssSha256 };
}

function fixtureOption(options: Record<string, string>, key: string, fallback: string): string {
    return options[key] ?? fallback;
}

function successfulReplay(key: string, artifacts: Record<string, any>, workloadKind = 'ambient'): Record<string, any> {
    const [engine, mode] = key.split(':');
    return {
        engine,
        mode,
        browser: successfulBrowser(engine),
        interaction: {
            playback: { progressed: true },
            ambientWindow: {
                requestedDurationMs: 30_000,
                elapsedWallMs: 30_000,
                sampleCount: 31,
                maxSampleGapMs: 1_000,
                sampleCadenceHealthy: true,
                deltaSeconds: 30,
                expectedDeltaSeconds: 30,
                progressRatio: 1,
                stalledIntervalCount: 0,
                fullWindow: true,
                progressed: true,
                unpaused: true,
                nonStalled: true,
                ended: { found: true, paused: false, readyState: 4 },
            },
            nativeControls: {
                found: true,
                autoHideObserved: true,
                yomuDidNotRetainFocus: true,
                awake: { playerAutohide: false, chromeOpacity: 1 },
                idle: {
                    playerAutohide: true,
                    chromeOpacity: 0,
                    activeInsideYomu: false,
                    yomuFocused: 0,
                    yomuHovered: 0,
                },
            },
            subtitles: {
                rootPresent: true,
                wordPresent: true,
                hover: { opened: true, closed: true, text: '日本語', openMs: 10, closeMs: 10 },
            },
            ocr: {
                videoState: { found: true, paused: true },
                framePresent: true,
                linePresent: true,
                wordPresent: true,
                hover: { opened: true, closed: true, text: '字幕', openMs: 10, closeMs: 10 },
            },
        },
        workload: {
            kind: workloadKind,
            scope: 'whole live YouTube watch page',
            comparable: false,
            instrumented: new Set(['cpu', 'coverage']).has(mode),
            cdpDelta: {
                TaskDuration: 2,
                ScriptDuration: 1,
                LayoutDuration: 0.2,
                RecalcStyleDuration: 0.2,
                LayoutCount: 1,
                RecalcStyleCount: 1,
                JSHeapUsedSize: 1_024,
                Nodes: 5,
            },
            page: {
                startedAt: 1,
                elapsedMs: 30_000,
                longTasks: 1,
                longTaskMs: 60,
                maxLongTaskMs: 60,
                animationFrames: 1_800,
                over50MsFrameGaps: 1,
                maxFrameGapMs: 60,
            },
        },
        functionEvidence: replayFunctionEvidence(engine, mode, artifacts),
        fatalBridgeRequests: [],
        network: { actualYoutubeRequests: 10 },
        yomuBridgeRequests: {
            timedText: [{
                endpoint: 'https://www.youtube.com/api/timedtext',
                transport: 'browser-session-fetch',
                response: { status: 200, bytes: 128, format: 'json', contentType: 'application/json' },
            }],
        },
        final: {
            youtube: { app: true, player: true },
            yomu: { runtimeHealth: 'ready' },
        },
    };
}

function successfulBrowser(engine: string): Record<string, any> {
    const webkit = engine === 'webkit';
    return {
        channel: 'playwright-bundled',
        custom: false,
        headed: false,
        headless: true,
        payloadResolution: webkit ? 'playwright-webkit-wrapper' : 'direct',
        launcher: webkit ? {
            path: '/webkit-2215/pw_run.sh',
            sha256: 'c'.repeat(64),
            stat: { bytes: 100, mode: 33_261, mtimeMs: 1, device: 1, inode: 2 },
        } : null,
        executable: {
            path: '/browser',
            sha256: 'a'.repeat(64),
            stat: { bytes: 100, mode: 33_261, mtimeMs: 1, device: 1, inode: 1 },
        },
        registry: {
            manifestSha256: 'b'.repeat(64),
            name: engine,
            revision: webkit ? '2215' : '1194',
            browserVersion: '1',
        },
        version: '1',
    };
}

function replayFunctionEvidence(engine: string, mode: string, artifacts: Record<string, any>): Record<string, any> | null {
    if (engine === 'webkit') return null;
    const summaryScope = {
        kind: 'yomu-artifact-graph',
        sourceUrl: artifacts.sourceUrl,
        sha256: artifacts.sha256,
    };
    const evidence = {
        none: () => ({ mode }),
        cpu: () => ({
            mode,
            summaryScope,
            sampled: { totalSampleCount: 5, sampleCount: 2 },
        }),
        coverage: () => ({
            mode,
            summaryScope,
            calls: { functionsPresent: 3, functionsCalled: 2 },
        }),
    }[mode];
    if (!evidence) throw new Error(`Unsupported test replay mode: ${mode}`);
    return evidence();
}

function cpuProfileForSources(sources: Record<string, string>): Record<string, any> {
    return {
        samples: [1, 2],
        timeDeltas: [1000, 1000],
        nodes: [
            { id: 1, callFrame: { functionName: 'gmHarnessFunction', url: sources.gm, lineNumber: 0, columnNumber: 0 } },
            { id: 2, callFrame: { functionName: 'productGraphFunction', url: sources.product, lineNumber: 0, columnNumber: 0 } },
        ],
    };
}

function coverageForSources(sources: Record<string, string>): Record<string, any>[] {
    return [
        coverageScript(sources.gm, 'gmHarnessFunction', 10),
        coverageScript(sources.product, 'productGraphFunction', 1),
    ];
}

function coverageScript(url: string, functionName: string, count: number): Record<string, any> {
    return {
        url,
        functions: [{ functionName, ranges: [{ startOffset: 0, endOffset: 10, count }] }],
    };
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

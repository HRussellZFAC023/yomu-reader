import { createHash } from 'node:crypto';
import {
    chmodSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readdirSync,
    realpathSync,
    renameSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs script module without type declarations
import { createLiveProfileRunSupport } from '../../scripts/lib/live-profile-run-support.mjs';

const temporaryDirectories: string[] = [];

afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('live profile run support', () => {
    it('creates a distinct fresh directory for each default run', () => {
        const workspace = temporaryDirectory();
        const qaRoot = join(workspace, 'qa-artifacts');
        const profileRoot = join(qaRoot, 'youtube-live-watch-performance');
        const support = createLiveProfileRunSupport();

        const first = support.prepareOutputDirectory({ qaArtifactsRoot: qaRoot });
        const second = support.prepareOutputDirectory({ qaArtifactsRoot: qaRoot });

        expect(dirname(first)).toBe(realpathSync(profileRoot));
        expect(dirname(second)).toBe(realpathSync(profileRoot));
        expect(first).not.toBe(second);
        expect(basename(first)).toMatch(/^run-\d{4}-\d{2}-\d{2}T.+Z-[0-9a-f-]{36}$/u);
        expect(readdirSync(profileRoot)).toHaveLength(2);
    });

    it('creates a fresh default-shaped run below the dedicated live-watch artifact root', () => {
        const workspace = temporaryDirectory();
        const qaRoot = join(workspace, 'qa-artifacts');
        const output = join(qaRoot, 'youtube-live-watch-performance', 'latest');
        const support = createLiveProfileRunSupport();

        expect(support.prepareOutputDirectory({
            requestedPath: output,
            qaArtifactsRoot: qaRoot,
        })).toBe(realpathSync(output));
        expect(readdirSync(dirname(output))).toEqual(['latest']);
    });

    it('rejects root, home, workspace, repository, QA root, profile root, and out-of-tree outputs', () => {
        const workspace = temporaryDirectory();
        const repository = join(workspace, 'repo');
        const qaRoot = join(workspace, 'qa-artifacts');
        const profileRoot = join(qaRoot, 'youtube-live-watch-performance');
        const outside = join(workspace, 'outside-run');
        mkdirSync(repository);
        mkdirSync(qaRoot);
        const support = createLiveProfileRunSupport();

        for (const requestedPath of ['', '/', homedir(), workspace, repository, qaRoot, profileRoot, outside]) {
            expect(() => support.prepareOutputDirectory({
                requestedPath,
                qaArtifactsRoot: qaRoot,
            })).toThrow(/Live profiler/u);
        }
        expect(existsSync(profileRoot)).toBe(false);
        expect(existsSync(outside)).toBe(false);
    });

    it('refuses an existing run without removing or changing its contents', () => {
        const workspace = temporaryDirectory();
        const qaRoot = join(workspace, 'qa-artifacts');
        const output = join(qaRoot, 'youtube-live-watch-performance', 'existing-run');
        const sentinel = join(output, 'keep.txt');
        mkdirSync(output, { recursive: true });
        writeFileSync(sentinel, 'do not remove');

        expect(() => createLiveProfileRunSupport().prepareOutputDirectory({
            requestedPath: output,
            qaArtifactsRoot: qaRoot,
        })).toThrow(/already exists/u);
        expect(readFileSync(sentinel, 'utf8')).toBe('do not remove');
    });

    it('rejects escaping symlinks and in-tree ancestor aliases before creating a run', () => {
        const workspace = temporaryDirectory();
        const qaRoot = join(workspace, 'qa-artifacts');
        const profileRoot = join(qaRoot, 'youtube-live-watch-performance');
        const outside = join(workspace, 'outside');
        const realParent = join(profileRoot, 'real-parent');
        mkdirSync(profileRoot, { recursive: true });
        mkdirSync(outside);
        mkdirSync(realParent);
        symlinkSync(outside, join(profileRoot, 'escape'));
        symlinkSync(realParent, join(profileRoot, 'alias'));
        const support = createLiveProfileRunSupport();

        expect(() => support.prepareOutputDirectory({
            requestedPath: join(profileRoot, 'escape', 'run'),
            qaArtifactsRoot: qaRoot,
        })).toThrow(/escapes|symbolic-link/u);
        expect(() => support.prepareOutputDirectory({
            requestedPath: join(profileRoot, 'alias', 'run'),
            qaArtifactsRoot: qaRoot,
        })).toThrow(/symbolic-link/u);
        expect(existsSync(join(outside, 'run'))).toBe(false);
        expect(existsSync(join(realParent, 'run'))).toBe(false);
    });

    it('rejects a symbolic-link QA root before creating its profile directory', () => {
        const workspace = temporaryDirectory();
        const physicalQaRoot = join(workspace, 'physical-qa-artifacts');
        const qaRootAlias = join(workspace, 'qa-artifacts');
        mkdirSync(physicalQaRoot);
        symlinkSync(physicalQaRoot, qaRootAlias);
        const output = join(qaRootAlias, 'youtube-live-watch-performance', 'run');

        expect(() => createLiveProfileRunSupport().prepareOutputDirectory({
            requestedPath: output,
            qaArtifactsRoot: qaRootAlias,
        })).toThrow(/symbolic-link/u);
        expect(existsSync(join(physicalQaRoot, 'youtube-live-watch-performance'))).toBe(false);
    });

    it('binds a bundled launch to the registry and exact executable identity', () => {
        const executable = executableFixture('bundled-browser');
        const support = createLiveProfileRunSupport({ environment: {}, headed: false });
        const plan = support.launchPlan(
            { engine: 'chromium' },
            { executablePath: () => executable.path },
            browserRegistry(),
        );

        expect(plan.options).toMatchObject({
            headless: true,
            executablePath: executable.path,
            args: ['--autoplay-policy=no-user-gesture-required'],
        });
        expect(plan.descriptor).toMatchObject({
            channel: 'playwright-bundled',
            custom: false,
            headed: false,
            headless: true,
            payloadResolution: 'direct',
            launcher: null,
            executable: {
                path: executable.path,
                sha256: executable.sha256,
                stat: {
                    bytes: executable.bytes,
                    mode: expect.any(Number),
                    mtimeMs: expect.any(Number),
                    device: expect.any(Number),
                    inode: expect.any(Number),
                },
            },
            registry: {
                manifestSha256: 'b'.repeat(64),
                name: 'chromium',
                revision: '1194',
                browserVersion: '141.0.7390.37',
            },
        });
    });

    it('binds the actual WebKit payload behind the pinned Playwright wrapper', () => {
        const fixture = webkitWrapperFixture();
        const support = createLiveProfileRunSupport({
            environment: { WK_CHECKOUT_PATH: '/hostile/checkout' },
            headed: false,
            platform: 'darwin',
            webkitWrapperSha256Allowlist: [fixture.wrapper.sha256],
        });
        const plan = support.launchPlan(
            { engine: 'webkit' },
            { executablePath: () => fixture.wrapper.path },
            browserRegistry(),
        );

        expect(plan.options).toMatchObject({
            executablePath: fixture.wrapper.path,
            env: { WK_CHECKOUT_PATH: join(dirname(fixture.wrapper.path), '.yomu-disabled-webkit-checkout') },
        });
        expect(plan.descriptor).toMatchObject({
            payloadResolution: 'playwright-webkit-wrapper',
            launcher: { path: fixture.wrapper.path, sha256: fixture.wrapper.sha256 },
            executable: { path: fixture.payload.path, sha256: fixture.payload.sha256 },
        });
        expect(plan.descriptor.executable.path).not.toBe(plan.descriptor.launcher.path);
        expect(support.verifyLaunchIdentity(plan.descriptor)).toBe(true);
        writeFileSync(fixture.payload.path, 'mutated-after-resolution');
        chmodSync(fixture.payload.path, 0o755);
        expect(() => support.verifyLaunchIdentity(plan.descriptor)).toThrow(/changed between resolution and launch/u);
    });

    it('fails closed for a changed, missing, or non-executable WebKit wrapper payload', () => {
        const changed = webkitWrapperFixture();
        expect(() => createLiveProfileRunSupport({ platform: 'darwin' }).launchPlan(
            { engine: 'webkit' },
            { executablePath: () => changed.wrapper.path },
            browserRegistry(),
        )).toThrow(/wrapper format is unsupported/u);

        const missing = webkitWrapperFixture({ payload: false });
        expect(() => webkitSupport(missing).launchPlan(
            { engine: 'webkit' },
            { executablePath: () => missing.wrapper.path },
            browserRegistry(),
        )).toThrow(/payload is missing/u);

        const nonExecutable = webkitWrapperFixture();
        chmodSync(nonExecutable.payload.path, 0o644);
        expect(() => webkitSupport(nonExecutable).launchPlan(
            { engine: 'webkit' },
            { executablePath: () => nonExecutable.wrapper.path },
            browserRegistry(),
        )).toThrow(/not executable/u);
    });

    it('binds a headed custom launch to its content and rejects half-configured overrides', () => {
        const executable = executableFixture('custom-browser');
        const environment = {
            YOMU_LIVE_YOUTUBE_CHROMIUM_CHANNEL: 'chrome-stable',
            YOMU_LIVE_YOUTUBE_CHROMIUM_EXECUTABLE: executable.path,
        };
        const support = createLiveProfileRunSupport({ environment, headed: true });
        const plan = support.launchPlan({ engine: 'chromium' }, { executablePath: () => '/unused' }, browserRegistry());

        expect(plan.descriptor).toMatchObject({
            channel: 'chrome-stable',
            custom: true,
            headed: true,
            headless: false,
            payloadResolution: 'direct',
            launcher: null,
            executable: { sha256: executable.sha256 },
            registry: null,
        });
        expect(() => createLiveProfileRunSupport({
            environment: { YOMU_LIVE_YOUTUBE_CHROMIUM_CHANNEL: 'chrome-stable' },
        }).launchPlan({ engine: 'chromium' }, { executablePath: () => executable.path }, browserRegistry())).toThrow(/must be supplied together/u);
    });

    it('keeps absorbed unknown GM requests in a run-fatal ledger', () => {
        const support = createLiveProfileRunSupport();
        const ledger = support.fatalRequestLedger((url: string) => {
            if (url === 'https://known.example/request') return 'known';
            throw new Error('unrecognized request');
        });

        expect(ledger.classify('https://known.example/request')).toBe('known');
        let absorbed = false;
        try {
            ledger.classify('https://unknown.example/request');
        } catch {
            absorbed = true;
        }
        expect(absorbed).toBe(true);
        expect(ledger.snapshot()).toEqual([expect.objectContaining({ method: 'GET', url: 'https://unknown.example/request' })]);
        expect(() => ledger.assertEmpty()).toThrow(/unrecognized GM request/u);
    });

    it('captures bounded page errors, console errors, and the last bootstrap stage', () => {
        const support = createLiveProfileRunSupport();
        const diagnostics = support.browserDiagnostics();
        const listeners = new Map<string, (value: any) => void>();
        diagnostics.install({ on: (type: string, listener: (value: any) => void) => listeners.set(type, listener) });

        listeners.get('console')?.({ type: () => 'warning', text: () => 'ignored' });
        listeners.get('console')?.({ type: () => 'error', text: () => 'bootstrap console failure' });
        listeners.get('pageerror')?.(Object.assign(new Error('product stage failed'), { stack: 'product-stack' }));

        expect(diagnostics.summary({ bootstrap: { current: 'product:start', completed: ['gm', 'instrumentation'] } })).toEqual({
            bootstrap: { current: 'product:start', completed: ['gm', 'instrumentation'] },
            consoleErrors: ['bootstrap console failure'],
            pageErrors: [{ name: 'Error', message: 'product stage failed', stack: 'product-stack' }],
        });
    });

    it('ties ambient playback to wall duration and rejects tiny or stalled progress', () => {
        const support = createLiveProfileRunSupport();
        const progressing = ambientSamples(index => 10 + index);

        expect(support.ambientWindow(progressing, ambientBoundary())).toMatchObject({
            requestedDurationMs: 30_000,
            elapsedWallMs: 30_000,
            sampleCount: 31,
            deltaSeconds: 30,
            progressRatio: 1,
            stalledIntervalCount: 0,
            fullWindow: true,
            progressed: true,
            unpaused: true,
            nonStalled: true,
        });
        expect(support.ambientWindow(ambientSamples(index => 10 + index / 300), ambientBoundary()))
            .toMatchObject({ deltaSeconds: 0.1, progressed: false, nonStalled: false });
        expect(support.ambientWindow(ambientSamples(index => 10 + Math.max(0, index - 1)), ambientBoundary()))
            .toMatchObject({ stalledIntervalCount: 1, nonStalled: false });
    });

    it('starts CDP and page metric collectors at one workload-end boundary', async () => {
        const support = createLiveProfileRunSupport();
        const order: string[] = [];
        const cdp = deferred<Record<string, number>>();
        const page = deferred<Record<string, number>>();
        const captured = support.captureWorkloadEnd({
            cdp: () => { order.push('cdp'); return cdp.promise; },
            page: () => { order.push('page'); return page.promise; },
        });

        expect(order).toEqual(['cdp', 'page']);
        cdp.resolve({ TaskDuration: 1 });
        page.resolve({ elapsedMs: 1 });
        await expect(captured).resolves.toEqual({
            cdpMetrics: { TaskDuration: 1 },
            pageMetrics: { elapsedMs: 1 },
        });
    });

    it('atomically commits failure companions before report.json as the terminal marker', () => {
        const output = temporaryDirectory();
        const renames: string[] = [];
        const support = createLiveProfileRunSupport({ terminalFileSystem: recordingFileSystem(renames) });
        const terminal = {
            generatedAt: '2026-08-09T00:00:00.000Z',
            failure: { name: 'Error', message: 'browser launch failed' },
            requestedRuns: ['chromium:none'],
        };

        support.writeTerminalFailure(output, { status: 'starting', runs: [] }, terminal);

        expect(readJson(join(output, 'report.json'))).toMatchObject({
            status: 'failed',
            failure: { message: 'browser launch failed' },
        });
        expect(readJson(join(output, 'failure.json'))).toEqual(terminal);
        expect(readJson(join(output, 'report.partial.json'))).toMatchObject({ status: 'failed' });
        expect(renames).toEqual(['failure.json', 'report.partial.json', 'report.json']);
        expect(readdirSync(output).some(path => path.endsWith('.tmp'))).toBe(false);
    });

    it('does not expose report.json when a companion commit is interrupted', () => {
        const output = temporaryDirectory();
        const fileSystem = recordingFileSystem([], 'report.partial.json');
        const support = createLiveProfileRunSupport({ terminalFileSystem: fileSystem });
        const terminal = {
            generatedAt: '2026-08-09T00:00:00.000Z',
            failure: { name: 'Error', message: 'interrupted' },
        };

        expect(() => support.writeTerminalFailure(output, { status: 'starting' }, terminal)).toThrow(/interrupted rename/u);
        expect(existsSync(join(output, 'report.json'))).toBe(false);
        expect(readdirSync(output).some(path => path.endsWith('.tmp'))).toBe(false);
    });
});

function browserRegistry(): Record<string, any> {
    return {
        sha256: 'b'.repeat(64),
        browsers: [
            { name: 'chromium', revision: '1194', browserVersion: '141.0.7390.37' },
            { name: 'webkit', revision: '2215', browserVersion: '26.0' },
        ],
    };
}

function executableFixture(content: string): { path: string; sha256: string; bytes: number } {
    const directory = join(temporaryDirectory(), 'chromium-1194');
    mkdirSync(directory, { recursive: true });
    const path = join(directory, 'browser');
    writeFileSync(path, content);
    chmodSync(path, 0o755);
    return {
        path: realpathSync(path),
        sha256: createHash('sha256').update(content).digest('hex'),
        bytes: Buffer.byteLength(content),
    };
}

function webkitWrapperFixture(options: { payload?: boolean } = {}): Record<string, any> {
    const root = join(temporaryDirectory(), 'webkit-2215');
    const wrapperPath = join(root, 'pw_run.sh');
    const payloadPath = join(root, 'Playwright.app/Contents/MacOS/Playwright');
    mkdirSync(root, { recursive: true });
    const wrapperSource = [
        '#!/usr/bin/env bash',
        'SCRIPT_PATH="$(cd "$(dirname "$0")" ; pwd -P)"',
        'PLAYWRIGHT="$SCRIPT_PATH/Playwright.app/Contents/MacOS/Playwright"',
        '"$PLAYWRIGHT" "$@"',
    ].join('\n');
    writeFileSync(wrapperPath, wrapperSource);
    chmodSync(wrapperPath, 0o755);
    if (options.payload !== false) {
        mkdirSync(join(root, 'Playwright.app/Contents/MacOS'), { recursive: true });
        writeFileSync(payloadPath, 'fake-webkit-payload');
        chmodSync(payloadPath, 0o755);
    } else {
        mkdirSync(join(root, 'Playwright.app'), { recursive: true });
    }
    return {
        root,
        wrapper: fileFixtureIdentity(wrapperPath),
        payload: options.payload === false ? null : fileFixtureIdentity(payloadPath),
    };
}

function webkitSupport(fixture: Record<string, any>): Record<string, any> {
    return createLiveProfileRunSupport({
        platform: 'darwin',
        webkitWrapperSha256Allowlist: [fixture.wrapper.sha256],
    });
}

function fileFixtureIdentity(path: string): Record<string, any> {
    const content = readFileSync(path);
    return {
        path: realpathSync(path),
        sha256: createHash('sha256').update(content).digest('hex'),
        bytes: content.byteLength,
    };
}

function ambientSamples(currentTime: (index: number) => number): Record<string, any>[] {
    return Array.from({ length: 31 }, (_value, index) => ({
        found: true,
        paused: false,
        currentTime: currentTime(index),
        playbackRate: 1,
        readyState: 4,
        observedAtMs: index * 1_000,
    }));
}

function ambientBoundary(): Record<string, number> {
    return { startedAtMs: 0, endedAtMs: 30_000, requestedDurationMs: 30_000 };
}

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void } {
    let resolve!: (value: T) => void;
    const promise = new Promise<T>(done => { resolve = done; });
    return { promise, resolve };
}

function recordingFileSystem(renames: string[], failDestination = ''): Record<string, any> {
    return {
        mkdirSync,
        writeFileSync,
        rmSync,
        renameSync(source: string, destination: string) {
            if (basename(destination) === failDestination) throw new Error('interrupted rename');
            renameSync(source, destination);
            renames.push(basename(destination));
        },
    };
}

function temporaryDirectory(): string {
    const directory = mkdtempSync(join(tmpdir(), 'yomu-live-profile-run-support-'));
    temporaryDirectories.push(directory);
    return directory;
}

function readJson(path: string): Record<string, any> {
    return JSON.parse(readFileSync(path, 'utf8'));
}

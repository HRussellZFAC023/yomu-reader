import { createHash } from 'node:crypto';
import { chmodSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
// @ts-expect-error plain .mjs script module without type declarations
import { createLiveProfileRunSupport } from '../../scripts/lib/live-profile-run-support.mjs';

const temporaryDirectories: string[] = [];

afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('live profile run support', () => {
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
        expect(ledger.snapshot()).toEqual([expect.objectContaining({ url: 'https://unknown.example/request' })]);
        expect(() => ledger.assertEmpty()).toThrow(/unrecognized GM request/u);
    });

    it('records ambient end-of-window progression and stalled state', () => {
        const support = createLiveProfileRunSupport();

        expect(support.ambientWindow(
            { found: true, paused: false, currentTime: 10, readyState: 4 },
            { found: true, paused: false, currentTime: 40.125, readyState: 4 },
        )).toMatchObject({ deltaSeconds: 30.125, progressed: true, unpaused: true, nonStalled: true });
        expect(support.ambientWindow(
            { found: true, paused: false, currentTime: 10, readyState: 4 },
            { found: true, paused: false, currentTime: 10, readyState: 2 },
        )).toMatchObject({ deltaSeconds: 0, progressed: false, unpaused: true, nonStalled: false });
    });

    it('writes all terminal failure artifacts even before a browser launches', () => {
        const output = temporaryDirectory();
        const support = createLiveProfileRunSupport();
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
    const directory = temporaryDirectory();
    const path = join(directory, 'browser');
    writeFileSync(path, content);
    chmodSync(path, 0o755);
    return {
        path: realpathSync(path),
        sha256: createHash('sha256').update(content).digest('hex'),
        bytes: Buffer.byteLength(content),
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

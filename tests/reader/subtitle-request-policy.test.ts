import { afterEach, describe, expect, it, vi } from 'vitest';

import { requestSubtitleText } from '../../src/reader/subtitles/subtitle-request';
import { SubtitleRequestPolicy } from '../../src/reader/subtitles/subtitle-request-policy';

class TestSubtitleFailure extends Error {
    constructor(readonly status?: number) {
        super(`test subtitle failure (${status ?? 'transport'})`);
    }
}

function requestPolicy(now: () => number): SubtitleRequestPolicy {
    return new SubtitleRequestPolicy({
        now,
        classifyFailure: error => error instanceof TestSubtitleFailure
            ? { status: error.status }
            : {},
    });
}

async function attemptAll(
    policy: SubtitleRequestPolicy,
    urls: string[],
    operation: () => Promise<string>,
): Promise<unknown[]> {
    const failures: unknown[] = [];
    for (const url of urls) {
        try {
            await policy.run(url, operation);
        } catch (error) {
            failures.push(error);
        }
    }
    return failures;
}

describe('subtitle request retry policy', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('coalesces concurrent calls for the same normalized subtitle URL', async () => {
        const policy = requestPolicy(() => 0);
        let resolveRequest: ((value: string) => void) | undefined;
        const operation = vi.fn(() => new Promise<string>(resolve => { resolveRequest = resolve; }));
        const first = policy.run('https://subs.example/captions?lang=ja&fmt=vtt', operation);
        const duplicate = policy.run('https://subs.example/captions?fmt=vtt&lang=ja', operation);

        await Promise.resolve();
        expect(operation).toHaveBeenCalledTimes(1);
        resolveRequest?.('WEBVTT');

        await expect(Promise.all([first, duplicate])).resolves.toEqual(['WEBVTT', 'WEBVTT']);
    });

    it('bounds persistent endpoint rate limits across format and language fallbacks', async () => {
        let now = 0;
        const policy = requestPolicy(() => now);
        const operation = vi.fn(async () => { throw new TestSubtitleFailure(429); });
        const fallbackUrls = [
            'https://www.youtube.com/api/timedtext?v=video&lang=ja&fmt=srv3',
            'https://www.youtube.com/api/timedtext?v=video&lang=ja&fmt=json3',
            'https://www.youtube.com/api/timedtext?v=video&lang=ja&fmt=vtt',
            'https://www.youtube.com/api/timedtext?v=video&lang=ja&tlang=en&fmt=vtt',
        ];

        expect(await attemptAll(policy, fallbackUrls, operation)).toHaveLength(4);
        expect(operation).toHaveBeenCalledTimes(1);

        now = 4_999;
        await attemptAll(policy, fallbackUrls, operation);
        expect(operation).toHaveBeenCalledTimes(1);

        now = 5_000;
        await attemptAll(policy, fallbackUrls, operation);
        expect(operation).toHaveBeenCalledTimes(2);

        now = 10_000;
        await attemptAll(policy, fallbackUrls, operation);
        expect(operation).toHaveBeenCalledTimes(2);

        now = 15_000;
        await attemptAll(policy, fallbackUrls, operation);
        now = 23_500;
        const finalFailures = await attemptAll(policy, fallbackUrls, operation);

        expect(operation).toHaveBeenCalledTimes(3);
        expect(finalFailures).toHaveLength(4);
        expect(finalFailures.every(error => (error as Error).name === 'SubtitleRequestCooldownError')).toBe(true);
    });

    it('probes at the first cooldown boundary and clears endpoint backoff on recovery', async () => {
        let now = 0;
        const policy = requestPolicy(() => now);
        const operation = vi.fn()
            .mockRejectedValueOnce(new TestSubtitleFailure(429))
            .mockResolvedValue('WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nRecovered.');
        const rateLimitedUrl = 'https://www.youtube.com/api/timedtext?v=video&lang=ja&fmt=srv3';
        const alternateUrl = 'https://www.youtube.com/api/timedtext?v=video&lang=ja&tlang=en&fmt=vtt';

        await expect(policy.run(rateLimitedUrl, operation)).rejects.toMatchObject({ status: 429 });
        now = 4_999;
        await expect(policy.run(alternateUrl, operation)).rejects.toMatchObject({ name: 'SubtitleRequestCooldownError' });
        expect(operation).toHaveBeenCalledTimes(1);

        now = 5_000;
        await expect(policy.run(alternateUrl, operation)).resolves.toContain('Recovered.');
        await expect(policy.run(rateLimitedUrl, operation)).resolves.toContain('Recovered.');
        expect(operation).toHaveBeenCalledTimes(3);
    });

    it('does not turn a 429 into an immediate second HTTP attempt', async () => {
        const originalLocation = window.location;
        const fetchMock = vi.fn();
        const gmRequest = vi.fn((details: Parameters<UserscriptHttpRequest>[0]) => {
            details.onload?.({ status: 429, responseText: 'rate limited', response: '' });
        });
        Object.defineProperty(window, 'location', {
            configurable: true,
            value: new URL('https://www.youtube.com/watch?v=video') as unknown as Location,
        });
        vi.stubGlobal('fetch', fetchMock);
        vi.stubGlobal('GM_xmlhttpRequest', gmRequest);

        try {
            await expect(requestSubtitleText(
                'https://www.youtube.com/api/timedtext?v=video&lang=ja&fmt=srv3',
            )).rejects.toThrow('Subtitle request failed (429).');
            expect(gmRequest).toHaveBeenCalledTimes(1);
            expect(fetchMock).not.toHaveBeenCalled();
        } finally {
            Object.defineProperty(window, 'location', {
                configurable: true,
                value: originalLocation,
            });
        }
    });
});

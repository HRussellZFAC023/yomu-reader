import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { requestPrivateApi } from '../../src/reader/network/private-request';
import { requestBlob as requestOcrBlob } from '../../src/reader/ocr/ocr-providers';
import { JpdbApiClient } from '../../src/reader/jpdb/jpdb-api';
import { requestSubtitleText } from '../../src/reader/subtitles/subtitle-request';
import { loadReaderCssFallback } from '../../src/reader/styles/index';
import { postAnkiJson } from '../../src/reader/anki/transport';
import { requestBlob as requestDictionaryBlob } from '../../src/reader/dictionaries/yomitan/file-utils';

// The routed call sites are now three lines of config each, and everything that
// used to be spelled out in a hand-rolled wrapper — the per-request budget, the
// privacy flags on bearer traffic, the download progress callback — survives only
// as a property of `details`. Nothing asserted those properties: the transport
// suites all drive the stub manager to a deadline or a refusal and never look at
// what was handed to it, so deleting a field from `details` changes what the
// manager actually does while every existing suite stays green.
//
// These tests read the details object the manager was called with. They are the
// only thing standing between `anonymous: true` on the account bearer path and a
// silent, green deletion.
describe('userscript request sites hand the manager the right details', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    type ManagerDetails = Parameters<UserscriptHttpRequest>[0];

    // Accepts the request and never calls back, so the request stays in flight
    // and its details stay readable. Nothing here is ever settled: each caller's
    // promise is parked with a catch so the pending rejection is not unhandled.
    function captureManagerDetails(): { calls: ManagerDetails[] } {
        const calls: ManagerDetails[] = [];
        vi.stubGlobal('GM_xmlhttpRequest', vi.fn((details: ManagerDetails) => {
            calls.push(details);
            return { abort: () => undefined };
        }));
        return { calls };
    }

    function park(request: Promise<unknown>): void {
        request.catch(() => undefined);
    }

    // The call sites reached through a page-fetch or storage step need their
    // microtasks flushed before the manager has been called.
    async function flush(): Promise<void> {
        await vi.advanceTimersByTimeAsync(0);
    }

    function failPageFetch(): void {
        vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
    }

    // The account bearer path is the one place in the reader where the request
    // details are a privacy boundary, not a tuning knob: the sync endpoint must
    // never see the user's cookies for the site they happen to be reading on.
    it('sends account bearer traffic anonymously and without credentials', async () => {
        const { calls } = captureManagerDetails();
        park(requestPrivateApi('https://api.example/account'));
        await flush();

        expect(calls).toHaveLength(1);
        expect(calls[0].anonymous).toBe(true);
        expect(calls[0].withCredentials).toBe(false);
        // Deliberately budget-less: the local backstop is the floor, and adding a
        // `timeout` here would change what the manager itself does.
        expect(calls[0].timeout).toBeUndefined();
    });

    it('keeps the dictionary download on its 120 s budget and its progress callback', async () => {
        const { calls } = captureManagerDetails();
        const progress = vi.fn();
        park(requestDictionaryBlob('https://cdn.example/dict.zip', '', progress));
        await flush();

        expect(calls).toHaveLength(1);
        expect(calls[0].timeout).toBe(120_000);
        expect(calls[0].responseType).toBe('blob');
        // The import dialog's only sign of life during a multi-megabyte archive.
        expect(typeof calls[0].onprogress).toBe('function');
        calls[0].onprogress?.({ lengthComputable: true, loaded: 50, total: 100 } as ProgressEvent);
        expect(progress).toHaveBeenCalledTimes(1);
        expect(String(progress.mock.calls[0][0])).toContain('50%');
    });

    it('keeps the reader CSS fallback on its 6 s budget, anonymously', async () => {
        const { calls } = captureManagerDetails();
        const deadFetcher = vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch;
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        park(loadReaderCssFallback(deadFetcher, 'https://example.test/page'));
        await flush();

        expect(calls.length).toBeGreaterThan(0);
        expect(calls[0].timeout).toBe(6000);
        expect(calls[0].anonymous).toBe(true);
    });

    it('keeps the subtitle fetch on its 8 s budget', async () => {
        failPageFetch();
        const { calls } = captureManagerDetails();
        park(requestSubtitleText('https://cdn.example/track.vtt'));
        await flush();

        expect(calls).toHaveLength(1);
        expect(calls[0].timeout).toBe(8000);
    });

    it('keeps the JPDB request on its 30 s budget', async () => {
        const { calls } = captureManagerDetails();
        park(new JpdbApiClient(() => 'token').request('set-card-sentence', {}));
        await flush();

        expect(calls).toHaveLength(1);
        expect(calls[0].timeout).toBe(30_000);
    });

    it('hands AnkiConnect the caller budget and a JSON post', async () => {
        const { calls } = captureManagerDetails();
        park(postAnkiJson('http://127.0.0.1:8765', '{"action":"version"}', 4000));
        await flush();

        expect(calls).toHaveLength(1);
        expect(calls[0].timeout).toBe(4000);
        expect(calls[0].method).toBe('POST');
        expect(calls[0].responseType).toBe('json');
        expect(calls[0].headers?.['Content-Type']).toBe('application/json');
    });

    it('passes the OCR image budget through to the manager', async () => {
        const { calls } = captureManagerDetails();
        park(requestOcrBlob('https://cdn.example/page.jpg', 9000));
        await flush();

        expect(calls).toHaveLength(1);
        expect(calls[0].timeout).toBe(9000);
        expect(calls[0].responseType).toBe('arraybuffer');
    });
});

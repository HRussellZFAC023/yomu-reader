import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { userFacingCopyKeyOf } from '../../src/reader/app/user-facing-errors';

import { requestPrivateApi } from '../../src/reader/network/private-request';
import { requestBlob as requestOcrBlob } from '../../src/reader/ocr/ocr-providers';
import { JpdbApiClient } from '../../src/reader/jpdb/jpdb-api';
import { requestSubtitleText } from '../../src/reader/subtitles/subtitle-request';
import { loadReaderCssFallback } from '../../src/reader/styles/index';
import { postAnkiJson } from '../../src/reader/anki/transport';
import { requestBlob as requestDictionaryBlob } from '../../src/reader/dictionaries/yomitan/file-utils';

// Every one of these call sites used to wrap GM_xmlhttpRequest by hand, and the
// wrappers shared three defects that all end the same way — a promise that NEVER
// SETTLES, i.e. a reader stuck with no error to report:
//
//   (a) the `timeout` field handed to the manager with no local deadline;
//   (b) the abort handle claimed only when the manager's result is NOT thenable;
//   (c) no teardown when the manager refuses synchronously.
//
// The three stub managers below are exactly those transports. A site that is not
// routed through the shared helper hangs on them, so `pending` here is the
// regression signal — not a slow test.
describe('userscript request sites survive a hostile manager', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    // (a) Accepts the request, then never calls back — the DOM-event bridge with
    // a dropped message, and every manager that ignores the `timeout` field.
    function stubDroppedCallbackManager(): { abort: ReturnType<typeof vi.fn> } {
        const abort = vi.fn();
        vi.stubGlobal('GM_xmlhttpRequest', vi.fn(() => ({ abort })));
        return { abort };
    }

    // (b) Violentmonkey: a thenable that ALSO carries abort().
    function stubThenableWithAbortManager(): { abort: ReturnType<typeof vi.fn> } {
        const abort = vi.fn();
        vi.stubGlobal('GM_xmlhttpRequest', vi.fn(() => Object.assign(new Promise(() => undefined), { abort })));
        return { abort };
    }

    // (c) Refuses synchronously — a host outside @connect, a dead page-world binding.
    function stubSynchronousRefusalManager(): void {
        vi.stubGlobal('GM_xmlhttpRequest', vi.fn(() => { throw new Error('Host is not granted to this userscript.'); }));
    }

    // Settlement is invisible from outside once a promise settles, so track it as
    // data: awaiting alone cannot tell "never called back" from "answered late".
    // `outcome` keeps Error.message for the plain-Error paths below. `copyKey` is the
    // durable identity for anything that throws a UserFacingError: since #39, those
    // carry an English DIAGNOSTIC on `message` (for logs) and the user-facing string
    // behind `yomuUiCopyKey`, because matching rendered copy is what left the
    // dictionary manual-import recovery unreachable.
    function trackSettlement(request: Promise<unknown>): { outcome: string; copyKey: string } {
        const settlement = { outcome: 'pending', copyKey: '' };
        request.then(
            () => { settlement.outcome = 'resolved'; },
            error => {
                settlement.outcome = error instanceof Error ? error.message : String(error);
                settlement.copyKey = userFacingCopyKeyOf(error) ?? '';
            },
        );
        return settlement;
    }

    async function settle(request: Promise<unknown>, ms: number): Promise<string> {
        const settlement = trackSettlement(request);
        await vi.advanceTimersByTimeAsync(ms);
        return settlement.outcome;
    }

    // The account/bearer path passes NO timeout field at all, so even a fully
    // compliant manager never fires ontimeout. Only the local backstop can end it.
    describe('account bearer sync (private-request)', () => {
        it('(a) gives up at the dropped-callback backstop instead of hanging', async () => {
            const { abort } = stubDroppedCallbackManager();
            expect(await settle(requestPrivateApi('https://api.example/account'), 120_001))
                .toBe('Reader account request timed out.');
            expect(abort).toHaveBeenCalledTimes(1);
        });

        it('(b) cancels a thenable-with-abort manager at the deadline', async () => {
            const { abort } = stubThenableWithAbortManager();
            expect(await settle(requestPrivateApi('https://api.example/account'), 120_001))
                .toBe('Reader account request timed out.');
            expect(abort).toHaveBeenCalledTimes(1);
        });

        it('(c) leaves no timer behind when the manager refuses synchronously', async () => {
            stubSynchronousRefusalManager();
            await expect(requestPrivateApi('https://api.example/account')).rejects.toThrow(/not granted/i);
            expect(vi.getTimerCount()).toBe(0);
        });
    });

    // OCR image fetch: the site that had defect (b) verbatim — the handle was
    // assigned only in the else-branch of the thenable check.
    describe('OCR image fetch (ocr-providers)', () => {
        it('(a) gives up at its own budget instead of hanging', async () => {
            const { abort } = stubDroppedCallbackManager();
            expect(await settle(requestOcrBlob('https://cdn.example/page.jpg', 9000), 9001))
                .toBe('Image fetch timed out.');
            expect(abort).toHaveBeenCalledTimes(1);
        });

        it('(b) aborts a thenable-with-abort manager rather than orphaning the transfer', async () => {
            const { abort } = stubThenableWithAbortManager();
            expect(await settle(requestOcrBlob('https://cdn.example/page.jpg', 9000), 9001))
                .toBe('Image fetch timed out.');
            expect(abort).toHaveBeenCalledTimes(1);
        });

        // requestBlob's own callers pass timeout = 0 (the BookWalker mirror's
        // uncapped fetch), which armed no local timer at all before.
        it('(a) backstops a budget-less image fetch', async () => {
            stubDroppedCallbackManager();
            expect(await settle(requestOcrBlob('https://cdn.example/page.jpg'), 120_001))
                .toBe('Request timed out.');
        });

        it('(c) leaves no timer behind when the manager refuses synchronously', async () => {
            stubSynchronousRefusalManager();
            await expect(requestOcrBlob('https://cdn.example/page.jpg', 9000)).rejects.toThrow(/not granted/i);
            expect(vi.getTimerCount()).toBe(0);
        });
    });

    // JPDB annotation: lookup/parser only wraps this in withTimeout when
    // allowApiTimeoutFallback is set, so a dropped callback stalled page
    // annotation outright with nothing above it to recover.
    describe('JPDB API (jpdb-api)', () => {
        // set-card-sentence is not a retryable read endpoint, so this is one attempt.
        const jpdbRequest = () => new JpdbApiClient(() => 'token').request('set-card-sentence', {});

        it('(a) gives up at the 30 s budget instead of hanging', async () => {
            const { abort } = stubDroppedCallbackManager();
            expect(await settle(jpdbRequest(), 30_001)).toBe('JPDB request timed out.');
            expect(abort).toHaveBeenCalledTimes(1);
        });

        it('(b) cancels a thenable-with-abort manager at the deadline', async () => {
            const { abort } = stubThenableWithAbortManager();
            expect(await settle(jpdbRequest(), 30_001)).toBe('JPDB request timed out.');
            expect(abort).toHaveBeenCalledTimes(1);
        });

        it('(c) leaves no timer behind when the manager refuses synchronously', async () => {
            stubSynchronousRefusalManager();
            await expect(jpdbRequest()).rejects.toThrow(/not granted/i);
            expect(vi.getTimerCount()).toBe(0);
        });
    });

    // Subtitles: the page fetch is tried first, so the stub below makes it fail
    // and hands the request to the userscript transport, which had no local
    // deadline and did not bridge the promise shape at all.
    describe('subtitle text (subtitle-request)', () => {
        // Two attempts (SUBTITLE_REQUEST_MAX_ATTEMPTS) at 8 s each plus the retry delay.
        const SUBTITLE_BUDGET_MS = 8000 * 2 + 250 + 10;

        function failPageFetch(): void {
            vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))));
        }

        it('(a) gives up at its own budget instead of hanging', async () => {
            failPageFetch();
            const { abort } = stubDroppedCallbackManager();
            expect(await settle(requestSubtitleText('https://cdn.example/track.vtt'), SUBTITLE_BUDGET_MS))
                .toBe('Subtitle request timed out.');
            expect(abort).toHaveBeenCalled();
        });

        it('(b) bridges a promise-shaped manager and cancels it at the deadline', async () => {
            failPageFetch();
            const { abort } = stubThenableWithAbortManager();
            expect(await settle(requestSubtitleText('https://cdn.example/track.vtt'), SUBTITLE_BUDGET_MS))
                .toBe('Subtitle request timed out.');
            expect(abort).toHaveBeenCalled();
        });

        // A synchronous refusal is classed as a retryable transport failure, so
        // the caller's own retry runs; the timer count proves neither attempt
        // left a deadline behind.
        it('(c) reports a synchronous refusal instead of leaking a timer', async () => {
            failPageFetch();
            stubSynchronousRefusalManager();
            expect(await settle(requestSubtitleText('https://cdn.example/track.vtt'), SUBTITLE_BUDGET_MS))
                .toBe('Subtitle request failed during transport.');
            expect(vi.getTimerCount()).toBe(0);
        });
    });

    // Reader stylesheet: without a local deadline the fallback walk never
    // advanced past its first URL, so the reader stayed on the critical CSS
    // subset for the whole session with nothing logged.
    describe('reader CSS fallback (styles)', () => {
        // Three fallback URLs, each with its own 6 s userscript attempt.
        const CSS_WALK_BUDGET_MS = 6000 * 3 + 100;

        function deadFetcher(): typeof fetch {
            return vi.fn(() => Promise.reject(new TypeError('Failed to fetch'))) as unknown as typeof fetch;
        }

        it('(a) finishes the fallback walk instead of hanging on the first URL', async () => {
            stubDroppedCallbackManager();
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            expect(await settle(loadReaderCssFallback(deadFetcher(), 'https://example.test/page'), CSS_WALK_BUDGET_MS))
                .toBe('resolved');
        });

        it('(b) finishes the walk against a thenable-with-abort manager', async () => {
            const { abort } = stubThenableWithAbortManager();
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            expect(await settle(loadReaderCssFallback(deadFetcher(), 'https://example.test/page'), CSS_WALK_BUDGET_MS))
                .toBe('resolved');
            expect(abort).toHaveBeenCalled();
        });

        it('(c) leaves no timer behind when the manager refuses synchronously', async () => {
            stubSynchronousRefusalManager();
            vi.spyOn(console, 'error').mockImplementation(() => undefined);
            await expect(loadReaderCssFallback(deadFetcher(), 'https://example.test/page')).resolves.toBe('');
            expect(vi.getTimerCount()).toBe(0);
        });
    });

    describe('AnkiConnect (anki/transport)', () => {
        it('(a) gives up at the caller-supplied budget instead of hanging', async () => {
            const { abort } = stubDroppedCallbackManager();
            expect(await settle(postAnkiJson('http://127.0.0.1:8765', '{}', 4000), 4001))
                .toBe('AnkiConnect timed out.');
            expect(abort).toHaveBeenCalledTimes(1);
        });

        it('(b) cancels a thenable-with-abort manager at the deadline', async () => {
            const { abort } = stubThenableWithAbortManager();
            expect(await settle(postAnkiJson('http://127.0.0.1:8765', '{}', 4000), 4001))
                .toBe('AnkiConnect timed out.');
            expect(abort).toHaveBeenCalledTimes(1);
        });

        it('(c) leaves no timer behind when the manager refuses synchronously', async () => {
            stubSynchronousRefusalManager();
            await expect(postAnkiJson('http://127.0.0.1:8765', '{}', 4000)).rejects.toThrow(/not granted/i);
            expect(vi.getTimerCount()).toBe(0);
        });
    });

    // The dictionary download legitimately needs the widest budget in the reader.
    // 120 s stays 120 s — it is only enforced locally now as well.
    describe('dictionary download (yomitan/file-utils)', () => {
        it('(a) gives up at its own 120 s budget instead of hanging', async () => {
            const { abort } = stubDroppedCallbackManager();
            const request = requestDictionaryBlob('https://cdn.example/dict.zip', '');
            const settlement = trackSettlement(request);
            await vi.advanceTimersByTimeAsync(119_000);
            expect(settlement.outcome).toBe('pending');
            await vi.advanceTimersByTimeAsync(1_100);
            expect(settlement.copyKey).toBe('dictionaryDownloadTimedOut');
            expect(abort).toHaveBeenCalledTimes(1);
        });

        it('(b) cancels a thenable-with-abort manager at the deadline', async () => {
            const { abort } = stubThenableWithAbortManager();
            const settlement = trackSettlement(requestDictionaryBlob('https://cdn.example/dict.zip', ''));
            await vi.advanceTimersByTimeAsync(120_001);
            expect(settlement.copyKey).toBe('dictionaryDownloadTimedOut');
            expect(abort).toHaveBeenCalledTimes(1);
        });

        it('(c) reports a synchronous refusal instead of leaking a timer', async () => {
            stubSynchronousRefusalManager();
            const settlement = trackSettlement(requestDictionaryBlob('https://cdn.example/dict.zip', ''));
            await vi.advanceTimersByTimeAsync(0);
            expect(settlement.copyKey).toBe('dictionaryDownloadFailed');
            expect(vi.getTimerCount()).toBe(0);
        });
    });
});

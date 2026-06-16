import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { requestBlob } from '../../src/reader/network/http';

// A recording userscript request (GM_xmlhttpRequest) that always "succeeds" with
// an empty body — it stands in for the DOM-event bridge that, in production,
// cannot carry binary audio Blobs across the content/page world boundary.
const bridgeCalls: Array<{ url: string }> = [];
function bridgeRequest(options: { url: string; onload?: (response: unknown) => void }): void {
    bridgeCalls.push({ url: options.url });
    options.onload?.({ status: 200, response: new Blob([new Uint8Array([7])], { type: 'audio/mpeg' }), responseText: '', finalUrl: options.url });
}

const CLOUDFRONT_AUDIO = 'https://d1vjc5dkcd3yh2.cloudfront.net/audio/%E8%AA%AD%E3%82%80_%E3%82%88%E3%82%80.mp3';
const WORKER_PROXY = 'yomu-jpdb-public-proxy.henry-robert-christopher-russell.workers.dev';

let fetchCalls: string[] = [];

beforeEach(() => {
    bridgeCalls.length = 0;
    fetchCalls = [];
    delete (window as { __YOMU_READER_RUNTIME__?: string }).__YOMU_READER_RUNTIME__;
    vi.stubGlobal('GM_xmlhttpRequest', bridgeRequest);
    vi.stubGlobal('fetch', vi.fn(async (input: unknown) => {
        const url = typeof input === 'string' ? input : String((input as { url?: unknown }).url ?? '');
        fetchCalls.push(url);
        return new Response(new Blob([new Uint8Array([0, 1, 2])], { type: 'audio/mpeg' }), { status: 200, headers: { 'content-type': 'audio/mpeg' } });
    }));
});

afterEach(() => {
    vi.unstubAllGlobals();
    delete (window as { __YOMU_READER_RUNTIME__?: string }).__YOMU_READER_RUNTIME__;
});

describe('audio blob requests on the hosted (newtab) runtime', () => {
    it('routes cross-origin audio through the worker proxy fetch, not the blob-incapable bridge', async () => {
        (window as { __YOMU_READER_RUNTIME__?: string }).__YOMU_READER_RUNTIME__ = 'newtab';

        const blob = await requestBlob(CLOUDFRONT_AUDIO, { responseType: 'blob', preferFetch: true });

        expect(blob.size).toBeGreaterThan(0);
        expect(fetchCalls.some(url => url.includes(WORKER_PROXY))).toBe(true);
        expect(bridgeCalls).toHaveLength(0);
    });

    it('still uses the userscript bridge for cross-origin audio off the hosted runtime', async () => {
        // Not the newtab runtime: a real userscript on jpdb.io etc. must keep using
        // the bridge (its GM_xmlhttpRequest is exempt from the page CSP).
        await requestBlob(CLOUDFRONT_AUDIO, { responseType: 'blob', preferFetch: true }).catch(() => undefined);

        expect(bridgeCalls.some(call => call.url === CLOUDFRONT_AUDIO)).toBe(true);
        expect(fetchCalls).toHaveLength(0);
    });
});

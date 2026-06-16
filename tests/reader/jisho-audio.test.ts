import { readFileSync } from 'node:fs';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Raw jisho HTML as returned by the reader text proxy (r.jina.ai) in HTML mode.
const JINA_HTML = readFileSync('tests/reader/fixtures/jisho-jina-html-yomu.html', 'utf8');

// Hosted reader: no userscript (GM) present, so jisho.org cannot be fetched
// directly (CORS) and the public worker proxy fails its TLS handshake (525).
// The reader must fall back to the text proxy in HTML mode and parse the
// <audio id="audio_{spelling}:{reading}"> element exactly like yomitan.
vi.mock('../../src/reader/userscript/index', () => ({ getUserscriptHttpRequest: () => undefined }));

const { getAudioCandidates } = await import('../../src/reader/audio/candidates');

const card = { vid: 1456360, sid: 0, spelling: '読む', reading: 'よむ', frequency: 0 } as never;

let fetchCalls: Array<{ url: string; returnFormat: string | null }> = [];

beforeEach(() => {
    fetchCalls = [];
    vi.stubGlobal('fetch', vi.fn(async (input: unknown, init?: { headers?: Record<string, string> | Headers }) => {
        const url = typeof input === 'string' ? input : String((input as { url?: unknown }).url ?? '');
        const headers = init?.headers instanceof Headers
            ? Object.fromEntries(init.headers.entries())
            : (init?.headers ?? {});
        fetchCalls.push({ url, returnFormat: (headers as Record<string, string>)['X-Return-Format'] ?? (headers as Record<string, string>)['x-return-format'] ?? null });
        if (/r\.jina\.ai/.test(url)) return new Response(JINA_HTML, { status: 200, headers: { 'content-type': 'text/html' } });
        return new Response('', { status: 404 });
    }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('jisho audio source (hosted reader, no userscript)', () => {
    it('resolves the jisho.org cloudfront mp3 from the text-proxy raw HTML', async () => {
        const candidates = await getAudioCandidates({ type: 'jisho', url: '', voice: '', enabled: true } as never, card, 8000, '');
        const urls = candidates.map(c => c.url);
        expect(urls.some(u => /d1vjc5dkcd3yh2\.cloudfront\.net\/audio\/.+\.mp3/.test(u))).toBe(true);
    });

    it('requests raw HTML (X-Return-Format: html) from the text proxy, not markdown', async () => {
        await getAudioCandidates({ type: 'jisho', url: '', voice: '', enabled: true } as never, card, 8000, '');
        const jina = fetchCalls.find(c => /r\.jina\.ai/.test(c.url));
        expect(jina).toBeTruthy();
        expect(jina?.returnFormat).toBe('html');
    });
});

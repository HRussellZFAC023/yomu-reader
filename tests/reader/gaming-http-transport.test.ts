import { afterEach, describe, expect, it, vi } from 'vitest';
import { JitenApiClient } from '../../src/reader/dictionaries/jiten';
import type { JPDBCard } from '../../src/reader/app/types';
import { installGamingHttpTransport } from '../../src/gaming/renderer/http-transport';

type TransportWindow = Window & { GM_xmlhttpRequest?: unknown };

const JITEN_CARD = {
    vid: 1234,
    sid: 0,
    source: 'jiten',
    spelling: '冒険',
    reading: 'ぼうけん',
    jitenWordId: 1234,
    jitenReadingIndex: 0,
} as unknown as JPDBCard;

function jitenResponse(status: number, body: unknown): Response {
    return new Response(body === undefined ? null : JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}

describe('Yomu Gaming HTTP transport', () => {
    afterEach(() => {
        delete (window as TransportWindow).GM_xmlhttpRequest;
        vi.restoreAllMocks();
    });

    // The baseline the learner hit: the overlay is a plain page with no userscript
    // manager, and the reader keeps a Jiten API key off every proxy it does not own,
    // so an authenticated Jiten write had no route at all and the popup said
    // "Action failed."
    it('has no route for an authenticated Jiten write without the Gaming transport', async () => {
        const fetchSpy = vi.spyOn(globalThis, 'fetch');
        const client = new JitenApiClient(() => 'learner-key');
        await expect(client.reviewCard(JITEN_CARD, 'okay')).rejects.toThrow();
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('sends a Jiten grade from the overlay with the learner key', async () => {
        const fetchImpl = vi.fn(async () => jitenResponse(200, { result: true }));
        installGamingHttpTransport(window, fetchImpl);
        const client = new JitenApiClient(() => 'learner-key');

        await client.reviewCard(JITEN_CARD, 'okay');

        expect(fetchImpl).toHaveBeenCalledTimes(1);
        const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe('https://api.jiten.moe/api/srs/review');
        expect(init.method).toBe('POST');
        expect(new Headers(init.headers).get('Authorization')).toBe('ApiKey learner-key');
        expect(JSON.parse(String(init.body))).toMatchObject({ wordId: 1234, readingIndex: 0 });
        expect(init.credentials).toBe('omit');
    });

    it('adds a word to a Jiten deck from the overlay', async () => {
        const fetchImpl = vi.fn(async () => jitenResponse(204, undefined));
        installGamingHttpTransport(window, fetchImpl);
        const client = new JitenApiClient(() => 'learner-key');

        await client.addToStudyDeck(7, JITEN_CARD, '冒険を始めよう。', 'Yomu Gaming');

        const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
        expect(url).toBe('https://api.jiten.moe/api/srs/study-decks/7/words');
        expect(JSON.parse(String(init.body))).toMatchObject({ wordId: 1234, readingIndex: 0, sentence: '冒険を始めよう。' });
    });

    it('reports a rejected key as a Jiten failure instead of a transport gap', async () => {
        const fetchImpl = vi.fn(async () => jitenResponse(401, { title: 'Unauthorized' }));
        installGamingHttpTransport(window, fetchImpl);
        const client = new JitenApiClient(() => 'stale-key');

        await expect(client.reviewCard(JITEN_CARD, 'okay')).rejects.toThrow(/401|key|Jiten/i);
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('never replaces a request transport the page already has', () => {
        const existing = vi.fn();
        (window as TransportWindow).GM_xmlhttpRequest = existing;
        installGamingHttpTransport(window, vi.fn());
        expect((window as TransportWindow).GM_xmlhttpRequest).toBe(existing);
    });
});

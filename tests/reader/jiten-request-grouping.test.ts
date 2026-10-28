import { describe, expect, it, vi } from 'vitest';
import { JitenApiClient } from '../../src/reader/dictionaries/jiten';
import type { JPDBCard } from '../../src/reader/app/types';

describe('Jiten request grouping', () => {
    it('coalesces overlapping parse calls and duplicate paragraphs into one provider request', async () => {
        const requestBodies: string[][] = [];
        const fetchMock = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
            const body = JSON.parse(String(init?.body ?? '{}')) as { text?: string[] };
            const paragraphs = body.text ?? [];
            requestBodies.push(paragraphs);
            return jsonResponse(jitenParseResponse(paragraphs));
        });
        const client = new JitenApiClient(() => 'jiten-token', { fetchImpl: fetchMock });

        const first = client.parse(['猫', '猫', '']);
        const second = client.parse(['犬', '猫']);
        const [[firstCat, duplicateCat, empty], [dog, sharedCat]] = await Promise.all([first, second]);

        expect(requestBodies).toEqual([['猫', '犬']]);
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(firstCat[0]?.card.spelling).toBe('猫');
        expect(duplicateCat[0]?.card.spelling).toBe('猫');
        expect(sharedCat[0]?.card.spelling).toBe('猫');
        expect(dog[0]?.card.spelling).toBe('犬');
        expect(empty).toEqual([]);
    });

    it('shares bounded public reads across overlapping and repeated consumers', async () => {
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.endsWith('/vocabulary/42/0/info')) {
                return jsonResponse({
                    wordId: 42,
                    mainReading: { text: '猫[ねこ]', readingIndex: 0 },
                    definitions: [{ englishMeanings: ['cat'], pos: ['noun'] }],
                });
            }
            if (url.endsWith('/vocabulary/42/0/random-example-sentences')) return jsonResponse([]);
            if (url.includes('/vocabulary/search?')) {
                return jsonResponse({ results: [{ wordId: 42, readingIndex: 0, text: '猫', rubyText: '猫[ねこ]', meanings: ['cat'] }] });
            }
            if (url.endsWith('/kanji/%E7%8C%AB')) return jsonResponse({ character: '猫', meanings: ['cat'] });
            throw new Error(`Unexpected Jiten URL: ${url}`);
        });
        const client = new JitenApiClient(() => 'jiten-token', { fetchImpl: fetchMock });
        const card = jitenCard();

        const [firstInfo, overlappingInfo] = await Promise.all([
            client.lookupVocabularyInfo(card),
            client.lookupVocabularyInfo(card),
        ]);
        const repeatedInfo = await client.lookupVocabularyInfo(card);
        await Promise.all([client.searchVocabulary('猫'), client.searchVocabulary('猫')]);
        await Promise.all([client.lookupKanji('猫'), client.lookupKanji('猫')]);

        expect(firstInfo).toBe(overlappingInfo);
        expect(repeatedInfo).toBe(firstInfo);
        expect(requestCount(fetchMock, '/vocabulary/42/0/info')).toBe(1);
        expect(requestCount(fetchMock, '/vocabulary/42/0/random-example-sentences')).toBe(1);
        expect(requestCount(fetchMock, '/vocabulary/search?')).toBe(1);
        expect(requestCount(fetchMock, '/kanji/%E7%8C%AB')).toBe(1);
        expect(fetchMock).toHaveBeenCalledTimes(4);
    });

    it('drops a failed read from the cache so the next lookup can heal', async () => {
        const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
            const url = String(input);
            if (url.endsWith('/random-example-sentences')) return jsonResponse([]);
            if (requestCount(fetchMock, '/vocabulary/42/0/info') === 1) return jsonResponse({ message: 'temporary failure' }, 503);
            return jsonResponse({ wordId: 42, mainReading: { text: '猫[ねこ]', readingIndex: 0 }, definitions: [] });
        });
        const client = new JitenApiClient(() => 'jiten-token', { fetchImpl: fetchMock });

        await expect(client.lookupVocabularyInfo(jitenCard())).rejects.toThrow('Jiten request failed (503).');
        await expect(client.lookupVocabularyInfo(jitenCard())).resolves.toMatchObject({ wordId: 42 });
        expect(requestCount(fetchMock, '/vocabulary/42/0/info')).toBe(2);
    });
});

function jitenParseResponse(paragraphs: string[]) {
    return {
        vocabulary: paragraphs.map((paragraph, index) => ({
            wordId: index + 1,
            readingIndex: 0,
            spelling: paragraph,
            reading: paragraph,
            meaningsChunks: [[`meaning ${paragraph}`]],
            meaningsPartOfSpeech: [[]],
            knownState: [],
            pitchAccents: [],
        })),
        tokens: paragraphs.map((paragraph, index) => [{
            wordId: index + 1,
            readingIndex: 0,
            start: 0,
            end: paragraph.length,
            length: paragraph.length,
        }]),
    };
}

function jitenCard(): JPDBCard {
    return {
        vid: 42,
        sid: 0,
        rid: 0,
        spelling: '猫',
        reading: 'ねこ',
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'jiten',
        reviewSource: 'jiten-api',
        jitenWordId: 42,
        jitenReadingIndex: 0,
    };
}

function requestCount(fetchMock: { mock: { calls: readonly (readonly unknown[])[] } }, fragment: string): number {
    return fetchMock.mock.calls.filter(([url]) => String(url).includes(fragment)).length;
}

function jsonResponse(payload: unknown, status = 200): Response {
    return new Response(JSON.stringify(payload), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

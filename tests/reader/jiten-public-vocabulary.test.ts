import { describe, expect, it, vi } from 'vitest';
import { JitenPublicVocabularyClient } from '../../src/reader/dictionaries/jiten-public-vocabulary';

describe('JitenPublicVocabularyClient', () => {
    it('hydrates keyless vocabulary details with reading and pitch accents', async () => {
        const requestJson = vi.fn(async (url: string) => {
            if (url.includes('/vocabulary/parse?')) {
                return [
                    { wordId: 1381470, readingIndex: 0, originalText: '青空' },
                    { wordId: 2029010, readingIndex: 0, originalText: 'を' },
                    { wordId: 1456360, readingIndex: 0, originalText: '読む' },
                ];
            }
            if (url.includes('/vocabulary/1381470/0/info')) {
                return {
                    wordId: 1381470,
                    mainReading: { text: '青[あお]空[ぞら]', frequencyRank: 6924 },
                    partsOfSpeech: ['n'],
                    definitions: [{ meanings: ['blue sky'], partsOfSpeech: ['noun'] }],
                    pitchAccents: [3],
                };
            }
            throw new Error(`Unexpected URL: ${url}`);
        });
        const client = new JitenPublicVocabularyClient({ requestJsonImpl: requestJson });

        const card = await client.lookup('青空');

        expect(card).toMatchObject({
            vid: 1381470,
            sid: 0,
            spelling: '青空',
            reading: 'あおぞら',
            source: 'jiten',
            jitenWordId: 1381470,
            jitenReadingIndex: 0,
            frequencyRank: 6924,
            pitchAccent: ['LHHLL'],
        });
        expect(requestJson).toHaveBeenCalledTimes(2);

        await expect(client.lookup('青空')).resolves.toBe(card);
        expect(requestJson).toHaveBeenCalledTimes(2);
    });

    it('dedupes batched public detail requests', async () => {
        const requestJson = vi.fn(async (url: string) => {
            if (url.includes('/vocabulary/parse?')) {
                return [
                    { wordId: 1381470, readingIndex: 0, originalText: '青空' },
                    { wordId: 1381470, readingIndex: 0, originalText: '青空' },
                ];
            }
            if (url.includes('/vocabulary/1381470/0/info')) {
                return {
                    wordId: 1381470,
                    mainReading: { text: '青[あお]空[ぞら]', frequencyRank: 6924 },
                    definitions: [{ meanings: ['blue sky'] }],
                    pitchAccents: [3],
                };
            }
            throw new Error(`Unexpected URL: ${url}`);
        });
        const client = new JitenPublicVocabularyClient({ requestJsonImpl: requestJson });

        const cards = await client.lookupMany(['青空', '青空']);

        expect(cards.get('青空')).toMatchObject({ spelling: '青空', pitchAccent: ['LHHLL'] });
        expect(requestJson.mock.calls.filter(([url]) => String(url).includes('/vocabulary/parse?'))).toHaveLength(1);
        expect(requestJson.mock.calls.filter(([url]) => String(url).includes('/vocabulary/1381470/0/info'))).toHaveLength(1);
    });
});

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

    it('separates ambiguous short batch terms for Jiten parsing', async () => {
        const details = new Map([
            [1444810, { text: '登録[とうろく]', pitchAccents: [0] }],
            [1322990, { text: '者[もの]', pitchAccents: [2] }],
            [1580825, { text: '数[かず]', pitchAccents: [1] }],
            [1584500, { text: '万[まん]人[にん]', pitchAccents: [0] }],
            [1451290, { text: '動画[どうが]', pitchAccents: [0] }],
            [1315840, { text: '時[とき]', pitchAccents: [2] }],
            [1259290, { text: '見[み]る', pitchAccents: [1] }],
        ]);
        const requestJson = vi.fn(async (url: string) => {
            if (url.includes('/vocabulary/parse?')) {
                expect(new URL(url).searchParams.get('text')).toBe('登録。者。数。万人。動画。時。見る。未登録語');
                return [
                    { wordId: 1444810, readingIndex: 0, originalText: '登録' },
                    { wordId: 0, readingIndex: 0, originalText: '。' },
                    { wordId: 1322990, readingIndex: 0, originalText: '者' },
                    { wordId: 0, readingIndex: 0, originalText: '。' },
                    { wordId: 1580825, readingIndex: 0, originalText: '数' },
                    { wordId: 1584500, readingIndex: 0, originalText: '万人' },
                    { wordId: 1451290, readingIndex: 0, originalText: '動画' },
                    { wordId: 1315840, readingIndex: 0, originalText: '時' },
                    { wordId: 1259290, readingIndex: 0, originalText: '見る' },
                ];
            }
            const match = url.match(/\/vocabulary\/(\d+)\/0\/info/u);
            const detail = match ? details.get(Number(match[1])) : undefined;
            if (detail) {
                return {
                    wordId: Number(match?.[1]),
                    mainReading: { text: detail.text },
                    definitions: [{ meanings: ['definition'] }],
                    pitchAccents: detail.pitchAccents,
                };
            }
            throw new Error(`Unexpected URL: ${url}`);
        });
        const client = new JitenPublicVocabularyClient({ requestJsonImpl: requestJson });

        const cards = await client.lookupMany(['登録', '者', '数', '万人', '動画', '時', '見る', '未登録語']);

        expect(cards.get('登録')).toMatchObject({ spelling: '登録', reading: 'とうろく', source: 'jiten' });
        expect(cards.get('万人')).toMatchObject({ spelling: '万人', reading: 'まんにん', source: 'jiten' });
        expect(cards.get('見る')).toMatchObject({ spelling: '見る', reading: 'みる', source: 'jiten' });
        expect(cards.has('未登録語')).toBe(false);
        expect(requestJson.mock.calls.some(([url]) => String(url).includes('/vocabulary/0/0/info'))).toBe(false);
    });
});

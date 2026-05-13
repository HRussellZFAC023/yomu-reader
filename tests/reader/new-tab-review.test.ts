import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnkiConnectClient } from '../../src/reader/anki';
import { parseJpdbReviewDocument } from '../../src/reader/jpdb-review-bridge';
import { assessKanjiStrokes } from '../../src/reader/kanji-stroke-grader';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('new tab review helpers', () => {
    it('parses live JPDB kanji review fronts from the review card id', () => {
        const doc = new DOMParser().parseFromString(`
            <main>
                <input name="c" value="kb,記">
                <div class="kind">Kanji</div>
                <div class="plain">record</div>
            </main>
        `, 'text/html');

        const status = parseJpdbReviewDocument(doc, 'https://jpdb.io/review?c=kb,%E8%A8%98');

        expect(status.connected).toBe(true);
        expect(status.card?.kind).toBe('kanji');
        expect(status.card?.phase).toBe('front');
        expect(status.card?.kanji).toBe('記');
        expect(status.card?.prompt).toContain('record');
    });

    it('parses JPDB vocabulary review sentences and highlighted targets', () => {
        const doc = new DOMParser().parseFromString(`
            <main>
                <div class="kind">Vocabulary</div>
                <div class="card-sentence">
                    <div class="sentence">ここへ<span class="highlight">来て</span>見てみなよ。</div>
                </div>
            </main>
        `, 'text/html');

        const status = parseJpdbReviewDocument(doc, 'https://jpdb.io/review#demo');

        expect(status.card?.kind).toBe('vocabulary');
        expect(status.card?.sentence).toContain('ここへ');
        expect(status.card?.spelling).toBe('来て');
    });

    it('grades kanji doodles from stroke count and basic drawing coverage', () => {
        const assessment = assessKanjiStrokes([
            [{ x: 0.1, y: 0.1, pressure: 0.5 }, { x: 0.9, y: 0.1, pressure: 0.5 }],
            [{ x: 0.2, y: 0.2, pressure: 0.5 }, { x: 0.2, y: 0.9, pressure: 0.5 }],
        ], 2);

        expect(assessment.passed).toBe(true);
        expect(assessment.score).toBeGreaterThanOrEqual(68);
    });

    it('loads Anki due and new cards through AnkiConnect review actions', async () => {
        const actions: string[] = [];
        vi.stubGlobal('fetch', async (_url: string, init?: RequestInit) => {
            const request = JSON.parse(String(init?.body ?? '{}')) as { action: string; params: Record<string, unknown> };
            actions.push(request.action);
            const result = (() => {
                if (request.action === 'findCards') return [101, 102, 103];
                if (request.action === 'areDue') return [true, false, true];
                if (request.action === 'cardsInfo') return [
                    { cardId: 101, note: 1, deckName: 'Yomu', queue: 2, type: 2, due: 0 },
                    { cardId: 102, note: 2, deckName: 'Yomu', queue: 2, type: 2, due: 99 },
                    { cardId: 103, note: 3, deckName: 'Yomu', queue: 0, type: 0, due: 0 },
                ];
                if (request.action === 'notesInfo') return [
                    {
                        noteId: 1,
                        modelName: 'Yomu Japanese',
                        tags: [],
                        cards: [101],
                        fields: {
                            Expression: { value: '読む' },
                            Reading: { value: 'よむ' },
                            Meaning: { value: 'to read' },
                            Sentence: { value: '本を読む。' },
                        },
                    },
                    {
                        noteId: 3,
                        modelName: 'Yomu Japanese',
                        tags: [],
                        cards: [103],
                        fields: {
                            Expression: { value: '書く' },
                            Reading: { value: 'かく' },
                            Meaning: { value: 'to write' },
                            Sentence: { value: '名前を書く。' },
                        },
                    },
                ];
                return null;
            })();
            return new Response(JSON.stringify({ result, error: null }), { status: 200 });
        });

        const client = new AnkiConnectClient(() => ({
            ...DEFAULT_SETTINGS,
            ankiEnabled: true,
            ankiDeck: 'Yomu',
            ankiModel: 'Yomu Japanese',
        }));
        const cards = await client.listNewTabCards(10);

        expect(actions).toEqual(['findCards', 'areDue', 'cardsInfo', 'notesInfo']);
        expect(cards.map(card => card.spelling)).toEqual(['読む', '書く']);
        expect(cards[0].ankiCardId).toBe(101);
        expect(cards[0].sentence).toBe('本を読む。');
    });
});

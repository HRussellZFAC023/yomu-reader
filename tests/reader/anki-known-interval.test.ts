import { afterEach, describe, expect, it, vi } from 'vitest';
import { stateFromAnkiCards } from '../../src/reader/anki/card-details';
import { AnkiConnectClient } from '../../src/reader/anki/client';
import { statusIndexEntriesForNotes } from '../../src/reader/anki/status-index';
import { ankiAccountContextKey, ankiStatusIndexSettingsKey } from '../../src/reader/anki/account-context';
import type { AnkiCardInfo, AnkiNoteInfo, AnkiStatusIndexCardSets } from '../../src/reader/anki/types';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { KNOWN_INTERVAL_DAYS } from '../../src/reader/srs/known-interval';
import { sensitiveFingerprint } from '../../src/reader/core/sensitive-fingerprint';

const clients: AnkiConnectClient[] = [];
afterEach(() => { clients.splice(0).forEach(client => client.destroy()); vi.restoreAllMocks(); });

function review(interval: number, overrides: Partial<AnkiCardInfo> = {}): AnkiCardInfo {
    return { cardId: 1, note: 10, deckName: 'Core', queue: 2, type: 2, due: 100, isDue: false, interval, ...overrides };
}
function sets(): AnkiStatusIndexCardSets {
    return { all: new Set([1]), due: new Set(), learning: new Set(), new: new Set(), suspended: new Set(), shortIntervalReview: new Set() };
}
const note: AnkiNoteInfo = { noteId: 10, modelName: 'Imported Core', tags: [], fields: { Expression: { value: '日本語' } }, cards: [1] };
function indexedState(cards: AnkiStatusIndexCardSets, info: AnkiCardInfo[] = [], cardIds = [1]) {
    return statusIndexEntriesForNotes([{ ...note, cards: cardIds }], {
        sets: cards, cardsByNote: new Map(info.length ? [[10, info]] : []),
    }, DEFAULT_SETTINGS)[0]!.entry.state;
}

describe('shared Known interval', () => {
    it('uses 21 days and invalidates indexes built under the old maturity rule', () => {
        expect(KNOWN_INTERVAL_DAYS).toBe(21);
        const oldKey = sensitiveFingerprint(JSON.stringify({ account: ankiAccountContextKey(DEFAULT_SETTINGS) }));
        expect(ankiStatusIndexSettingsKey(DEFAULT_SETTINGS)).not.toBe(oldKey);
    });

    it.each([0, 3, 20, 21, 30])('classifies interval %i in the popup and both index paths', interval => {
        const cardSets = sets();
        if (interval < 21) cardSets.shortIntervalReview.add(1);
        const expected = interval < 21 ? 'learning' : 'known';
        expect(stateFromAnkiCards([review(interval)])).toBe(expected);
        expect(indexedState(cardSets)).toBe(expected);
        expect(indexedState(cardSets, [review(interval)])).toBe(expected);
    });

    it.each([3, 30])('preserves Due and Suspended ahead of interval %i', interval => {
        const cardSets = sets();
        if (interval < 21) cardSets.shortIntervalReview.add(1);
        cardSets.due.add(1);
        expect(stateFromAnkiCards([review(interval, { isDue: true })])).toBe('due');
        expect(indexedState(cardSets)).toBe('due');
        cardSets.due.clear(); cardSets.suspended.add(1);
        expect(stateFromAnkiCards([review(interval, { queue: -1 })])).toBe('suspended');
        expect(indexedState(cardSets)).toBe('suspended');
    });

    it('does not let a suspended short-interval sibling make a mature active card Learning', () => {
        const cardSets = sets(); cardSets.all.add(2); cardSets.suspended.add(1); cardSets.shortIntervalReview.add(1);
        expect(stateFromAnkiCards([review(3, { queue: -1 }), review(30, { cardId: 2 })])).toBe('known');
        expect(indexedState(cardSets, [], [1, 2])).toBe('known');
    });

    it('keeps New, learning steps, relearning and empty-note behavior', () => {
        expect(stateFromAnkiCards([review(30, { type: 0, queue: 0 })])).toBe('new');
        expect(stateFromAnkiCards([review(30, { type: 1, queue: 1, isDue: true })])).toBe('learning');
        expect(stateFromAnkiCards([review(30, { type: 3, queue: 3 })])).toBe('failed');
        expect(stateFromAnkiCards([])).toBe('known');
        const cardSets = sets(); cardSets.new.add(1); cardSets.shortIntervalReview.add(2);
        expect(indexedState(cardSets, [], [1, 2])).toBe('new');
        cardSets.learning.add(1);
        expect(indexedState(cardSets)).toBe('learning');
    });

    it('conservatively keeps a review card without interval Learning', () => {
        expect(stateFromAnkiCards([review(30, { interval: undefined })])).toBe('learning');
    });
});

it('loads one additional interval set and preserves maturity in the fast index without cardsInfo', async () => {
    const client = new AnkiConnectClient(() => DEFAULT_SETTINGS); clients.push(client);
    const invoke = vi.spyOn(client, 'invoke').mockImplementation(async (action, params = {}) => {
        if (action === 'findCards') return params.query === 'deck:* is:review prop:ivl<21' ? [1] : [];
        if (action === 'cardsToNotes') return [10, 20];
        if (action === 'getDecks') return { Core: [1, 2] };
        throw new Error(`Unexpected action ${action}`);
    });
    // Exercise the exact private bulk path, which shares the popup classifier.
    const bulk = client as unknown as { loadStatusIndexCardData(ids: number[], owner: undefined, key: string): Promise<{ sets: AnkiStatusIndexCardSets; cardsByNote: Map<number, AnkiCardInfo[]> }> };
    const data = await bulk.loadStatusIndexCardData([1, 2], undefined, 'test');
    expect(stateFromAnkiCards(data.cardsByNote.get(10)!)).toBe('learning');
    expect(stateFromAnkiCards(data.cardsByNote.get(20)!)).toBe('known');
    expect(invoke.mock.calls.filter(([action]) => action === 'findCards').map(([, params]) => params!.query)).toEqual([
        'deck:* is:due', 'deck:* is:learn', 'deck:* is:new', 'deck:* is:suspended', 'deck:* is:review prop:ivl<21', 'deck:* is:learn is:review',
    ]);
    expect(invoke.mock.calls.some(([action]) => action === 'cardsInfo')).toBe(false);
});

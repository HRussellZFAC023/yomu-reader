import { afterEach, describe, expect, it, vi } from 'vitest';

import { cardStateSignalCard, publishCardStateSignal, subscribeToCardStateSignals } from '../../src/reader/app/card-state-signal';
import type { CardState, JPDBCard } from '../../src/reader/app/types';

afterEach(() => {
    vi.unstubAllGlobals();
});

function card(overrides: Partial<JPDBCard> = {}): JPDBCard {
    return {
        vid: 11,
        sid: 22,
        rid: 0,
        spelling: '日本語',
        reading: 'にほんご',
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['known'] as CardState[],
        pitchAccent: ['LHHH'],
        wordWithReading: null,
        source: 'jpdb',
        ...overrides,
    };
}

type GmListener = (key: string, oldValue: unknown, newValue: unknown, remote: boolean) => void;

function stubGmValueChange(): { listeners: Map<number, GmListener>; removed: number[] } {
    const listeners = new Map<number, GmListener>();
    const removed: number[] = [];
    let nextId = 1;
    vi.stubGlobal('GM_addValueChangeListener', (_key: string, listener: GmListener) => {
        const id = nextId++;
        listeners.set(id, listener);
        return id;
    });
    vi.stubGlobal('GM_removeValueChangeListener', (id: number) => {
        removed.push(id);
        listeners.delete(id);
    });
    return { listeners, removed };
}

function signalValue(id: string, overrides: Partial<ReturnType<typeof cardStateSignalCard>> = {}): unknown {
    return { id, at: Date.now(), card: { ...cardStateSignalCard(card()), ...overrides } };
}

describe('card state signal bus', () => {
    it('delivers remote GM signals as reconstructed cards and ignores same-tab echoes and duplicates', () => {
        const { listeners } = stubGmValueChange();
        const received: JPDBCard[] = [];
        const unsubscribe = subscribeToCardStateSignals(signalCard => { received.push(signalCard); });
        const listener = [...listeners.values()][0]!;

        listener('yomu:card-state-signal', undefined, signalValue('s1'), true);
        expect(received).toHaveLength(1);
        expect(received[0]).toMatchObject({ vid: 11, sid: 22, spelling: '日本語', cardState: ['known'], pitchAccent: ['LHHH'] });
        // Reconstructed cards are valid JPDBCards for the recolor path.
        expect(received[0]!.meanings).toEqual([]);

        // Same-tab events are already applied locally.
        listener('yomu:card-state-signal', undefined, signalValue('s2'), false);
        expect(received).toHaveLength(1);

        // Duplicate ids (multi-transport delivery) apply once.
        listener('yomu:card-state-signal', undefined, signalValue('s1'), true);
        expect(received).toHaveLength(1);

        // Malformed payloads are ignored.
        listener('yomu:card-state-signal', undefined, { id: 's3', card: { spelling: '' } }, true);
        listener('yomu:card-state-signal', undefined, 'junk', true);
        expect(received).toHaveLength(1);

        unsubscribe();
    });

    it('carries provider deck metadata for cross-tab rendered-word styling', () => {
        const { listeners } = stubGmValueChange();
        const received: JPDBCard[] = [];
        const unsubscribe = subscribeToCardStateSignals(signalCard => { received.push(signalCard); });
        const listener = [...listeners.values()][0]!;

        listener('yomu:card-state-signal', undefined, signalValue('decked', {
            source: 'jiten',
            deckNames: ['Yomu E2E Seed'],
            sourceDeckName: 'Yomu E2E Seed',
            jpdbDeckMembership: 'Part of the Yomu E2E Seed deck',
            ankiDeckNames: ['Mining'],
        }), true);

        expect(received[0]).toMatchObject({
            source: 'jiten',
            deckNames: ['Yomu E2E Seed'],
            sourceDeckName: 'Yomu E2E Seed',
            jpdbDeckMembership: 'Part of the Yomu E2E Seed deck',
            ankiDeckNames: ['Mining'],
        });

        unsubscribe();
    });

    it('carries Academy review identity and schedule for canonical cross-tab repainting', () => {
        const { listeners } = stubGmValueChange();
        const received: JPDBCard[] = [];
        const unsubscribe = subscribeToCardStateSignals(signalCard => { received.push(signalCard); });
        const listener = [...listeners.values()][0]!;

        listener('yomu:card-state-signal', undefined, signalValue('academy', {
            reviewSource: 'yomu-local',
            dueAt: 1_234_567,
            lastReviewAt: 1_000_000,
        }), true);

        expect(received[0]).toMatchObject({
            spelling: '日本語',
            reading: 'にほんご',
            reviewSource: 'yomu-local',
            dueAt: 1_234_567,
            lastReviewAt: 1_000_000,
        });
        unsubscribe();
    });

    it('removes the GM listener on unsubscribe and survives publishing without GM storage', () => {
        const { listeners, removed } = stubGmValueChange();
        const unsubscribe = subscribeToCardStateSignals(() => undefined);
        expect(listeners.size).toBe(1);
        unsubscribe();
        expect(removed).toHaveLength(1);

        // No GM_setValue in this environment: publish must not throw.
        expect(() => publishCardStateSignal(card())).not.toThrow();
    });
});

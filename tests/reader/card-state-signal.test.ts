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

function stubGmValueChange(): { listeners: Map<number, GmListener>; removed: number[]; values: Map<string, unknown> } {
    const listeners = new Map<number, GmListener>();
    const removed: number[] = [];
    const values = new Map<string, unknown>();
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
    vi.stubGlobal('GM_getValue', (key: string, fallback: unknown) => values.has(key) ? values.get(key) : fallback);
    return { listeners, removed, values };
}

function signalValue(id: string, overrides: Partial<ReturnType<typeof cardStateSignalCard>> = {}): unknown {
    return { id, at: Date.now(), card: { ...cardStateSignalCard(card()), ...overrides } };
}

function emitStoredSignal(values: Map<string, unknown>, listener: GmListener, value: unknown, remote: boolean): void {
    values.set('yomu:private:card-state-signal:v1', value);
    listener('yomu:private:card-state-signal:v1', undefined, value, remote);
}

class FakeBroadcastChannel {
    static instances: FakeBroadcastChannel[] = [];
    readonly postMessage = vi.fn();
    readonly close = vi.fn();
    onmessage: ((event: MessageEvent) => void) | null = null;

    constructor(readonly name: string) {
        FakeBroadcastChannel.instances.push(this);
    }
}

describe('card state signal bus', () => {
    it('never constructs, posts, or receives BroadcastChannel data offhost while private GM updates still apply', async () => {
        FakeBroadcastChannel.instances = [];
        vi.stubGlobal('location', { href: 'https://www.youtube.com/watch?v=hostile' });
        vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
        const { listeners, values } = stubGmValueChange();
        const received: JPDBCard[] = [];
        const unsubscribe = subscribeToCardStateSignals(signalCard => { received.push(signalCard); });

        publishCardStateSignal(card({ sourceDeckName: 'Private deck' }));
        expect(FakeBroadcastChannel.instances).toHaveLength(0);

        emitStoredSignal(values, [...listeners.values()][0]!, signalValue('private-gm'), true);
        await vi.waitFor(() => expect(received).toHaveLength(1));
        expect(received[0]?.spelling).toBe('日本語');
        expect(FakeBroadcastChannel.instances).toHaveLength(0);
        unsubscribe();
    });

    it('uses BroadcastChannel only on an exact owned Study surface', async () => {
        FakeBroadcastChannel.instances = [];
        vi.stubGlobal('location', { href: 'https://yomureader.com/study/' });
        vi.stubGlobal('BroadcastChannel', FakeBroadcastChannel);
        stubGmValueChange();
        const received: JPDBCard[] = [];
        const unsubscribe = subscribeToCardStateSignals(signalCard => { received.push(signalCard); });
        const listenerChannel = FakeBroadcastChannel.instances[0]!;
        expect(listenerChannel.name).toBe('yomu:card-state');

        publishCardStateSignal(card());
        const publisherChannel = FakeBroadcastChannel.instances[1]!;
        expect(publisherChannel.name).toBe('yomu:card-state');
        expect(publisherChannel.postMessage).toHaveBeenCalledOnce();
        expect(publisherChannel.close).toHaveBeenCalledOnce();

        listenerChannel.onmessage?.({ data: signalValue('trusted-broadcast') } as MessageEvent);
        await vi.waitFor(() => expect(received).toHaveLength(1));
        unsubscribe();
        expect(listenerChannel.close).toHaveBeenCalledOnce();
    });

    it('delivers remote GM signals as reconstructed cards and ignores same-tab echoes and duplicates', async () => {
        const { listeners, values } = stubGmValueChange();
        const received: JPDBCard[] = [];
        const unsubscribe = subscribeToCardStateSignals(signalCard => { received.push(signalCard); });
        const listener = [...listeners.values()][0]!;

        emitStoredSignal(values, listener, signalValue('s1'), true);
        await vi.waitFor(() => expect(received).toHaveLength(1));
        expect(received[0]).toMatchObject({ vid: 11, sid: 22, spelling: '日本語', cardState: ['known'], pitchAccent: ['LHHH'] });
        // Reconstructed cards are valid JPDBCards for the recolor path.
        expect(received[0]!.meanings).toEqual([]);

        // Same-tab events are already applied locally.
        emitStoredSignal(values, listener, signalValue('s2'), false);
        expect(received).toHaveLength(1);

        // Duplicate ids (multi-transport delivery) apply once.
        emitStoredSignal(values, listener, signalValue('s1'), true);
        expect(received).toHaveLength(1);

        // Malformed payloads are ignored.
        emitStoredSignal(values, listener, { id: 's3', card: { spelling: '' } }, true);
        emitStoredSignal(values, listener, 'junk', true);
        expect(received).toHaveLength(1);

        unsubscribe();
    });

    it('carries provider deck metadata for cross-tab rendered-word styling', async () => {
        const { listeners, values } = stubGmValueChange();
        const received: JPDBCard[] = [];
        const unsubscribe = subscribeToCardStateSignals(signalCard => { received.push(signalCard); });
        const listener = [...listeners.values()][0]!;

        emitStoredSignal(values, listener, signalValue('decked', {
            source: 'jiten',
            deckNames: ['Yomu E2E Seed'],
            sourceDeckName: 'Yomu E2E Seed',
            jpdbDeckMembership: 'Part of the Yomu E2E Seed deck',
            ankiDeckNames: ['Mining'],
        }), true);

        await vi.waitFor(() => expect(received).toHaveLength(1));
        expect(received[0]).toMatchObject({
            source: 'jiten',
            deckNames: ['Yomu E2E Seed'],
            sourceDeckName: 'Yomu E2E Seed',
            jpdbDeckMembership: 'Part of the Yomu E2E Seed deck',
            ankiDeckNames: ['Mining'],
        });

        unsubscribe();
    });

    it('carries Academy review identity and schedule for canonical cross-tab repainting', async () => {
        const { listeners, values } = stubGmValueChange();
        const received: JPDBCard[] = [];
        const unsubscribe = subscribeToCardStateSignals(signalCard => { received.push(signalCard); });
        const listener = [...listeners.values()][0]!;

        emitStoredSignal(values, listener, signalValue('academy', {
            reviewSource: 'yomu-local',
            dueAt: 1_234_567,
            lastReviewAt: 1_000_000,
        }), true);

        await vi.waitFor(() => expect(received).toHaveLength(1));
        expect(received[0]).toMatchObject({
            spelling: '日本語',
            reading: 'にほんご',
            reviewSource: 'yomu-local',
            dueAt: 1_234_567,
            lastReviewAt: 1_000_000,
        });
        unsubscribe();
    });

    it('preserves GM event order when epoch validation is asynchronous', async () => {
        let listener: GmListener | undefined;
        const values = new Map<string, unknown>();
        vi.stubGlobal('GM_addValueChangeListener', (_key: string, next: GmListener) => {
            listener = next;
            return 1;
        });
        vi.stubGlobal('GM_removeValueChangeListener', vi.fn());
        let delayNextEpochRead = false;
        let releaseRead!: () => void;
        vi.stubGlobal('GM_getValue', vi.fn(async (key: string, fallback: unknown) => {
            if (delayNextEpochRead) {
                delayNextEpochRead = false;
                await new Promise<void>(resolve => { releaseRead = resolve; });
            }
            return values.has(key) ? values.get(key) : fallback;
        }));
        const received: JPDBCard[] = [];
        const unsubscribe = subscribeToCardStateSignals(signalCard => { received.push(signalCard); });

        emitStoredSignal(values, listener as GmListener, signalValue('warmup'), true);
        await vi.waitFor(() => expect(received).toHaveLength(1));
        received.length = 0;

        delayNextEpochRead = true;
        emitStoredSignal(values, listener as GmListener, signalValue('older', { spelling: '古い' }), true);
        await vi.waitFor(() => expect(releaseRead).toBeTypeOf('function'));
        releaseRead();
        await vi.waitFor(() => expect(received.map(item => item.spelling)).toEqual(['古い']));
        emitStoredSignal(values, listener as GmListener, signalValue('newer', { spelling: '新しい' }), true);

        await vi.waitFor(() => expect(received).toHaveLength(2));
        expect(received.map(item => item.spelling)).toEqual(['古い', '新しい']);
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

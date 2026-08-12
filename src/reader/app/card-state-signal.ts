// Cross-tab card-state mutation bus (Jiten Reader parity): grading, mining,
// or changing a card's deck state in ANY Yomu surface — the new tab or a page
// popover — broadcasts the refreshed card so every other tab recolors its
// rendered occurrences immediately, without a rescan or refresh.
//
// Transports mirror the factory-reset signal: GM value-change listeners cover
// cross-origin tabs (the userscript manager shares GM storage), and a
// BroadcastChannel is restricted to Yomu-owned Study documents. On arbitrary
// reader pages the host shares the same origin and could otherwise read or
// forge every spelling, deck and review-schedule payload.
import { gmPrivateStorageSet, subscribeToStoredValueChanges } from './storage';
import { Logger } from './logger';
import type { CardState, JPDBCard } from './types';
import { currentAccountDataSurfaceIsTrusted } from './account-data-surface';

const log = Logger.scope('CardStateSignal');
const CARD_STATE_SIGNAL_KEY = 'yomu:private:card-state-signal:v1';
const CARD_STATE_CHANNEL_NAME = 'yomu:card-state';
const SEEN_SIGNAL_LIMIT = 32;

export interface CardStateSignalCard {
    vid: number;
    sid: number;
    rid: number;
    spelling: string;
    reading: string;
    language?: JPDBCard['language'];
    cardState: CardState[];
    pitchAccent: string[];
    source: JPDBCard['source'];
    reviewSource?: JPDBCard['reviewSource'];
    dueAt?: number | null;
    lastReviewAt?: number | null;
    deckNames?: string[];
    ankiDeckNames?: string[];
    jpdbDeckMembership?: string;
    sourceDeckName?: string;
}

interface CardStateSignal {
    id: string;
    at: number;
    card: CardStateSignalCard;
}

export function cardStateSignalCard(card: JPDBCard): CardStateSignalCard {
    return {
        vid: card.vid,
        sid: card.sid,
        rid: card.rid,
        spelling: card.spelling,
        reading: card.reading,
        language: card.language,
        cardState: [...card.cardState],
        pitchAccent: [...card.pitchAccent],
        source: card.source,
        reviewSource: card.reviewSource,
        dueAt: card.dueAt,
        lastReviewAt: card.lastReviewAt,
        deckNames: card.deckNames ? [...card.deckNames] : undefined,
        ankiDeckNames: card.ankiDeckNames ? [...card.ankiDeckNames] : undefined,
        jpdbDeckMembership: card.jpdbDeckMembership,
        sourceDeckName: card.sourceDeckName,
    };
}

function cardFromCardStateSignal(card: CardStateSignalCard): JPDBCard {
    return {
        ...card,
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        wordWithReading: null,
    };
}

export function publishCardStateSignal(card: JPDBCard): void {
    const signal: CardStateSignal = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
        at: Date.now(),
        card: cardStateSignalCard(card),
    };
    void gmPrivateStorageSet(CARD_STATE_SIGNAL_KEY, signal).catch(error => {
        log.debug('GM card-state publish failed', error);
    });
    publishBroadcastCardStateSignal(signal);
}

function publishBroadcastCardStateSignal(signal: CardStateSignal): void {
    if (!currentAccountDataSurfaceIsTrusted() || typeof BroadcastChannel !== 'function') return;
    try {
        const channel = new BroadcastChannel(CARD_STATE_CHANNEL_NAME);
        channel.postMessage(signal);
        channel.close();
    } catch (error) {
        log.debug('Broadcast card-state publish failed', error);
    }
}

export function subscribeToCardStateSignals(onCard: (card: JPDBCard) => void): () => void {
    const cleanups: Array<() => void> = [];
    const seenIds: string[] = [];
    const handle = (value: unknown): void => {
        const signal = parseCardStateSignal(value);
        if (!signal || seenIds.includes(signal.id)) return;
        seenIds.push(signal.id);
        if (seenIds.length > SEEN_SIGNAL_LIMIT) seenIds.shift();
        onCard(cardFromCardStateSignal(signal.card));
    };

    cleanups.push(subscribeToStoredValueChanges(CARD_STATE_SIGNAL_KEY, (newValue, source) => {
        if (source.transport === 'web-storage') return;
        // Same-tab mutations are applied locally by the action paths; only
        // remote tabs need the signal.
        if (source.remote) handle(newValue);
    }));

    if (currentAccountDataSurfaceIsTrusted() && typeof BroadcastChannel === 'function') {
        try {
            const channel = new BroadcastChannel(CARD_STATE_CHANNEL_NAME);
            channel.onmessage = event => handle(event.data);
            cleanups.push(() => channel.close());
        } catch (error) {
            log.debug('Broadcast card-state listener failed', error);
        }
    }

    return () => cleanups.forEach(cleanup => cleanup());
}

function parseCardStateSignal(value: unknown): CardStateSignal | null {
    if (!value || typeof value !== 'object') return null;
    const signal = value as Partial<CardStateSignal>;
    const card = signal.card as Partial<CardStateSignalCard> | undefined;
    if (typeof signal.id !== 'string' || !card || typeof card.spelling !== 'string' || !card.spelling) return null;
    if (!Array.isArray(card.cardState)) return null;
    return {
        id: signal.id,
        at: Number(signal.at) || Date.now(),
        card: {
            vid: Number(card.vid) || 0,
            sid: Number(card.sid) || 0,
            rid: Number(card.rid) || 0,
            spelling: card.spelling,
            reading: typeof card.reading === 'string' ? card.reading : '',
            language: typeof card.language === 'string' ? card.language : undefined,
            cardState: card.cardState as CardState[],
            pitchAccent: Array.isArray(card.pitchAccent) ? card.pitchAccent as string[] : [],
            source: (card.source ?? 'jpdb') as JPDBCard['source'],
            reviewSource: typeof card.reviewSource === 'string' ? card.reviewSource as JPDBCard['reviewSource'] : undefined,
            dueAt: card.dueAt === null || typeof card.dueAt === 'number' ? card.dueAt : undefined,
            lastReviewAt: card.lastReviewAt === null || typeof card.lastReviewAt === 'number' ? card.lastReviewAt : undefined,
            deckNames: Array.isArray(card.deckNames) ? card.deckNames as string[] : undefined,
            ankiDeckNames: Array.isArray(card.ankiDeckNames) ? card.ankiDeckNames as string[] : undefined,
            jpdbDeckMembership: typeof card.jpdbDeckMembership === 'string' ? card.jpdbDeckMembership : undefined,
            sourceDeckName: typeof card.sourceDeckName === 'string' ? card.sourceDeckName : undefined,
        },
    };
}

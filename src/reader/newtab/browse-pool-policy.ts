import type { JPDBCard } from '../app/types';
import type { NewTabProviderContexts } from './provider-context-policy';
import { jitenScopedDeckId } from './provider-context-policy';

export interface ScopedBrowsePoolSelection {
    readonly kind: 'jiten-deck' | 'jiten-provider' | 'jpdb';
    readonly key: string;
    readonly deckId: number | null;
    readonly deck: string;
}

export interface ScopedBrowsePoolLoaders {
    jitenDeck(deckId: number): Promise<JPDBCard[]>;
    jitenProvider(): Promise<JPDBCard[]>;
    jpdb(deck: string): Promise<JPDBCard[]>;
}

export interface BrowsePoolLoad {
    readonly generation: number;
    readonly key: string;
    readonly promise: Promise<JPDBCard[]>;
}

const SCOPED_BROWSE_LOADERS: Record<ScopedBrowsePoolSelection['kind'], (selection: ScopedBrowsePoolSelection, loaders: ScopedBrowsePoolLoaders) => Promise<JPDBCard[]>> = {
    'jiten-deck': (selection, loaders) => loaders.jitenDeck(selection.deckId as number),
    'jiten-provider': (_selection, loaders) => loaders.jitenProvider(),
    jpdb: (selection, loaders) => loaders.jpdb(selection.deck),
};

export function loadSelectedBrowsePool(selection: ScopedBrowsePoolSelection, loaders: ScopedBrowsePoolLoaders): Promise<JPDBCard[]> {
    return SCOPED_BROWSE_LOADERS[selection.kind](selection, loaders);
}

export function providerContextDeckResets(previous: NewTabProviderContexts, next: NewTabProviderContexts): { jpdbDeck?: 'all'; ankiDeck?: 'all' } {
    return {
        ...jpdbProviderDeckReset(previous, next),
        ...ankiProviderDeckReset(previous, next),
    };
}

function jpdbProviderDeckReset(previous: NewTabProviderContexts, next: NewTabProviderContexts): { jpdbDeck?: 'all' } {
    return previous.jpdb === next.jpdb && previous.jiten === next.jiten ? {} : { jpdbDeck: 'all' };
}

function ankiProviderDeckReset(previous: NewTabProviderContexts, next: NewTabProviderContexts): { ankiDeck?: 'all' } {
    return previous.anki === next.anki ? {} : { ankiDeck: 'all' };
}

export function selectedScopedBrowsePool(route: string, deck: string, canBrowseJpdb: boolean): ScopedBrowsePoolSelection | null {
    if (route !== 'search') return null;
    return [
        jitenDeckBrowsePool(deck),
        jitenProviderBrowsePool(deck),
        jpdbProviderBrowsePool(deck, canBrowseJpdb),
        jpdbDeckBrowsePool(deck, canBrowseJpdb),
    ].find((selection): selection is ScopedBrowsePoolSelection => selection !== null) ?? null;
}

function jitenDeckBrowsePool(deck: string): ScopedBrowsePoolSelection | null {
    const deckId = jitenScopedDeckId(deck);
    return deckId === null ? null : { kind: 'jiten-deck', key: `jiten-deck:${deckId}`, deckId, deck: '' };
}

function jitenProviderBrowsePool(deck: string): ScopedBrowsePoolSelection | null {
    return deck === 'provider:jiten' ? { kind: 'jiten-provider', key: deck, deckId: null, deck: '' } : null;
}

function jpdbProviderBrowsePool(deck: string, enabled: boolean): ScopedBrowsePoolSelection | null {
    return enabled && deck === 'provider:jpdb'
        ? { kind: 'jpdb', key: deck, deckId: null, deck: 'all' }
        : null;
}

const NON_JPDB_DECK_SCOPES = new Set(['', 'all', 'provider:jiten', 'provider:jpdb']);

function jpdbDeckBrowsePool(deck: string, enabled: boolean): ScopedBrowsePoolSelection | null {
    return enabled && !NON_JPDB_DECK_SCOPES.has(deck)
        ? { kind: 'jpdb', key: `jpdb-deck:${deck}`, deckId: null, deck }
        : null;
}

export function matchingBrowsePoolLoad(pending: BrowsePoolLoad | undefined, key: string, generation: number): BrowsePoolLoad | undefined {
    return pending?.generation === generation && pending.key === key ? pending : undefined;
}

export function cachedBrowsePool(cards: JPDBCard[] | undefined, currentKey: string, key: string): JPDBCard[] | undefined {
    return currentKey === key ? cards : undefined;
}

export function reportBrowsePool(cards: JPDBCard[], onPartial?: (cards: JPDBCard[]) => void): JPDBCard[] {
    onPartial?.(cards);
    return cards;
}

export function isCurrentBrowsePool(generation: number, currentGeneration: number, key: string, currentKey: string): boolean {
    return generation === currentGeneration && key === currentKey;
}

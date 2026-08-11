import { gmStorageGet, gmStorageSet } from '../app/storage';
import type { JPDBCard, ReaderSettings } from '../app/types';
import { BoundedMap } from '../core/bounded-map';
import type { YomitanDictionaryStore, YomitanTermEntry } from '../dictionaries/yomitan';
import type { JpdbPublicPitchClient } from '../jpdb/jpdb-public-pitch';
import { usesJapaneseProviders } from '../languages/character-lookup';
import { localPitchPatternsFromMetaLookup } from '../lookup/pitch-meta';
import type { ReaderParser } from '../lookup/parser';
import { NEW_TAB_CACHE_KEY } from './cache';
import {
    newTabCardMatchesActiveTarget,
    newTabCardReading,
    normalizeNewTabCard,
} from './study-queue';
import {
    captureActiveTarget,
    isCurrentActiveTarget,
    type ActiveTargetSnapshot,
} from './target-scope';
import {
    newTabCardProviderContext,
    type NewTabProviderContexts,
} from './provider-context-policy';

const WORD_PITCH_CACHE_LIMIT = 320;
const WORD_PITCH_LOCAL_GRACE_MS = 120;
const WORD_PITCH_LOCAL_TIMEOUT_MS = 2_500;

interface PortableCardIdentity {
    readonly spelling: string;
    readonly reading?: string;
}

interface TargetResourceDependencies {
    readonly getSettings: () => ReaderSettings;
    readonly providerContexts: () => NewTabProviderContexts;
    readonly parser: Pick<ReaderParser, 'fallbackCardFromText' | 'localCardFromEntry'>;
    readonly dictionaries: Pick<YomitanDictionaryStore, 'lookup' | 'lookupTermMeta'>;
    readonly jpdbPublicPitch?: Pick<JpdbPublicPitchClient, 'lookup'>;
    readonly localSearchWithTimeout: <T>(promise: Promise<T>, fallback: T) => Promise<T>;
}

interface StoredOfflineCards {
    cards?: JPDBCard[];
    sourceLabel?: string;
    targetLanguage?: string;
    cardProviderContexts?: string[];
}

export interface TargetOfflineCards {
    readonly cards: JPDBCard[];
    readonly sourceLabel: string;
}

/** Target-bound caches and local lookups shared by New Tab study flows. */
export class NewTabTargetResources {
    private readonly wordPitch = new BoundedMap<string, Promise<string[]>>(WORD_PITCH_CACHE_LIMIT);

    constructor(private readonly dependencies: TargetResourceDependencies) {}

    clear(): void {
        this.wordPitch.clear();
    }

    async lookupPortableCard(
        identity: PortableCardIdentity,
        lookup: ((term: string, reading?: string) => Promise<JPDBCard | null | undefined>) | undefined,
        onLookupError: (error: unknown) => void,
        target: ActiveTargetSnapshot = captureActiveTarget(),
    ): Promise<JPDBCard | null> {
        const lookedUp = await lookup?.(identity.spelling, identity.reading).catch(error => {
            if (!isCurrentActiveTarget(target)) throw error;
            onLookupError(error);
            return null;
        });
        if (!isCurrentActiveTarget(target)) return null;
        return lookedUp ?? this.dependencies.parser.fallbackCardFromText(identity.spelling, target.target);
    }

    loadLocalEntries(card: JPDBCard): Promise<YomitanTermEntry[]> {
        const settings = this.dependencies.getSettings();
        const lookup = this.dependencies.dictionaries.lookup;
        if (!settings.localDictionariesEnabled || typeof lookup !== 'function') return Promise.resolve([]);
        return this.dependencies.localSearchWithTimeout(lookup.call(this.dependencies.dictionaries,
            card.spelling,
            newTabCardReading(card),
            settings.localDictionaryMaxResults,
            settings.dictionaryPreferences,
        ), [] as YomitanTermEntry[]);
    }

    async loadDictionaryCards(
        limit: number,
        hasLocalDictionaries: () => Promise<boolean>,
        loadEntries: (settings: ReaderSettings, limit: number) => Promise<YomitanTermEntry[]>,
    ): Promise<JPDBCard[]> {
        const settings = this.dependencies.getSettings();
        const target = captureActiveTarget();
        if (!settings.localDictionariesEnabled || !await hasLocalDictionaries()) return [];
        const entries = await loadEntries(settings, Math.max(1, Math.floor(limit)));
        return isCurrentActiveTarget(target)
            ? entries.map(entry => this.dependencies.parser.localCardFromEntry(entry, target.target))
            : [];
    }

    async writeOffline(cards: JPDBCard[], sourceLabel: string): Promise<void> {
        const settings = this.dependencies.getSettings();
        const limit = enabledOfflineCardLimit(settings);
        if (!limit) return;
        const storedCards = cards.slice(0, limit);
        const providerContexts = this.dependencies.providerContexts();
        await gmStorageSet(NEW_TAB_CACHE_KEY, {
            at: Date.now(),
            targetLanguage: captureActiveTarget().target.language,
            cardProviderContexts: storedCards.map(card => newTabCardProviderContext(providerContexts, card)),
            sourceLabel,
            cards: storedCards,
        }).catch(() => undefined);
    }

    async readOffline(): Promise<TargetOfflineCards> {
        const settings = this.dependencies.getSettings();
        if (!settings.newTabOfflineEnabled) return { cards: [], sourceLabel: '' };
        const target = captureActiveTarget();
        const cached = await gmStorageGet<StoredOfflineCards | null>(NEW_TAB_CACHE_KEY, null).catch(() => null);
        if (!offlineCardsMatchTarget(cached, target)) return { cards: [], sourceLabel: '' };
        const cards = offlineCardsForProvider(cached, this.dependencies.providerContexts());
        return availableOfflineCards(cards, cached, settings.newTabOfflineLimit);
    }

    loadWordPitch(card: JPDBCard): Promise<string[]> {
        if (!usesJapaneseProviders()) return Promise.resolve([]);
        const key = this.wordPitchKey(card);
        const cached = this.wordPitch.get(key);
        if (cached) return cached;
        const promise = this.fetchWordPitch(card).catch(() => []);
        this.wordPitch.set(key, promise);
        return promise;
    }

    private async fetchWordPitch(card: JPDBCard): Promise<string[]> {
        if (!usesJapaneseProviders()) return [];
        const localPitch = this.fetchLocalWordPitch(card);
        const quickLocalPitch = await Promise.race([
            localPitch,
            delayWithValue('', WORD_PITCH_LOCAL_GRACE_MS),
        ]);
        if (!usesJapaneseProviders()) return [];
        if (quickLocalPitch) return [quickLocalPitch];
        const pitch = await firstNonEmptyPitch([
            this.fetchPublicWordPitch(card),
            Promise.race([
                localPitch,
                delayWithValue('', WORD_PITCH_LOCAL_TIMEOUT_MS),
            ]).then(value => value ? [value] : []),
        ]);
        return usesJapaneseProviders() ? pitch : [];
    }

    private async fetchPublicWordPitch(card: JPDBCard): Promise<string[]> {
        // Keyless public-pitch source: available to Jiten-only and no-key users too,
        // so study/search cards still get a pitch graph without a JPDB API key.
        if (!usesJapaneseProviders()) return [];
        const pitch = await (this.dependencies.jpdbPublicPitch
            ?.lookup(card.spelling, newTabCardReading(card)).catch(() => []) ?? Promise.resolve([]));
        return usesJapaneseProviders() ? pitch : [];
    }

    private async fetchLocalWordPitch(card: JPDBCard): Promise<string> {
        const settings = this.dependencies.getSettings();
        if (!settings.localDictionariesEnabled) return '';
        const lookupTermMeta = this.dependencies.dictionaries.lookupTermMeta;
        if (typeof lookupTermMeta !== 'function') return '';
        const metaEntries = await lookupTermMeta.call(
            this.dependencies.dictionaries,
            card.spelling,
            12,
            settings.dictionaryPreferences,
        ).catch(() => []);
        const patterns = await localPitchPatternsFromMetaLookup(
            card.spelling,
            newTabCardReading(card),
            expression => lookupTermMeta.call(this.dependencies.dictionaries, expression, 12, settings.dictionaryPreferences),
            { initialEntries: metaEntries },
        ).catch(() => [] as string[]);
        return patterns[0] ?? '';
    }

    wordPitchKey(card: JPDBCard): string {
        const settings = this.dependencies.getSettings();
        return JSON.stringify({
            spelling: card.spelling,
            reading: newTabCardReading(card),
            local: settings.localDictionariesEnabled,
            dictionaries: settings.dictionaryPreferences.map(({ name, enabled, priority }) => ({ name, enabled, priority })),
        });
    }
}

function offlineCardsMatchTarget(cached: StoredOfflineCards | null, target: ActiveTargetSnapshot): cached is StoredOfflineCards {
    return cached !== null
        && isCurrentActiveTarget(target)
        && (cached.targetLanguage ?? 'ja') === target.target.language;
}

function offlineCardsForProvider(cached: StoredOfflineCards, providerContexts: NewTabProviderContexts): JPDBCard[] {
    const cards = Array.isArray(cached.cards) ? cached.cards : [];
    return cards.filter((card, index) => offlineCardMatchesProvider(
        card,
        cached.cardProviderContexts?.[index],
        providerContexts,
    ));
}

function offlineCardMatchesProvider(card: JPDBCard, storedContext: string | undefined, providerContexts: NewTabProviderContexts): boolean {
    const currentContext = newTabCardProviderContext(providerContexts, card);
    return !currentContext || storedContext === currentContext;
}

function availableOfflineCards(cards: JPDBCard[], cached: StoredOfflineCards, configuredLimit: number): TargetOfflineCards {
    if (!cards.length) return { cards: [], sourceLabel: '' };
    return {
        cards: cards
            .filter(newTabCardMatchesActiveTarget)
            .map(normalizeNewTabCard)
            .slice(0, Math.max(0, configuredLimit || 0)),
        sourceLabel: cached.sourceLabel ?? '',
    };
}

function enabledOfflineCardLimit(settings: ReaderSettings): number {
    if (!settings.newTabOfflineEnabled) return 0;
    return Math.max(0, settings.newTabOfflineLimit || 0);
}

function firstNonEmptyPitch(promises: Promise<string[]>[]): Promise<string[]> {
    return new Promise(resolve => {
        let pending = promises.length;
        let settled = false;
        const finishEmpty = (): void => {
            pending -= 1;
            if (!settled && pending <= 0) {
                settled = true;
                resolve([]);
            }
        };
        promises.forEach(promise => {
            promise.then(pitch => {
                if (settled) return;
                if (pitch.length) {
                    settled = true;
                    resolve(pitch);
                } else finishEmpty();
            }).catch(() => finishEmpty());
        });
    });
}

function delayWithValue<T>(value: T, ms: number): Promise<T> {
    return new Promise(resolve => window.setTimeout(() => resolve(value), ms));
}

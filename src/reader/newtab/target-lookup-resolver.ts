import { cardKey } from '../cards/utils';
import type { JPDBCard, ReaderSettings } from '../app/types';
import type { JitenApiClient } from '../dictionaries/jiten';
import type { JitenPublicVocabularyClient } from '../dictionaries/jiten-public-vocabulary';
import type { YomitanDictionaryStore } from '../dictionaries/yomitan';
import type { JpdbVocabularyClient } from '../jpdb/jpdb-vocabulary';
import { usesJapaneseProviders } from '../languages/character-lookup';
import { jpdbFirstParseOptions, type ReaderParser } from '../lookup/parser';
import { publicLookupFallbackCards } from '../lookup/public-fallback-cards';
import { pickTokenForSelection } from '../popup/render';
import type { LookupTargetSnapshot, NewTabLookupTargetScope } from './target-scope';

interface NewTabTargetLookupDependencies {
    readonly getSettings: () => ReaderSettings;
    readonly getDictionaries: () => Pick<YomitanDictionaryStore, 'lookup'>;
    readonly getParser: () => Pick<ReaderParser, 'fallbackCardFromText' | 'localCardFromEntry' | 'parse'>;
    readonly getJpdbVocabulary: () => Pick<JpdbVocabularyClient, 'search'>;
    readonly getJiten: () => Pick<JitenApiClient, 'parse'>;
    readonly getJitenPublicVocabulary: () => Pick<JitenPublicVocabularyClient, 'lookupMany'>;
    readonly isJitenApiActive: () => boolean;
    readonly publicFallbackConcurrency: number;
    readonly warnPublicSearch: (term: string, error: unknown) => void;
    readonly targetScope: NewTabLookupTargetScope;
}

/** Resolves cards while enforcing one target epoch across every provider hop. */
export class NewTabTargetLookupResolver {
    constructor(private readonly dependencies: NewTabTargetLookupDependencies) {}

    async lookup(term: string, reading: string, target: LookupTargetSnapshot): Promise<JPDBCard> {
        const localEntry = await this.localEntry(term, reading);
        this.requireCurrent(target);
        if (localEntry) return this.dependencies.getParser().localCardFromEntry(localEntry, target.target);

        const allowJapaneseProviders = usesJapaneseProviders();
        const allowJpdbPublicLookup = allowJapaneseProviders && this.dependencies.getSettings().jpdbDefinitionsEnabled;
        const publicCard = allowJpdbPublicLookup ? await this.publicCard(term, true) : undefined;
        this.requireCurrent(target);
        if (publicCard) return publicCard;

        const fallbackCard = this.dependencies.getParser().fallbackCardFromText(term, target.target);
        const fallbackPublicCard = allowJapaneseProviders
            ? await this.publicFallbackCard(fallbackCard, allowJpdbPublicLookup ? {} : { jpdbPublicLookup: false })
            : undefined;
        this.requireCurrent(target);
        if (fallbackPublicCard) return fallbackPublicCard;

        const parsed = await this.dependencies.getParser().parse(
            [term],
            allowJapaneseProviders
                ? jpdbFirstParseOptions()
                : { skipApi: true, allowSegmentedFallback: true },
        ).catch(() => [[]]);
        this.requireCurrent(target);
        return pickTokenForSelection(parsed[0] ?? [], term)?.card ?? fallbackCard;
    }

    async publicCard(term: string, exact = false): Promise<JPDBCard | undefined> {
        if (!usesJapaneseProviders() || !this.dependencies.getSettings().jpdbDefinitionsEnabled) return undefined;
        const cards = await this.dependencies.getJpdbVocabulary().search(term, 1).catch(() => []);
        if (!usesJapaneseProviders()) return undefined;
        return cards.find(card => card.spelling === term) ?? (exact ? undefined : cards[0]);
    }

    async publicFallbackCards(
        cards: readonly JPDBCard[],
        options: { jpdbPublicLookup?: boolean } = {},
    ): Promise<Map<string, JPDBCard>> {
        const target = this.dependencies.targetScope.capture();
        const current = () => this.dependencies.targetScope.isCurrent(target) && usesJapaneseProviders();
        const settings = this.dependencies.getSettings();
        if (!current() || (!settings.jpdbDefinitionsEnabled && !settings.showPitchAccent)) return new Map();
        const resolved = await publicLookupFallbackCards(cards, {
            jitenApiActive: () => current() && this.dependencies.isJitenApiActive(),
            parse: terms => current() ? this.dependencies.getJiten().parse(terms) : Promise.resolve(terms.map(() => [])),
            lookupMany: terms => current() ? this.dependencies.getJitenPublicVocabulary().lookupMany(terms) : Promise.resolve(new Map()),
            publicSpellingCard: async term => {
                if (!current()) return undefined;
                const found = await this.dependencies.getJpdbVocabulary().search(term, 1).catch(error => {
                    this.dependencies.warnPublicSearch(term, error);
                    return [];
                });
                return current()
                    ? found.find(candidate => candidate.spelling === term)
                    : undefined;
            },
        }, {
            concurrency: this.dependencies.publicFallbackConcurrency,
            jpdbPublicLookup: options.jpdbPublicLookup,
        });
        return current() ? resolved : new Map();
    }

    private publicFallbackCard(card: JPDBCard, options: { jpdbPublicLookup?: boolean }): Promise<JPDBCard | undefined> {
        return this.publicFallbackCards([card], options).then(cards => cards.get(cardKey(card)));
    }

    private async localEntry(term: string, reading: string) {
        const settings = this.dependencies.getSettings();
        if (!settings.localDictionariesEnabled) return undefined;
        const dictionaries = this.dependencies.getDictionaries();
        const entries = await dictionaries.lookup(
            term,
            reading || term,
            settings.localDictionaryMaxResults,
            settings.dictionaryPreferences,
        ).catch(() => []);
        return entries[0];
    }

    private requireCurrent(target: LookupTargetSnapshot): void {
        if (!this.dependencies.targetScope.isCurrent(target)) throw new Error('Lookup target changed.');
    }
}

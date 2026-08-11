import type { JitenApiClient } from '../dictionaries/jiten';
import {
    JITEN_BACKGROUND_DETAIL_TIMEOUT_MS,
    type JitenPublicVocabularyClient,
} from '../dictionaries/jiten-public-vocabulary';
import type { JpdbVocabularyClient } from '../jpdb/jpdb-vocabulary';
import { usesJapaneseProviders } from '../languages/character-lookup';
import {
    activeLearningTarget,
    activeLearningTargetGeneration,
} from '../languages/target-runtime';
import type { LearningTargetModule } from '../languages/types';
import { targetLanguageOf } from '../languages/selection';
import {
    batchJitenFallbackCards,
    normalizedJitenLookupKey,
    publicLookupFallbackCards as lookupPublicFallbackCards,
} from '../lookup/public-fallback-cards';
import { fallbackLookupTermsForCard, type ReaderParser } from '../lookup/parser';
import { isMissingProxyTransportError } from '../network/proxy-fetch';
import { effectiveJpdbApiKey } from '../settings/api-credential';
import {
    createTextLookupDisplayContext,
    showTextLookupResult,
    textLookupCardOptions,
    textLookupParseOptions,
    type TextLookupDisplayState,
    type TextLookupResultCallbacks,
} from '../main/text-lookup';
import {
    BACKGROUND_PITCH_ENRICHMENT_CONCURRENCY,
    FALLBACK_LOOKUP_INITIAL_WAIT_MS,
    PUBLIC_FALLBACK_SPELLING_SEARCH_LIMIT,
    type CardDisplayOptions,
    type PitchEnrichmentOptions,
    type TextLookupDisplayContext,
    type TextLookupOptions,
    type TokenListOptions,
} from './main-helpers';
import {
    canSearchPublicLookupCard,
    publicJitenDetailLimit,
    publicLookupCardFromResults,
    publicLookupCardRequest,
    publicLookupSearchLimit,
} from './main-lookup-helpers';
import { userFacingErrorText } from './user-facing-errors';
import type { JPDBCard, JPDBToken, ReaderSettings } from './types';
import type { YomitanTermEntry } from '../dictionaries/yomitan';
import { cardKey } from '../cards/utils';
import { wait } from './dom-helpers';

type PublicLookupOptions = Pick<PitchEnrichmentOptions, 'publicLookupTermLimit' | 'jpdbPublicLookup'>;

interface LookupLog {
    time(label: string, ...details: unknown[]): () => void;
    warn(message: string, ...details: unknown[]): void;
}

export interface CardLookupTargetSnapshot {
    readonly target: LearningTargetModule;
    isCurrent(): boolean;
}

interface ReaderCardLookupDependencies {
    getSettings(): ReaderSettings;
    parser(): Pick<ReaderParser, 'parse' | 'isJpdbBackedCard' | 'cacheCards' | 'localCardFromEntry' | 'fallbackCardFromText'>;
    jpdbVocabulary(): Pick<JpdbVocabularyClient, 'search'>;
    jiten(): Pick<JitenApiClient, 'parse'>;
    jitenPublicVocabulary(): Pick<JitenPublicVocabularyClient, 'lookupMany' | 'hydrateCards'>;
    isJitenApiActive(): boolean;
    lookupLocalEntries(selected: string): Promise<YomitanTermEntry[]>;
    textLookupDisplayState(): TextLookupDisplayState;
    showCard(card: JPDBCard, sentence?: string, anchor?: HTMLElement, options?: CardDisplayOptions): void;
    showTokenList(tokens: JPDBToken[], selected: string, anchor?: HTMLElement, options?: TokenListOptions): void;
    toast(message: string): void;
    onTargetChange(): void;
    log: LookupLog;
}

/**
 * Owns one reader lookup session's target identity and provider boundary.
 *
 * UI mounting stays in ReaderApp; this module owns the asynchronous policy so
 * every provider result and fallback is checked against the target that
 * started it before it can reach that UI.
 */
export class ReaderCardLookupSession {
    private version = 0;
    private language: string;
    private runtimeGeneration = activeLearningTargetGeneration();

    constructor(private readonly dependencies: ReaderCardLookupDependencies) {
        this.language = targetLanguageOf(dependencies.getSettings());
    }

    captureTarget(): CardLookupTargetSnapshot {
        const version = this.version;
        const language = this.language;
        const generation = activeLearningTargetGeneration();
        const target = activeLearningTarget();
        return {
            target,
            isCurrent: () => version === this.version
                && language === this.language
                && generation === activeLearningTargetGeneration()
                && target === activeLearningTarget(),
        };
    }

    syncTarget(settings: ReaderSettings): void {
        const language = targetLanguageOf(settings);
        const runtimeGeneration = activeLearningTargetGeneration();
        if (language === this.language && runtimeGeneration === this.runtimeGeneration) return;
        this.language = language;
        this.runtimeGeneration = runtimeGeneration;
        this.version += 1;
        this.dependencies.onTargetChange();
    }

    async lookupText(
        text: string,
        sentence = text,
        options: TextLookupOptions = {},
        scope = this.captureTarget(),
    ): Promise<void> {
        if (!scope.isCurrent()) return;
        const context = createTextLookupDisplayContext(text, options, this.dependencies.textLookupDisplayState());
        if (!context) return;
        const done = this.dependencies.log.time('lookupText', { length: context.selected.length, trigger: context.trigger });
        try {
            const [tokens] = await this.dependencies.parser().parse([sentence], this.textLookupParseOptions());
            if (!scope.isCurrent()) return;
            await showTextLookupResult(context, tokens, sentence, this.textLookupResultCallbacks(scope));
        } catch (error) {
            if (!scope.isCurrent()) return;
            this.dependencies.log.warn('Lookup fallback', { selected: context.selected }, error);
            await this.showLocalOrFallbackLookupCard(context, sentence, scope, error);
        } finally {
            done();
        }
    }

    async resolveLookupCard(card: JPDBCard, scope = this.captureTarget()): Promise<JPDBCard> {
        if (!scope.isCurrent() || !usesJapaneseProviders()) return card;
        const contextual = card.source === 'jpdb' && Boolean(card.sourceCardKey);
        if (card.source !== 'fallback' && !contextual) return card;
        const publicCard = card.source === 'fallback'
            ? await this.lookupFallbackApiCard(card, {}, scope)
            : await this.publicLookupCard(card.spelling, true, contextual ? card.reading : '');
        if (!publicCard || !scope.isCurrent() || !usesJapaneseProviders()) return card;
        this.dependencies.parser().cacheCards([publicCard]);
        return publicCard;
    }

    async resolveLookupCardForInitialRender(card: JPDBCard, scope = this.captureTarget()): Promise<JPDBCard> {
        if (!scope.isCurrent() || !usesJapaneseProviders()) return card;
        if (card.source !== 'fallback' && !(card.source === 'jpdb' && card.sourceCardKey)) return card;
        const resolved = this.resolveLookupCard(card, scope);
        void resolved.catch(() => undefined);
        return Promise.race([
            resolved,
            wait(FALLBACK_LOOKUP_INITIAL_WAIT_MS).then(() => card),
        ]);
    }

    async publicLookupCard(
        term: string,
        exact = false,
        readingOrOptions: string | { allowCandidateLookup?: boolean } = '',
        maybeOptions: { allowCandidateLookup?: boolean } = {},
    ): Promise<JPDBCard | undefined> {
        const scope = this.captureTarget();
        if (!scope.isCurrent() || !usesJapaneseProviders()) return undefined;
        const request = publicLookupCardRequest(readingOrOptions, maybeOptions);
        if (!canSearchPublicLookupCard(this.dependencies.getSettings(), request.options)) return undefined;
        const cards = await this.dependencies.jpdbVocabulary().search(term, publicLookupSearchLimit(request.reading)).catch(error => {
            this.dependencies.log.warn('Public JPDB lookup failed', { term }, error);
            return [];
        });
        return scope.isCurrent() && usesJapaneseProviders()
            ? publicLookupCardFromResults(cards, term, exact, request.reading)
            : undefined;
    }

    async publicLookupFallbackCards(
        cards: readonly JPDBCard[],
        options: PublicLookupOptions = {},
        scope = this.captureTarget(),
    ): Promise<Map<string, JPDBCard>> {
        if (!scope.isCurrent() || !usesJapaneseProviders()) return new Map<string, JPDBCard>();
        if (!canSearchPublicLookupCard(this.dependencies.getSettings(), {})) return new Map<string, JPDBCard>();
        // Keyed users resolve EVERY fallback term through one batched
        // reader/parse (full vocabulary in a single request, metered per-user) —
        // this replaces the per-word /info fan-out that hammered the server.
        // Keyless keeps the public lookup (capped + cached) so it can no longer
        // fan out into the hundreds-of-requests storm.
        const resolved = await lookupPublicFallbackCards(cards, {
            jitenApiActive: () => scope.isCurrent() && this.dependencies.isJitenApiActive(),
            parse: terms => scope.isCurrent()
                ? this.dependencies.jiten().parse(terms)
                : Promise.resolve(terms.map(() => [])),
            lookupMany: (terms, lookupOptions) => scope.isCurrent()
                ? this.dependencies.jitenPublicVocabulary().lookupMany(
                    terms,
                    { ...lookupOptions, detailTimeoutMs: JITEN_BACKGROUND_DETAIL_TIMEOUT_MS },
                )
                : Promise.resolve(new Map()),
            publicSpellingCard: term => scope.isCurrent()
                ? this.publicLookupSpellingCard(term)
                : Promise.resolve(undefined),
        }, {
            concurrency: BACKGROUND_PITCH_ENRICHMENT_CONCURRENCY,
            termLimit: options.publicLookupTermLimit,
            jpdbPublicLookup: options.jpdbPublicLookup,
            detailLimit: publicJitenDetailLimit,
        });
        return scope.isCurrent() && usesJapaneseProviders() ? resolved : new Map<string, JPDBCard>();
    }

    async publicLookupHydratableJitenCards(
        cards: readonly JPDBCard[],
        scope = this.captureTarget(),
    ): Promise<Map<string, JPDBCard>> {
        if (!scope.isCurrent() || !usesJapaneseProviders() || !cards.length) return new Map<string, JPDBCard>();
        const resolved = await this.dependencies.jitenPublicVocabulary()
            .hydrateCards(cards, { detailLimit: publicJitenDetailLimit(cards.length) })
            .catch(error => {
                this.dependencies.log.warn('Jiten parsed-card hydration failed', { cards: cards.length }, error);
                return new Map<string, JPDBCard>();
            });
        return scope.isCurrent() && usesJapaneseProviders() ? resolved : new Map<string, JPDBCard>();
    }

    async lookupFallbackApiCard(
        card: JPDBCard,
        options: PublicLookupOptions = {},
        scope = this.captureTarget(),
    ): Promise<JPDBCard | undefined> {
        if (!scope.isCurrent() || !usesJapaneseProviders()) return undefined;
        if (!this.dependencies.isJitenApiActive()) return this.publicLookupFallbackCard(card, options, scope);
        try {
            const resolved = await this.jitenLookupFallbackCard(card, scope);
            return scope.isCurrent() ? resolved : undefined;
        } catch (error) {
            // Keyed Jiten transport is dead (hosted page: no GM bridge, no
            // configured proxy) — degrade to the keyless public lookup.
            if (!isMissingProxyTransportError(error)) throw error;
            if (!scope.isCurrent()) return undefined;
            return this.publicLookupFallbackCard(card, options, scope);
        }
    }

    private textLookupParseOptions() {
        return textLookupParseOptions(effectiveJpdbApiKey(this.dependencies.getSettings()));
    }

    private textLookupResultCallbacks(scope: CardLookupTargetSnapshot): TextLookupResultCallbacks {
        return {
            isJpdbBackedCard: card => this.dependencies.parser().isJpdbBackedCard(card),
            parseJapanese: (paragraphs, options) => scope.isCurrent()
                ? this.dependencies.parser().parse(paragraphs, options)
                : Promise.resolve(paragraphs.map(() => [])),
            showCard: (card, sentence, anchor, options) => {
                if (scope.isCurrent()) this.dependencies.showCard(card, sentence, anchor, options);
            },
            showLocalOrFallbackLookupCard: (context, sentence, error) => this.showLocalOrFallbackLookupCard(
                context,
                sentence,
                scope,
                error,
            ),
            showTokenList: (tokens, selected, anchor, options) => {
                if (scope.isCurrent()) this.dependencies.showTokenList(tokens, selected, anchor, options);
            },
            textLookupParseOptions: () => this.textLookupParseOptions(),
        };
    }

    private async publicLookupSpellingCard(term: string): Promise<JPDBCard | undefined> {
        if (!canSearchPublicLookupCard(this.dependencies.getSettings(), {})) return undefined;
        const cards = await this.dependencies.jpdbVocabulary().search(term, PUBLIC_FALLBACK_SPELLING_SEARCH_LIMIT).catch(error => {
            this.dependencies.log.warn('Public JPDB fallback search failed', { term }, error);
            return [];
        });
        return cards.find(card => card.spelling === term);
    }

    async publicLookupFallbackCard(
        card: JPDBCard,
        options: PublicLookupOptions = {},
        scope = this.captureTarget(),
    ): Promise<JPDBCard | undefined> {
        return (await this.publicLookupFallbackCards([card], options, scope)).get(cardKey(card));
    }

    async jitenLookupFallbackCard(
        card: JPDBCard,
        scope = this.captureTarget(),
    ): Promise<JPDBCard | undefined> {
        if (!scope.isCurrent() || !usesJapaneseProviders()) return undefined;
        const terms = fallbackLookupTermsForCard(card);
        const cards = await batchJitenFallbackCards(terms, parseTerms => this.dependencies.jiten().parse(parseTerms));
        if (!scope.isCurrent()) return undefined;
        for (const term of terms) {
            const candidate = cards.get(normalizedJitenLookupKey(term));
            if (candidate) return candidate;
        }
        return undefined;
    }

    async showLocalLookupCard(
        context: TextLookupDisplayContext,
        sentence: string,
        scope: CardLookupTargetSnapshot,
    ): Promise<boolean> {
        const entries = await this.dependencies.lookupLocalEntries(context.selected);
        if (!scope.isCurrent() || !entries.length) return false;
        this.dependencies.showCard(
            this.dependencies.parser().localCardFromEntry(entries[0], scope.target),
            sentence,
            context.anchor,
            textLookupCardOptions(context),
        );
        return true;
    }

    private async showLocalOrFallbackLookupCard(
        context: TextLookupDisplayContext,
        sentence: string,
        scope: CardLookupTargetSnapshot,
        error?: unknown,
    ): Promise<void> {
        if (!scope.isCurrent()) return;
        if (await this.showLocalLookupCard(context, sentence, scope)) return;
        if (!scope.isCurrent()) return;
        if (error) {
            this.dependencies.toast(userFacingErrorText(
                this.dependencies.getSettings().interfaceLanguage,
                'jpdbLookupFailed',
                error,
            ));
        }
        this.dependencies.showCard(
            this.dependencies.parser().fallbackCardFromText(context.selected, scope.target),
            sentence,
            context.anchor,
            textLookupCardOptions(context),
        );
    }
}

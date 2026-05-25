import { AudioPlayer } from './audio';
import { cardKey } from './card-utils';
import { escapeHtml, renderHighlightedTextHtml, renderTokensToHtml, setInnerHtml } from './dom';
import {
    IMMERSION_FALLBACK_QUERY_LIMIT,
    immersionFallbackFragments,
    immersionSentenceContainsQuery,
    isUsefulImmersionFallbackQuery,
    normalizeImmersionSearchQuery,
    queryHasKanji,
    queryKey,
    queryLength,
    shouldRequireOriginalSurfaceMatch,
    uniqueImmersionQueries,
} from './immersion-query';
import { ImmersionKitClient, isImmersionKitRateLimitError, type ImmersionKitExample, type ImmersionKitSearchOptions } from './immersion-kit';
import { localizedImmersionProviderLabel, localizedImmersionSourceTitle } from './immersion-labels';
import { uiText } from './i18n';
import { Logger } from './logger';
import { canAttemptAudiblePlayback } from './media-activation';
import {
    immersionContextFromElement,
    immersionContextFromExample,
    inferMiningSourceKind,
    loadMiningContext,
    normalizeMiningSentence,
    pageMiningContext,
    saveMiningContext,
    type MiningContext,
    type MiningContextDraft,
    type StoredMiningContext,
} from './mining-context';
import { speakerIcon } from './popup-render';
import type { JPDBCard, JPDBToken, ReaderSettings } from './types';

const IMMERSION_SEARCH_CACHE_TTL_MS = 30_000;
const IMMERSION_SEARCH_CACHE_LIMIT = 120;
const IMMERSION_POPUP_EXAMPLE_LIMIT = 6;
const IMMERSION_POPUP_SEARCH_REQUEST_LIMIT = 48;
const IMMERSION_HOVER_AUDIO_KEY_LIMIT = 240;
const IMMERSION_CONTEXT_CACHE_LIMIT = 160;
const IMMERSION_FALLBACK_SEARCH_CONCURRENCY = 2;
const IMMERSION_PARSED_SENTENCE_CACHE_LIMIT = 160;
const log = Logger.scope('ImmersionPopover');

interface ExampleAudioSource {
    urls: string[];
    key: string;
}

export interface ImmersionKitSearchResult {
    examples: ImmersionKitExample[];
    query: string;
    usedFallback: boolean;
    triedQueries: string[];
}

export interface ImmersionSearchOptions {
    relatedQueries?: string[];
    signal?: AbortSignal;
}

interface ImmersionParseOptions {
    jpdbTimeoutMs?: number;
    allowJpdbTimeoutFallback?: boolean;
}

interface ImmersionPopoverControllerOptions {
    getSettings: () => ReaderSettings;
    client: ImmersionKitClient;
    audio: AudioPlayer;
    parseJapanese: (paragraphs: string[], options?: ImmersionParseOptions) => Promise<JPDBToken[][]>;
    canParseJapanese: () => boolean;
    parsePopoverJapanese: (popover: HTMLElement) => void | Promise<void>;
    enrichPitchWords: (tokens: JPDBToken[]) => void | Promise<void>;
    enrichAnkiWords: (tokens: JPDBToken[]) => void | Promise<void>;
    repositionPopover: () => void;
    setImmersionTranslationBlurred: (blurred: boolean) => void;
    toast: (message: string) => void;
}

interface HeldExampleImage {
    src: string;
    minHeight: number;
    holdUntilReady: boolean;
}

export class ImmersionPopoverController {
    private audioElement?: HTMLAudioElement;
    private audioKey = '';
    private audioLoadingKey = '';
    private audioRequestId = 0;
    private hoverAudioPlayedKeys = new Set<string>();
    private activeMiningContext?: MiningContext;
    private contextByCardKey = new Map<string, StoredMiningContext>();
    private searchResultCache = new Map<string, { expiresAt: number; promise: Promise<ImmersionKitSearchResult> }>();
    private parsedSentenceCache = new Map<string, Promise<JPDBToken[]>>();
    private loadAbortControllers = new WeakMap<HTMLElement, AbortController>();

    constructor(private options: ImmersionPopoverControllerOptions) {}

    abortPendingRequests(popover: HTMLElement): void {
        const controller = this.loadAbortControllers.get(popover);
        if (!controller) return;
        controller.abort();
        this.loadAbortControllers.delete(popover);
    }

    hasActiveContext(card: JPDBCard, sentence?: string): boolean {
        return this.activeMiningContext?.term === card.spelling
            && this.activeMiningContext.sentence === (sentence || '').replace(/\s+/g, ' ').trim();
    }

    activeContextFor(card: JPDBCard): MiningContext | undefined {
        return this.activeMiningContext?.term === card.spelling ? this.activeMiningContext : undefined;
    }

    storedContextFor(card: JPDBCard): StoredMiningContext | null {
        return this.contextByCardKey.get(cardKey(card)) ?? loadMiningContext(card.spelling);
    }

    rememberPageMiningContext(card: JPDBCard, sentence?: string, anchor?: HTMLElement): void {
        const cleanSentence = normalizeMiningSentence(sentence);
        if (!isPageMiningSentence(cleanSentence, card)) return;
        this.rememberStoredMiningContext(saveMiningContext(card.spelling, this.pageMiningContextDraft(cleanSentence, anchor)));
    }

    rememberTermMiningContext(term: string, sentence?: string, anchor?: HTMLElement): void {
        const cleanTerm = term.trim();
        const cleanSentence = normalizeMiningSentence(sentence);
        if (!cleanTerm || !isPageMiningSentence(cleanSentence, { spelling: cleanTerm } as JPDBCard)) return;
        this.rememberStoredMiningContext(saveMiningContext(cleanTerm, this.pageMiningContextDraft(cleanSentence, anchor)));
    }

    private pageMiningContextDraft(sentence: string, anchor?: HTMLElement): MiningContextDraft {
        const immersionCard = anchor?.closest<HTMLElement>('.jpdb-reader-example-card') ?? null;
        if (immersionCard) return immersionContextFromElement(sentence, immersionCard);
        const sourceKind = pageMiningSourceKind(anchor);
        return pageMiningContext(sentence, sourceKind);
    }

    private rememberStoredMiningContext(stored: StoredMiningContext | null): void {
        if (!stored) return;
        this.activeMiningContext = stored;
    }

    async loadExamples(
        popover: HTMLElement,
        card: JPDBCard,
        options: ImmersionSearchOptions = {},
    ): Promise<void> {
        const container = popover.querySelector<HTMLElement>('[data-immersion-kit]');
        if (!container) return;

        this.abortPendingRequests(popover);
        const controller = new AbortController();
        this.loadAbortControllers.set(popover, controller);
        const searchPromise = this.searchExamples(card, { ...options, signal: controller.signal });

        try {
            const result = await raceAgainstAbort(searchPromise, controller.signal);
            if (controller.signal.aborted || !isConnectedImmersionSurface(popover, container)) return;
            this.renderLoadedExamples(container, card, result);
        } catch (error) {
            if (isAbortError(error) && controller.signal.aborted) return;
            log.warn('Immersion Kit examples failed', { term: card.spelling }, error);
            this.renderEmptyIfConnected(popover, container);
        } finally {
            if (this.loadAbortControllers.get(popover) === controller) this.loadAbortControllers.delete(popover);
        }
    }

    installLazyLoad(
        popover: HTMLElement,
        card: JPDBCard,
        options: ImmersionSearchOptions = {},
    ): void {
        const container = popover.querySelector<HTMLDetailsElement>('[data-immersion-kit]');
        if (!container || container.dataset.immersionLazyBound === 'true') return;
        container.dataset.immersionLazyBound = 'true';

        const load = (): void => {
            if (!isConnectedImmersionSurface(popover, container)) return;
            if (container instanceof HTMLDetailsElement && !container.open) return;
            if (container.dataset.immersionLoadState) return;
            container.dataset.immersionLoadState = 'loading';
            void this.loadExamples(popover, card, options).finally(() => {
                if (container.dataset.immersionLoadState === 'loading') {
                    container.dataset.immersionLoadState = 'loaded';
                }
            });
        };

        container.addEventListener('toggle', load);
        load();
    }

    private renderLoadedExamples(container: HTMLElement, card: JPDBCard, result: ImmersionKitSearchResult): void {
        const { examples } = result;
        if (!examples.length) {
            this.renderEmpty(container);
            return;
        }
        this.bindExampleCarousel(container, card, result);
    }

    private bindExampleCarousel(container: HTMLElement, card: JPDBCard, result: ImmersionKitSearchResult): void {
        const { examples } = result;
        let index = this.startIndex(card, examples);
        let renderRequest = 0;
        let hoverAudioCanPlay = false;
        let hoverAudioActive = false;
        requestAnimationFrame(() => {
            hoverAudioCanPlay = !container.matches(':hover');
        });
        const render = (nextIndex: number, playAudio: boolean, promoteMiningContext = false) => {
            const requestId = ++renderRequest;
            index = (nextIndex + examples.length) % examples.length;
            this.renderExample(container, card, examples, index, playAudio, result.query, () => requestId === renderRequest, promoteMiningContext);
            bindHoverMedia();
        };
        container.addEventListener('click', event => {
            const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-immersion-action]');
            const media = (event.target as HTMLElement).closest<HTMLElement>('.jpdb-reader-example-media');
            const translation = (event.target as HTMLElement).closest<HTMLElement>('.jpdb-reader-example-translation');
            if (translation) {
                event.preventDefault();
                event.stopPropagation();
                this.toggleTranslationBlur(container);
                return;
            }
            if (!button && (!media || !this.options.getSettings().immersionKitPlayOnImageClick)) return;
            event.preventDefault();
            event.stopPropagation();
            if (!button) {
                void this.playExampleAudio(examples[index]);
                return;
            }
            const action = button.dataset.immersionAction;
            if (action === 'previous') render(index - 1, this.shouldAutoPlayCarouselAudio(), true);
            if (action === 'next') render(index + 1, true, true);
            if (action === 'audio') void this.playExampleAudio(examples[index]);
        });
        container.addEventListener('keydown', event => {
            if (event.key !== 'Enter' && event.key !== ' ') return;
            const translation = (event.target as HTMLElement).closest<HTMLElement>('.jpdb-reader-example-translation');
            if (!translation) return;
            event.preventDefault();
            this.toggleTranslationBlur(container);
        });
        const handleImmersionHover = (event: MouseEvent | PointerEvent) => {
            const media = (event.target as HTMLElement).closest?.('.jpdb-reader-example-media');
            if (!media || !this.options.getSettings().immersionKitPlayOnHover) return;
            const pointerType = 'pointerType' in event ? event.pointerType : 'mouse';
            const cannotHover = pointerType !== 'mouse' && (window.matchMedia?.('(hover: none)').matches ?? false);
            if (pointerType === 'touch' || cannotHover) return;
            if (media.contains(event.relatedTarget as Node | null)) return;
            if (!hoverAudioCanPlay) return;
            if (!canAttemptAudiblePlayback()) return;
            const audioKey = hoverAudioExampleKey(examples[index]);
            if (this.hoverAudioPlayedKeys.has(audioKey)) return;
            this.hoverAudioPlayedKeys.add(audioKey);
            pruneOldestSetEntries(this.hoverAudioPlayedKeys, IMMERSION_HOVER_AUDIO_KEY_LIMIT);
            hoverAudioCanPlay = false;
            hoverAudioActive = true;
            void this.playExampleAudio(examples[index], true, () => hoverAudioActive && container.isConnected && media.isConnected && media.matches(':hover'));
        };
        const bindHoverMedia = () => {
            container.querySelectorAll<HTMLElement>('.jpdb-reader-example-media').forEach(media => {
                if (media.dataset.immersionHoverBound === 'true') return;
                media.dataset.immersionHoverBound = 'true';
                media.addEventListener('pointerover', handleImmersionHover);
                media.addEventListener('mouseover', handleImmersionHover);
            });
        };
        container.addEventListener('pointerleave', () => {
            hoverAudioCanPlay = true;
            hoverAudioActive = false;
        });
        container.addEventListener('mouseleave', () => {
            hoverAudioCanPlay = true;
            hoverAudioActive = false;
        });
        render(index, false);
    }

    private shouldAutoPlayCarouselAudio(): boolean {
        const settings = this.options.getSettings();
        return settings.immersionKitEnabled
            && settings.immersionKitAutoPlayAudio
            && canAttemptAudiblePlayback(true);
    }

    private renderEmptyIfConnected(popover: HTMLElement, container: HTMLElement): void {
        if (!isConnectedImmersionSurface(popover, container)) return;
        this.renderEmpty(container);
    }

    async searchExamples(card: JPDBCard, options: ImmersionSearchOptions = {}): Promise<ImmersionKitSearchResult> {
        const key = this.searchCacheKey(card, options);
        const now = Date.now();
        const cached = this.searchResultCache.get(key);
        if (cached && cached.expiresAt > now) return cached.promise;

        const promise = this.fetchExamples(card, { ...options, signal: undefined }).catch(error => {
            if (this.searchResultCache.get(key)?.promise === promise) this.searchResultCache.delete(key);
            throw error;
        });
        this.searchResultCache.set(key, { expiresAt: now + IMMERSION_SEARCH_CACHE_TTL_MS, promise });
        pruneImmersionSearchCache(this.searchResultCache, now, IMMERSION_SEARCH_CACHE_LIMIT);
        return promise;
    }

    stopAudio(): void {
        this.audioRequestId++;
        this.clearAudio();
    }

    private async fetchExamples(card: JPDBCard, options: ImmersionSearchOptions): Promise<ImmersionKitSearchResult> {
        const exactQuery = normalizeImmersionSearchQuery(card.spelling);
        const triedQueries: string[] = [];
        const exactResult = await this.fetchExamplesForQuery(exactQuery, exactQuery, triedQueries, options.signal);
        if (exactResult) return exactResult;

        const queries = await this.immersionFallbackSearchQueries(card, options, exactQuery);
        const fallbackResult = await this.fetchFirstFallbackExamples(queries, exactQuery, triedQueries, options.signal);
        if (fallbackResult) return fallbackResult;

        return { examples: [], query: exactQuery, usedFallback: false, triedQueries };
    }

    private fetchFirstFallbackExamples(
        queries: string[],
        exactQuery: string,
        triedQueries: string[],
        signal?: AbortSignal,
    ): Promise<ImmersionKitSearchResult | null> {
        if (!queries.length) return Promise.resolve(null);
        const concurrency = Math.min(IMMERSION_FALLBACK_SEARCH_CONCURRENCY, queries.length);
        let nextIndex = 0;
        let active = 0;
        let settled = false;

        return new Promise((resolve, reject) => {
            const cleanupAbortListener = (): void => {
                signal?.removeEventListener('abort', handleAbort);
            };
            const fail = (error: unknown): void => {
                if (settled) return;
                settled = true;
                cleanupAbortListener();
                reject(error);
            };
            const finish = (result: ImmersionKitSearchResult | null): void => {
                if (settled) return;
                settled = true;
                cleanupAbortListener();
                resolve(result);
            };
            const handleAbort = (): void => fail(abortErrorForRace());
            if (signal?.aborted) {
                handleAbort();
                return;
            }
            signal?.addEventListener('abort', handleAbort, { once: true });
            const launch = (): void => {
                if (signal?.aborted) {
                    handleAbort();
                    return;
                }
                while (!settled && active < concurrency && nextIndex < queries.length) {
                    const query = queries[nextIndex++];
                    active++;
                    void this.fetchExamplesForQuery(query, exactQuery, triedQueries, signal)
                        .then(result => {
                            active--;
                            if (result) {
                                finish(result);
                                return;
                            }
                            if (nextIndex >= queries.length && active === 0) finish(null);
                            else launch();
                        })
                        .catch(error => {
                            active--;
                            if (signal?.aborted) {
                                handleAbort();
                                return;
                            }
                            if (isAbortError(error)) {
                                fail(error);
                                return;
                            }
                            if (nextIndex >= queries.length && active === 0) finish(null);
                            else launch();
                        });
                }
            };
            launch();
        });
    }

    private async immersionFallbackSearchQueries(card: JPDBCard, options: ImmersionSearchOptions, exactQuery: string): Promise<string[]> {
        const relatedQueries = uniqueImmersionQueries(options.relatedQueries ?? [])
            .map(normalizeImmersionSearchQuery)
            .filter(query => isUsefulImmersionFallbackQuery(query, exactQuery));
        const fallbackQueries = await this.fallbackQueries(card, exactQuery);
        return uniqueImmersionQueries([...relatedQueries, ...fallbackQueries])
            .slice(0, IMMERSION_FALLBACK_QUERY_LIMIT);
    }

    private async fetchExamplesForQuery(
        query: string,
        exactQuery: string,
        triedQueries: string[],
        signal?: AbortSignal,
    ): Promise<ImmersionKitSearchResult | null> {
        if (!query) return null;
        if (signal?.aborted) throw abortErrorForRace();
        triedQueries.push(query);
        try {
            const settings = this.options.getSettings();
            const searchOptions = this.popupSearchOptions(settings, signal);
            const examples = await this.options.client.search(query, settings, searchOptions);
            return immersionSearchResultForQuery(query, exactQuery, triedQueries, examples);
        } catch (error) {
            if (isAbortError(error) || isImmersionKitRateLimitError(error)) throw error;
            return null;
        }
    }

    private popupSearchOptions(settings: ReaderSettings, signal?: AbortSignal): ImmersionKitSearchOptions {
        const resultLimit = settings.immersionKitLimitEnabled
            ? Math.min(settings.immersionKitLimit, IMMERSION_POPUP_EXAMPLE_LIMIT)
            : IMMERSION_POPUP_EXAMPLE_LIMIT;
        return {
            requestLimit: Math.max(IMMERSION_POPUP_SEARCH_REQUEST_LIMIT, resultLimit),
            resultLimit,
            fastFirst: true,
            ...(signal ? { signal } : {}),
        };
    }

    private searchCacheKey(card: JPDBCard, options: ImmersionSearchOptions): string {
        const settings = this.options.getSettings();
        return JSON.stringify({
            spelling: card.spelling,
            reading: card.reading,
            enabled: settings.immersionKitEnabled,
            source: settings.immersionKitExampleSource,
            nadeshikoKey: Boolean(settings.nadeshikoApiKey.trim()),
            limit: settings.immersionKitLimit,
            limitEnabled: settings.immersionKitLimitEnabled,
            min: settings.immersionKitMinLength,
            max: settings.immersionKitMaxLength,
            category: settings.immersionKitCategory,
            sort: settings.immersionKitSort,
            exact: settings.immersionKitExactMatch,
            parse: this.options.canParseJapanese(),
            relatedQueries: uniqueImmersionQueries(options.relatedQueries ?? []).map(normalizeImmersionSearchQuery),
        });
    }

    private async fallbackQueries(card: JPDBCard, exactQuery: string): Promise<string[]> {
        const candidates: string[] = [];
        addImmersionFallbackQuery(candidates, card.reading !== card.spelling ? card.reading : '', exactQuery);
        await this.addParsedFallbackQueries(candidates, card, exactQuery);
        addImmersionFallbackQueries(candidates, immersionFallbackFragments(card.spelling), exactQuery);
        return uniqueImmersionQueries(candidates).slice(0, IMMERSION_FALLBACK_QUERY_LIMIT);
    }

    private async addParsedFallbackQueries(candidates: string[], card: JPDBCard, exactQuery: string): Promise<void> {
        if (!this.options.canParseJapanese()) return;
        const tokens = await this.fallbackParseTokens(card);
        addImmersionFallbackQueries(candidates, fallbackTokenQueries(card, tokens), exactQuery);
    }

    private async fallbackParseTokens(card: JPDBCard): Promise<JPDBToken[]> {
        const [tokens] = await this.options.parseJapanese([card.spelling], { jpdbTimeoutMs: 1_200, allowJpdbTimeoutFallback: true }).catch(() => {
            return [[]] as JPDBToken[][];
        });
        return tokens ?? [];
    }

    private renderEmpty(container: HTMLElement): void {
        const settings = this.options.getSettings();
        container.removeAttribute('open');
        container.dataset.immersionEmpty = 'true';
        setInnerHtml(container, `
            <summary class="jpdb-reader-local-title">
                <span>${uiText(settings.interfaceLanguage, 'immersionKit')}</span>
                <span class="jpdb-reader-source-status">${uiText(settings.interfaceLanguage, 'noImmersionExamplesCompact')}</span>
            </summary>
        `);
        this.options.repositionPopover();
    }

    private startIndex(card: JPDBCard, examples: ImmersionKitExample[]): number {
        const context = this.miningContextForStartIndex(card);
        if (!context || context.sourceKind !== 'immersion-kit') return 0;

        const sentenceIndex = examples.findIndex(example => example.sentence === context.sentence);
        if (sentenceIndex >= 0) return sentenceIndex;

        return validImmersionExampleIndex(Number(context.immersionIndex), examples.length);
    }

    private miningContextForStartIndex(card: JPDBCard): MiningContext | null {
        return this.activeMiningContext?.term === card.spelling
            ? this.activeMiningContext
            : this.contextByCardKey.get(cardKey(card)) ?? loadMiningContext(card.spelling);
    }

    private renderExample(
        container: HTMLElement,
        card: JPDBCard,
        examples: ImmersionKitExample[],
        index: number,
        playAudio: boolean,
        searchQuery: string,
        isCurrent: () => boolean = () => true,
        promoteMiningContext = false,
    ): void {
        const example = examples[index];
        const settings = this.options.getSettings();
        const imageUrls = settings.immersionKitShowImages ? this.mediaUrls(example, 'image') : [];
        const audioUrls = this.mediaUrls(example, 'sound');
        const hasAudio = audioUrls.length > 0;
        const imageUrl = imageUrls[0] ?? '';
        const contextImageUrl = immersionMiningImageUrl(imageUrls);

        this.rememberExampleMiningContext(card, example, index, examples.length, contextImageUrl, audioUrls, promoteMiningContext);
        delete container.dataset.immersionEmpty;
        setInnerHtml(container, this.renderExampleHtml(container, card, example, examples.length, index, searchQuery, settings, imageUrl, contextImageUrl, audioUrls, hasAudio));
        this.loadRenderedExampleImages(container, imageUrls, isCurrent);
        this.options.repositionPopover();
        if (playAudio) void this.playExampleAudio(example, true);
        this.parseRenderedExampleSentence(container, card, example, searchQuery, isCurrent);
    }

    private rememberExampleMiningContext(
        card: JPDBCard,
        example: ImmersionKitExample,
        index: number,
        total: number,
        imageUrl: string,
        audioUrls: string[],
        promoteMiningContext: boolean,
    ): void {
        const storedContext = saveMiningContext(card.spelling, immersionContextFromExample(card.spelling, example, index, total, imageUrl, audioUrls));
        if (storedContext) {
            this.contextByCardKey.set(cardKey(card), storedContext);
            pruneOldestMapEntries(this.contextByCardKey, IMMERSION_CONTEXT_CACHE_LIMIT);
            this.promoteExampleMiningContext(card, storedContext, promoteMiningContext);
        }
    }

    private promoteExampleMiningContext(card: JPDBCard, storedContext: StoredMiningContext, promoteMiningContext: boolean): void {
        if (shouldPromoteExampleMiningContext(this.activeMiningContext, card, promoteMiningContext)) this.activeMiningContext = storedContext;
    }

    private renderExampleHtml(
        container: HTMLElement,
        card: JPDBCard,
        example: ImmersionKitExample,
        total: number,
        index: number,
        searchQuery: string,
        settings: ReaderSettings,
        imageUrl: string,
        contextImageUrl: string,
        audioUrls: string[],
        hasAudio: boolean,
    ): string {
        const language = settings.interfaceLanguage;
        const sentenceHtml = renderHighlightedTextHtml(example.sentence, [card.spelling, card.reading, searchQuery], 'jpdb-reader-example-target');
        const translation = renderExampleTranslation(example.translation, settings);
        const sourceLabel = immersionExampleSourceLabel(card, example, searchQuery, language);
        const sentence = renderExampleSentenceHtml(sentenceHtml);
        const image = renderExampleImageHtml(container, imageUrl, sentence);
        return `
            <summary class="jpdb-reader-local-title jpdb-reader-example-summary">
                <span class="jpdb-reader-example-source">${escapeHtml(immersionExampleProviderLabel(example, language))}</span>
            </summary>
            <div class="jpdb-reader-example-toolbar">
                <div class="jpdb-reader-example-meta jpdb-reader-example-meta-compact">
                    <span class="jpdb-reader-example-title">${escapeHtml(sourceLabel)}</span>
                    <span class="jpdb-reader-example-count">${index + 1}/${total}</span>
                </div>
                ${renderExampleActionsHtml(hasAudio, language)}
            </div>
            <div class="jpdb-reader-example-card ${image ? 'has-image' : ''}" data-immersion-index="${index}" data-immersion-total="${total}" data-immersion-sentence="${escapeHtml(example.sentence)}" data-immersion-source-title="${escapeHtml(example.sourceTitle)}" data-immersion-image-url="${escapeHtml(contextImageUrl)}" data-immersion-audio-urls="${escapeHtml(JSON.stringify(audioUrls))}">
                <div class="jpdb-reader-example-body">
                    ${image}
                    ${image ? '' : sentence}
                    ${translation}
                </div>
            </div>
        `;
    }

    private loadRenderedExampleImages(container: HTMLElement, imageUrls: string[], isCurrent: () => boolean): void {
        container.querySelectorAll<HTMLImageElement>('[data-immersion-image]').forEach(imageElement => {
            let imageCandidateIndex = 0;
            let imageRequestId = 0;
            const holdUntilReady = imageElement.dataset.immersionHoldUntilReady === 'true';
            let pendingImage: HTMLImageElement | null = null;
            const showImageCandidate = (sourceUrl: string, displayUrl: string): void => {
                imageElement.dataset.immersionImageSrc = sourceUrl;
                imageElement.src = displayUrl;
                imageElement.removeAttribute('data-immersion-hold-until-ready');
            };
            const loadNextImageCandidate = (): void => {
                if (!isCurrent() || !imageElement.isConnected) return;
                const fallbackUrl = imageUrls[imageCandidateIndex++];
                if (!fallbackUrl) {
                    if (imageElement.complete && imageElement.naturalWidth > 0) return;
                    this.hideBrokenExampleImage(container, imageElement);
                    return;
                }
                const currentSrc = imageElement.currentSrc || imageElement.src;
                const requestId = ++imageRequestId;
                this.options.client.fetchBlobUrl(fallbackUrl, this.options.getSettings().audioTimeoutMs, this.options.getSettings().corsProxyUrl)
                    .then(displayUrl => {
                        if (requestId !== imageRequestId || !isCurrent() || !imageElement.isConnected) return;
                        if (!holdUntilReady || currentSrc === displayUrl) {
                            showImageCandidate(fallbackUrl, displayUrl);
                            return;
                        }
                        const preload = new Image();
                        pendingImage = preload;
                        preload.decoding = 'async';
                        preload.onload = () => {
                            if (pendingImage !== preload || requestId !== imageRequestId || !isCurrent() || !imageElement.isConnected) return;
                            pendingImage = null;
                            showImageCandidate(fallbackUrl, displayUrl);
                            this.options.repositionPopover();
                        };
                        preload.onerror = () => {
                            if (pendingImage !== preload || requestId !== imageRequestId) return;
                            pendingImage = null;
                            loadNextImageCandidate();
                        };
                        preload.src = displayUrl;
                    })
                    .catch(() => {
                        if (requestId !== imageRequestId) return;
                        loadNextImageCandidate();
                    });
            };
            imageElement.addEventListener('error', loadNextImageCandidate);
            imageElement.addEventListener('load', () => this.options.repositionPopover(), { once: true });
            if (!imageElement.dataset.immersionImageSrc) {
                this.hideBrokenExampleImage(container, imageElement);
                return;
            }
            loadNextImageCandidate();
        });
    }

    private hideBrokenExampleImage(container: HTMLElement, imageElement: HTMLImageElement): void {
        if (!imageElement.isConnected) return;
        const media = imageElement.closest('.jpdb-reader-example-media');
        const sentence = media?.querySelector<HTMLElement>('.jpdb-reader-example-sentence');
        if (sentence) {
            sentence.classList.remove('jpdb-subtitle-primary');
            media?.after(sentence);
        }
        media?.remove();
        if (imageElement.isConnected) imageElement.remove();
        container.querySelector<HTMLElement>('.jpdb-reader-example-card')?.classList.remove('has-image');
        this.options.repositionPopover();
    }

    private parseRenderedExampleSentence(
        container: HTMLElement,
        card: JPDBCard,
        example: ImmersionKitExample,
        searchQuery: string,
        isCurrent: () => boolean,
    ): void {
        void this.parsedExampleSentenceTokens(example.sentence)
            .then(tokens => {
                if (!isCurrent() || !container.isConnected) return;
                const sentence = container.querySelector<HTMLElement>('[data-immersion-sentence-render]');
                if (!sentence) return;
                setInnerHtml(sentence, renderTokensToHtml(example.sentence, tokens, this.options.getSettings()));
                this.highlightTarget(sentence, card, searchQuery);
                void this.options.parsePopoverJapanese(container);
                void this.options.enrichPitchWords(tokens);
                void this.options.enrichAnkiWords(tokens);
                this.options.repositionPopover();
            })
            .catch(() => undefined);
    }

    private parsedExampleSentenceTokens(sentence: string): Promise<JPDBToken[]> {
        const key = sentence.trim();
        if (!key) return Promise.resolve([]);
        const cached = this.parsedSentenceCache.get(key);
        if (cached) return cached;

        const promise = this.options.parseJapanese([sentence], { jpdbTimeoutMs: 1_200, allowJpdbTimeoutFallback: true })
            .then(([tokens]) => tokens ?? [])
            .catch(error => {
                if (this.parsedSentenceCache.get(key) === promise) this.parsedSentenceCache.delete(key);
                throw error;
            });
        this.parsedSentenceCache.set(key, promise);
        pruneOldestMapEntries(this.parsedSentenceCache, IMMERSION_PARSED_SENTENCE_CACHE_LIMIT);
        return promise;
    }

    private highlightTarget(sentence: HTMLElement, card: JPDBCard, searchQuery = ''): void {
        const cardVid = String(card.vid);
        const cardSid = String(card.sid);
        const targets = [card.spelling, card.reading, searchQuery].map(value => value.trim()).filter(Boolean);
        sentence.querySelectorAll<HTMLElement>('.jpdb-reader-word').forEach(word => {
            const surface = word.textContent?.replace(/\s+/g, '') ?? '';
            if ((word.dataset.vid === cardVid && word.dataset.sid === cardSid)
                || targets.some(target => surface.includes(target))) {
                word.classList.add('jpdb-reader-example-target');
            }
        });
    }

    private toggleTranslationBlur(container: HTMLElement): void {
        const settings = this.options.getSettings();
        const shouldBlur = !settings.immersionKitRevealTranslationOnClick;
        this.options.setImmersionTranslationBlurred(shouldBlur);
        container.querySelectorAll<HTMLElement>('.jpdb-reader-example-translation').forEach(translation => {
            setTranslationBlurAttributes(translation, shouldBlur, 'immersionTranslationBlurred', settings.interfaceLanguage);
        });
        this.options.repositionPopover();
    }

    private async playExampleAudio(example: ImmersionKitExample, quiet = false, isCurrent: () => boolean = () => true): Promise<void> {
        const source = this.exampleAudioSource(example, quiet);
        if (!source) return;

        let requestId = 0;
        try {
            requestId = this.startExampleAudioRequest(source.key);
            if (!requestId) return;
            await this.playFetchedExampleAudio(source, requestId, isCurrent);
        } catch (error) {
            this.handleExampleAudioError(example, quiet, requestId, error);
        }
    }

    private async playFetchedExampleAudio(
        source: ExampleAudioSource,
        requestId: number,
        isCurrent: () => boolean,
    ): Promise<void> {
        if (await this.playDirectExampleAudio(source, requestId, isCurrent)) return;
        const src = await this.options.client.fetchBlobUrl(source.urls, this.options.getSettings().audioTimeoutMs, this.options.getSettings().corsProxyUrl);
        if (!this.isExampleAudioRequestCurrent(requestId, source.key, isCurrent)) {
            this.clearAudioRequestIfCurrent(requestId, source.key);
            return;
        }

        const audio = this.attachExampleAudio(src);
        await this.playAttachedExampleAudio(audio, isCurrent);
    }

    private async playDirectExampleAudio(
        source: ExampleAudioSource,
        requestId: number,
        isCurrent: () => boolean,
    ): Promise<boolean> {
        const src = source.urls[0];
        if (!src) return false;
        try {
            const audio = this.attachExampleAudio(src);
            await this.playAttachedExampleAudio(audio, isCurrent);
            return this.isExampleAudioRequestCurrent(requestId, source.key, isCurrent);
        } catch {
            if (this.isExampleAudioRequestCurrent(requestId, source.key, isCurrent)) this.clearAudio();
            return false;
        }
    }

    private async playAttachedExampleAudio(audio: HTMLAudioElement, isCurrent: () => boolean): Promise<void> {
        if (!isCurrent()) {
            this.clearAudio();
            return;
        }
        await audio.play();
        if (!isCurrent()) this.clearAudio();
    }

    private handleExampleAudioError(example: ImmersionKitExample, quiet: boolean, requestId: number, error: unknown): void {
        if (this.shouldClearAudioAfterExampleError(requestId)) this.clearAudio();
        log.warn('Immersion example audio failed', { provider: immersionExampleProviderLabel(example, 'en'), sourceTitle: example.sourceTitle, quiet }, error);
        if (!quiet) this.options.toast(error instanceof Error ? error.message : uiText(this.options.getSettings().interfaceLanguage, 'audioSourceReturnedNoAudio'));
    }

    private shouldClearAudioAfterExampleError(requestId: number): boolean {
        return !requestId || requestId === this.audioRequestId;
    }

    private exampleAudioSource(example: ImmersionKitExample, quiet: boolean): ExampleAudioSource | null {
        const urls = this.mediaUrls(example, 'sound');
        const key = urls[0] ?? '';
        if (key) return { urls, key };
        if (!quiet) this.options.toast(uiText(this.options.getSettings().interfaceLanguage, 'audioSourceReturnedNoAudio'));
        return null;
    }

    private startExampleAudioRequest(key: string): number {
        if (this.isAudioBusy(key)) return 0;
        const requestId = ++this.audioRequestId;
        this.clearAudio();
        this.audioKey = key;
        this.audioLoadingKey = key;
        this.options.audio.stop();
        return requestId;
    }

    private isExampleAudioRequestCurrent(requestId: number, key: string, isCurrent: () => boolean): boolean {
        return requestId === this.audioRequestId && this.audioKey === key && isCurrent();
    }

    private clearAudioRequestIfCurrent(requestId: number, key: string): void {
        if (requestId === this.audioRequestId && this.audioKey === key) this.clearAudio();
    }

    private attachExampleAudio(src: string): HTMLAudioElement {
        const audio = new Audio(src);
        audio.preload = 'auto';
        audio.playbackRate = this.options.getSettings().immersionKitPlaybackRate;
        this.audioElement = audio;
        this.audioLoadingKey = '';
        const cleanup = () => {
            if (this.audioElement !== audio) return;
            this.clearAudio();
        };
        audio.addEventListener('ended', cleanup, { once: true });
        audio.addEventListener('error', cleanup, { once: true });
        return audio;
    }

    private mediaUrls(example: ImmersionKitExample, kind: 'image' | 'sound'): string[] {
        const client = this.options.client as ImmersionKitClient & { mediaUrls?: (example: ImmersionKitExample, kind: 'image' | 'sound') => string[] };
        return client.mediaUrls?.(example, kind) ?? [client.mediaUrl(example, kind)].filter(Boolean);
    }

    private clearAudio(): void {
        this.audioElement?.pause();
        this.audioElement = undefined;
        this.audioKey = '';
        this.audioLoadingKey = '';
    }

    private isAudioBusy(key: string): boolean {
        if (this.audioLoadingKey === key) return true;
        return Boolean(this.audioElement && this.audioKey === key && !this.audioElement.ended);
    }
}

function immersionExampleSourceLabel(card: JPDBCard, example: ImmersionKitExample, searchQuery: string, language: ReaderSettings['interfaceLanguage']): string {
    const sourceTitle = localizedImmersionSourceTitle(example.sourceTitle, language);
    return queryKey(searchQuery) !== queryKey(card.spelling)
        ? `${searchQuery} · ${sourceTitle}`
        : sourceTitle;
}

function immersionExampleProviderLabel(example: ImmersionKitExample, language: ReaderSettings['interfaceLanguage']): string {
    return localizedImmersionProviderLabel(example, language);
}

function accurateImmersionExamples(query: string, examples: ImmersionKitExample[]): ImmersionKitExample[] {
    return shouldFilterImmersionExamplesBySurface(query)
        ? examples.filter(example => immersionSentenceContainsQuery(example.sentence, query))
        : examples;
}

function immersionSearchResultForQuery(
    query: string,
    exactQuery: string,
    triedQueries: string[],
    examples: ImmersionKitExample[],
): ImmersionKitSearchResult | null {
    const accurateExamples = accurateImmersionExamples(query, examples);
    if (!accurateExamples.length) return null;
    return {
        examples: accurateExamples,
        query,
        usedFallback: queryKey(query) !== queryKey(exactQuery),
        triedQueries,
    };
}

function shouldFilterImmersionExamplesBySurface(query: string): boolean {
    return queryHasKanji(query) || shouldRequireOriginalSurfaceMatch(query);
}

function immersionMiningImageUrl(imageUrls: string[]): string {
    return imageUrls.find(url => /\/download_media\?/u.test(url)) ?? imageUrls[0] ?? '';
}

function isPageMiningSentence(sentence: string, card: JPDBCard): boolean {
    return Boolean(sentence && sentence !== card.spelling);
}

function shouldPromoteExampleMiningContext(activeContext: MiningContext | undefined, card: JPDBCard, promoteMiningContext: boolean): boolean {
    return promoteMiningContext || !activeContext || activeContext.term !== card.spelling;
}

function pageMiningSourceKind(anchor?: HTMLElement): ReturnType<typeof inferMiningSourceKind> {
    return inferMiningSourceKind({
        isImageSource: Boolean(anchor?.closest('.jpdb-ocr-line')),
        hasVideo: Boolean(anchor?.closest('.jpdb-subtitle-player, .jpdb-subtitle-list')) || Boolean(document.querySelector('video')),
        hostname: location.hostname,
    });
}

function isConnectedImmersionSurface(popover: HTMLElement, container: HTMLElement): boolean {
    return popover.isConnected && container.isConnected;
}

function isAbortError(error: unknown): boolean {
    return error instanceof Error && error.name === 'AbortError';
}

function raceAgainstAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
    if (signal.aborted) return Promise.reject(abortErrorForRace());
    return new Promise<T>((resolve, reject) => {
        const onAbort = () => reject(abortErrorForRace());
        signal.addEventListener('abort', onAbort, { once: true });
        promise.then(value => {
            signal.removeEventListener('abort', onAbort);
            resolve(value);
        }, error => {
            signal.removeEventListener('abort', onAbort);
            reject(error);
        });
    });
}

function abortErrorForRace(): Error {
    if (typeof DOMException === 'function') return new DOMException('Aborted', 'AbortError');
    const error = new Error('Aborted');
    error.name = 'AbortError';
    return error;
}

function addImmersionFallbackQuery(candidates: string[], value: string, exactQuery: string): void {
    const query = normalizeImmersionSearchQuery(value);
    if (isUsefulImmersionFallbackQuery(query, exactQuery)) candidates.push(query);
}

function addImmersionFallbackQueries(candidates: string[], values: Iterable<string>, exactQuery: string): void {
    for (const value of values) addImmersionFallbackQuery(candidates, value, exactQuery);
}

function fallbackTokenQueries(card: JPDBCard, tokens: JPDBToken[]): string[] {
    return sortedFallbackTokenCandidates(card, tokens).flatMap(item => [
        item.token.card.spelling,
        item.surface,
        item.token.card.reading !== item.token.card.spelling ? item.token.card.reading : '',
    ].filter(Boolean));
}

function sortedFallbackTokenCandidates(card: JPDBCard, tokens: JPDBToken[]): Array<{ token: JPDBToken; surface: string; length: number }> {
    return tokens
        .map(token => ({
            token,
            surface: card.spelling.slice(token.start, token.end),
            length: queryLength(token.card.spelling),
        }))
        .sort(compareFallbackTokenCandidates);
}

function compareFallbackTokenCandidates(
    a: { token: JPDBToken; length: number },
    b: { token: JPDBToken; length: number },
): number {
    return Number(queryHasKanji(b.token.card.spelling)) - Number(queryHasKanji(a.token.card.spelling))
        || b.length - a.length;
}

function validImmersionExampleIndex(index: number, length: number): number {
    return Number.isFinite(index) && index >= 0 && index < length ? index : 0;
}

function renderExampleImageHtml(container: HTMLElement, imageUrl: string, overlay = ''): string {
    if (!imageUrl) return '';
    const heldImage = heldExampleImage(container);
    return `<div class="jpdb-reader-example-media"${heldExampleMediaStyle(heldImage)}><img class="jpdb-reader-example-image" data-immersion-image data-immersion-image-src="${escapeHtml(imageUrl)}"${heldExampleImageAttributes(heldImage)} alt="" loading="eager" decoding="async" referrerpolicy="no-referrer">${overlay}</div>`;
}

function renderExampleSentenceHtml(sentenceHtml: string): string {
    return `<div class="jpdb-reader-example-sentence jpdb-reader-parseable" data-immersion-sentence-render>${sentenceHtml}</div>`;
}

function renderExampleActionsHtml(hasAudio: boolean, language: ReaderSettings['interfaceLanguage']): string {
    return `
        <div class="jpdb-reader-example-actions" role="group" aria-label="${escapeHtml(uiText(language, 'immersionExampleControls'))}">
            <button class="jpdb-reader-icon-mini" type="button" data-immersion-action="previous" title="${escapeHtml(uiText(language, 'previousExample'))}" aria-label="${escapeHtml(uiText(language, 'previousExample'))}">‹</button>
            ${hasAudio ? `<button class="jpdb-reader-icon-mini" type="button" data-immersion-action="audio" title="${escapeHtml(uiText(language, 'playExampleAudio'))}" aria-label="${escapeHtml(uiText(language, 'playExampleAudio'))}">${speakerIcon()}</button>` : ''}
            <button class="jpdb-reader-icon-mini" type="button" data-immersion-action="next" title="${escapeHtml(uiText(language, 'nextExample'))}" aria-label="${escapeHtml(uiText(language, 'nextExample'))}">›</button>
        </div>
    `;
}

function heldExampleMediaStyle(image: HeldExampleImage): string {
    return image.minHeight > 0 ? ` style="min-height:${image.minHeight}px"` : '';
}

function heldExampleImageAttributes(image: HeldExampleImage): string {
    return `${heldExampleHoldAttribute(image)}${heldExampleSourceAttribute(image)}`;
}

function heldExampleHoldAttribute(image: HeldExampleImage): string {
    return image.holdUntilReady ? ' data-immersion-hold-until-ready="true"' : '';
}

function heldExampleSourceAttribute(image: HeldExampleImage): string {
    return image.src ? ` src="${escapeHtml(image.src)}"` : '';
}

function heldExampleImage(container: HTMLElement): HeldExampleImage {
    const currentImage = container.querySelector<HTMLImageElement>('[data-immersion-image]');
    const src = heldExampleImageSource(currentImage);
    const holdUntilReady = Boolean(src && currentImage?.isConnected);
    return {
        src: holdUntilReady ? src : '',
        minHeight: holdUntilReady ? heldExampleImageHeight(currentImage) : 0,
        holdUntilReady,
    };
}

function heldExampleImageSource(image: HTMLImageElement | null): string {
    return image?.currentSrc || image?.src || '';
}

function heldExampleImageHeight(image: HTMLImageElement | null): number {
    const media = image?.closest<HTMLElement>('.jpdb-reader-example-media') ?? null;
    return Math.ceil(media?.getBoundingClientRect().height || image?.getBoundingClientRect().height || 0);
}

function hoverAudioExampleKey(example: ImmersionKitExample | undefined): string {
    if (!example) return '';
    return example.id || `${example.provider ?? 'immersion-kit'}:${example.sourceTitle}:${example.sentence}:${example.soundFile || example.soundUrl}`;
}

function pruneImmersionSearchCache(cache: Map<string, { expiresAt: number; promise: Promise<ImmersionKitSearchResult> }>, now: number, limit: number): void {
    for (const [key, value] of cache) {
        if (value.expiresAt <= now) cache.delete(key);
    }
    pruneOldestMapEntries(cache, limit);
}

function pruneOldestMapEntries<TKey, TValue>(cache: Map<TKey, TValue>, limit: number): void {
    while (cache.size > limit) {
        const oldest = cache.keys().next().value as TKey | undefined;
        if (oldest === undefined) break;
        cache.delete(oldest);
    }
}

function pruneOldestSetEntries<TValue>(cache: Set<TValue>, limit: number): void {
    while (cache.size > limit) {
        const oldest = cache.keys().next().value as TValue | undefined;
        if (oldest === undefined) break;
        cache.delete(oldest);
    }
}

function renderExampleTranslation(translation: string, settings: ReaderSettings): string {
    if (!settings.immersionKitShowTranslation || !translation) return '';
    const escaped = escapeHtml(translation);
    if (!settings.immersionKitRevealTranslationOnClick) {
        return `<div class="jpdb-reader-example-translation">${escaped}</div>`;
    }
    return `<div class="jpdb-reader-example-translation" data-immersion-translation-blurred="true" role="button" tabindex="0" aria-label="${escapeHtml(uiText(settings.interfaceLanguage, 'revealTranslation'))}">${escaped}</div>`;
}

function setTranslationBlurAttributes(element: HTMLElement, blurred: boolean, key: 'immersionTranslationBlurred', language: ReaderSettings['interfaceLanguage']): void {
    if (blurred) {
        element.dataset[key] = 'true';
        element.setAttribute('role', 'button');
        element.setAttribute('tabindex', '0');
        element.setAttribute('aria-label', uiText(language, 'revealTranslation'));
        return;
    }
    delete element.dataset[key];
    element.removeAttribute('tabindex');
    element.removeAttribute('role');
    element.removeAttribute('aria-label');
}

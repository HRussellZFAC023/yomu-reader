import { AudioPlayer } from './audio';
import { cardKey } from './card-utils';
import { escapeHtml, renderHighlightedTextHtml, renderTokensToHtml, setInnerHtml } from './dom';
import {
    IMMERSION_FALLBACK_QUERY_LIMIT,
    immersionFallbackFragments,
    immersionSentenceContainsQuery,
    isUsefulImmersionFallbackQuery,
    isUsefulImmersionPreloadQuery,
    normalizeImmersionSearchQuery,
    queryHasKanji,
    queryKey,
    queryLength,
    shouldRequireOriginalSurfaceMatch,
    uniqueImmersionQueries,
} from './immersion-query';
import { ImmersionKitClient, type ImmersionKitExample } from './immersion-kit';
import { uiText } from './i18n';
import { Logger } from './logger';
import {
    immersionContextFromElement,
    immersionContextFromExample,
    inferMiningSourceKind,
    loadMiningContext,
    normalizeMiningSentence,
    pageMiningContext,
    saveMiningContext,
    type MiningContext,
    type StoredMiningContext,
} from './mining-context';
import { speakerIcon } from './popup-render';
import type { JPDBCard, JPDBToken, ReaderSettings } from './types';

const IMMERSION_SEARCH_CACHE_TTL_MS = 30_000;
const log = Logger.scope('ImmersionPopover');

export interface ImmersionKitSearchResult {
    examples: ImmersionKitExample[];
    query: string;
    usedFallback: boolean;
    triedQueries: string[];
}

export interface ImmersionSearchOptions {
    relatedQueries?: string[];
}

interface ImmersionPopoverControllerOptions {
    getSettings: () => ReaderSettings;
    client: ImmersionKitClient;
    audio: AudioPlayer;
    parseJapanese: (paragraphs: string[]) => Promise<JPDBToken[][]>;
    canParseJapanese: () => boolean;
    parsePopoverJapanese: (popover: HTMLElement) => void | Promise<void>;
    enrichAnkiWords: (tokens: JPDBToken[]) => void | Promise<void>;
    repositionPopover: () => void;
    setImmersionTranslationBlurred: (blurred: boolean) => void;
    toast: (message: string) => void;
}

export class ImmersionPopoverController {
    private audioElement?: HTMLAudioElement;
    private audioBlobUrl?: string;
    private audioKey = '';
    private audioLoadingKey = '';
    private audioRequestId = 0;
    private preloadedTerms = new Set<string>();
    private activeMiningContext?: MiningContext;
    private contextByCardKey = new Map<string, StoredMiningContext>();
    private searchResultCache = new Map<string, { expiresAt: number; promise: Promise<ImmersionKitSearchResult> }>();

    constructor(private options: ImmersionPopoverControllerOptions) {}

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
        if (!cleanSentence || cleanSentence === card.spelling) return;
        const immersionCard = anchor?.closest<HTMLElement>('.jpdb-reader-example-card') ?? null;
        if (immersionCard) {
            const stored = saveMiningContext(card.spelling, immersionContextFromElement(cleanSentence, immersionCard));
            if (stored) {
                this.activeMiningContext = stored;
                log.debug('Mining context captured from Immersion Kit', { term: card.spelling, sourceTitle: stored.sourceTitle });
            }
            return;
        }
        const sourceKind = inferMiningSourceKind({
            isImageSource: Boolean(anchor?.closest('.jpdb-ocr-line')),
            hasVideo: Boolean(anchor?.closest('.jpdb-subtitle-player')) || Boolean(document.querySelector('video')),
            hostname: location.hostname,
        });
        const stored = saveMiningContext(card.spelling, pageMiningContext(cleanSentence, sourceKind));
        if (stored) {
            this.activeMiningContext = stored;
            log.debug('Mining context captured from page', { term: card.spelling, sourceKind });
        }
    }

    async loadExamples(
        popover: HTMLElement,
        card: JPDBCard,
        searchPromise: Promise<ImmersionKitSearchResult> = this.searchExamples(card),
    ): Promise<void> {
        const container = popover.querySelector<HTMLElement>('[data-immersion-kit]');
        if (!container) return;

        try {
            const result = await searchPromise;
            const { examples } = result;
            if (!popover.isConnected || !container.isConnected) return;
            if (!examples.length) {
                log.debug('No Immersion Kit examples found', { term: card.spelling, triedQueries: result.triedQueries });
                this.renderEmpty(container);
                return;
            }
            log.debug('Immersion Kit examples loaded', { term: card.spelling, query: result.query, usedFallback: result.usedFallback, examples: examples.length });

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
                const shouldAutoPlay = this.options.getSettings().immersionKitAutoPlayAudio;
                if (action === 'previous') render(index - 1, shouldAutoPlay, true);
                if (action === 'next') render(index + 1, shouldAutoPlay, true);
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
                if (!hoverAudioCanPlay) {
                    hoverAudioCanPlay = !container.contains(event.relatedTarget as Node | null);
                    if (!hoverAudioCanPlay) return;
                }
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
        } catch (error) {
            log.warn('Immersion Kit examples failed', { term: card.spelling }, error);
            if (!popover.isConnected || !container.isConnected) return;
            this.renderEmpty(container);
        }
    }

    async searchExamples(card: JPDBCard, options: ImmersionSearchOptions = {}): Promise<ImmersionKitSearchResult> {
        const key = this.searchCacheKey(card, options);
        const now = Date.now();
        const cached = this.searchResultCache.get(key);
        if (cached && cached.expiresAt > now) {
            log.debug('Immersion Kit result cache hit', { term: card.spelling });
            return cached.promise;
        }

        const promise = this.fetchExamples(card, options).catch(error => {
            if (this.searchResultCache.get(key)?.promise === promise) this.searchResultCache.delete(key);
            throw error;
        });
        this.searchResultCache.set(key, { expiresAt: now + IMMERSION_SEARCH_CACHE_TTL_MS, promise });
        return promise;
    }

    preloadForTokens(tokens: JPDBToken[]): void {
        const settings = this.options.getSettings();
        if (!settings.immersionKitEnabled) return;
        let queued = 0;
        for (const token of tokens) {
            const term = token.card.spelling.trim();
            if (!isUsefulImmersionPreloadQuery(term) || this.preloadedTerms.has(term)) continue;
            this.preloadedTerms.add(term);
            this.options.client.preload(term, settings);
            queued++;
            if (queued >= 2) break;
        }
        if (queued) log.debugThrottled('immersion-preload', 2500, 'Immersion Kit preloads queued', { queued });
    }

    stopAudio(): void {
        this.audioRequestId++;
        this.clearAudio();
    }

    private async fetchExamples(card: JPDBCard, options: ImmersionSearchOptions): Promise<ImmersionKitSearchResult> {
        const exactQuery = normalizeImmersionSearchQuery(card.spelling);
        const relatedQueries = uniqueImmersionQueries(options.relatedQueries ?? [])
            .map(normalizeImmersionSearchQuery)
            .filter(query => isUsefulImmersionFallbackQuery(query, exactQuery));
        const fallbackQueries = await this.fallbackQueries(card, exactQuery);
        const queries = uniqueImmersionQueries([exactQuery, ...relatedQueries, ...fallbackQueries]).slice(0, 1 + IMMERSION_FALLBACK_QUERY_LIMIT);
        const triedQueries: string[] = [];

        for (const query of queries) {
            if (!query) continue;
            triedQueries.push(query);
            const settings = this.options.getSettings();
            try {
                const examples = await this.options.client.search(query, settings);
                const accurateExamples = (queryHasKanji(query) || shouldRequireOriginalSurfaceMatch(query))
                    ? examples.filter(example => immersionSentenceContainsQuery(example.sentence, query))
                    : examples;
                if (accurateExamples.length) {
                    return {
                        examples: accurateExamples,
                        query,
                        usedFallback: queryKey(query) !== queryKey(exactQuery),
                        triedQueries,
                    };
                }
            } catch (error) {
                log.debug('Immersion query failed, trying next query', {
                    query,
                    exactQuery,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }

        return { examples: [], query: exactQuery, usedFallback: false, triedQueries };
    }

    private searchCacheKey(card: JPDBCard, options: ImmersionSearchOptions): string {
        const settings = this.options.getSettings();
        return JSON.stringify({
            spelling: card.spelling,
            reading: card.reading,
            enabled: settings.immersionKitEnabled,
            limit: settings.immersionKitLimit,
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
        const add = (value: string) => {
            const query = normalizeImmersionSearchQuery(value);
            if (!isUsefulImmersionFallbackQuery(query, exactQuery)) return;
            candidates.push(query);
        };

        if (card.reading !== card.spelling) add(card.reading);

        if (this.options.canParseJapanese()) {
            const [tokens] = await this.options.parseJapanese([card.spelling]).catch(error => {
                log.debug('Immersion fallback parse failed quietly', { term: card.spelling }, error);
                return [[]] as JPDBToken[][];
            });
            const tokenQueries = (tokens ?? [])
                .map(token => ({
                    token,
                    surface: card.spelling.slice(token.start, token.end),
                    length: queryLength(token.card.spelling),
                }))
                .sort((a, b) => Number(queryHasKanji(b.token.card.spelling)) - Number(queryHasKanji(a.token.card.spelling)) || b.length - a.length);
            for (const item of tokenQueries) {
                add(item.token.card.spelling);
                add(item.surface);
                if (item.token.card.reading !== item.token.card.spelling) add(item.token.card.reading);
            }
        }

        for (const fragment of immersionFallbackFragments(card.spelling)) add(fragment);
        return uniqueImmersionQueries(candidates).slice(0, IMMERSION_FALLBACK_QUERY_LIMIT);
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
        const context = this.activeMiningContext?.term === card.spelling
            ? this.activeMiningContext
            : this.contextByCardKey.get(cardKey(card)) ?? loadMiningContext(card.spelling);
        if (!context || context.sourceKind !== 'immersion-kit') return 0;

        const sentenceIndex = examples.findIndex(example => example.sentence === context.sentence);
        if (sentenceIndex >= 0) return sentenceIndex;

        const storedIndex = Number(context.immersionIndex);
        return Number.isFinite(storedIndex) && storedIndex >= 0 && storedIndex < examples.length ? storedIndex : 0;
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
        const language = settings.interfaceLanguage;
        const imageUrls = settings.immersionKitShowImages ? this.mediaUrls(example, 'image') : [];
        const hasAudio = this.mediaUrls(example, 'sound').length > 0;
        const imageUrl = imageUrls[0] ?? '';
        const storedContext = saveMiningContext(card.spelling, immersionContextFromExample(card.spelling, example, index, examples.length, imageUrl));
        if (storedContext) {
            this.contextByCardKey.set(cardKey(card), storedContext);
            if (promoteMiningContext || !this.activeMiningContext || this.activeMiningContext.term !== card.spelling) {
                this.activeMiningContext = storedContext;
            }
            log.debug('Immersion mining context stored', {
                term: card.spelling,
                sourceTitle: storedContext.sourceTitle,
                index,
                total: examples.length,
                active: this.activeMiningContext === storedContext,
            });
        }
        const sentenceHtml = renderHighlightedTextHtml(example.sentence, [card.spelling, card.reading, searchQuery], 'jpdb-reader-example-target');
        const translation = renderExampleTranslation(example.translation, settings);
        const sourceLabel = queryKey(searchQuery) !== queryKey(card.spelling)
            ? `${searchQuery} · ${example.sourceTitle}`
            : example.sourceTitle;
        const currentImage = container.querySelector<HTMLImageElement>('[data-immersion-image]');
        const currentMedia = currentImage?.closest<HTMLElement>('.jpdb-reader-example-media') ?? null;
        const currentImageSrc = currentImage?.currentSrc || currentImage?.src || '';
        const holdCurrentImage = Boolean(imageUrl && currentImageSrc && currentImage?.isConnected);
        const heldMediaHeight = holdCurrentImage ? Math.ceil(currentMedia?.getBoundingClientRect().height || currentImage?.getBoundingClientRect().height || 0) : 0;
        const mediaStyle = heldMediaHeight > 0 ? ` style="min-height:${heldMediaHeight}px"` : '';
        const imageSrc = holdCurrentImage ? currentImageSrc : '';
        const imageSrcAttribute = imageSrc ? ` src="${escapeHtml(imageSrc)}"` : '';
        const holdImageAttribute = holdCurrentImage ? ' data-immersion-hold-until-ready="true"' : '';
        const image = imageUrl
            ? `<div class="jpdb-reader-example-media"${mediaStyle}><img class="jpdb-reader-example-image" data-immersion-image data-immersion-image-src="${escapeHtml(imageUrl)}"${holdImageAttribute}${imageSrcAttribute} alt="" loading="eager" decoding="async"></div>`
            : '';
        delete container.dataset.immersionEmpty;
        setInnerHtml(container, `
            <summary class="jpdb-reader-local-title jpdb-reader-example-summary">
                <span class="jpdb-reader-example-source">${uiText(language, 'immersionKit')}</span>
                <span class="jpdb-reader-local-dict">${escapeHtml(sourceLabel)} · ${index + 1}/${examples.length}</span>
            </summary>
            <div class="jpdb-reader-example-actions" role="group" aria-label="Immersion Kit example controls">
                <button class="jpdb-reader-icon-mini" type="button" data-immersion-action="previous" title="${uiText(language, 'previousExample')}" aria-label="${uiText(language, 'previousExample')}">‹</button>
                ${hasAudio ? `<button class="jpdb-reader-icon-mini" type="button" data-immersion-action="audio" title="${uiText(language, 'playExampleAudio')}" aria-label="${uiText(language, 'playExampleAudio')}">${speakerIcon()}</button>` : ''}
                <button class="jpdb-reader-icon-mini" type="button" data-immersion-action="next" title="${uiText(language, 'nextExample')}" aria-label="${uiText(language, 'nextExample')}">›</button>
            </div>
            <div class="jpdb-reader-example-card ${image ? 'has-image' : ''}" data-immersion-index="${index}" data-immersion-total="${examples.length}" data-immersion-sentence="${escapeHtml(example.sentence)}" data-immersion-source-title="${escapeHtml(example.sourceTitle)}" data-immersion-image-url="${escapeHtml(imageUrl)}">
                <div class="jpdb-reader-example-body">
                    ${image}
                    <div class="jpdb-reader-example-sentence jpdb-reader-parseable" data-immersion-sentence-render>${sentenceHtml}</div>
                    ${translation}
                </div>
            </div>
        `);

        const hideBrokenImage = (imageElement: HTMLImageElement): void => {
            if (!imageElement.isConnected) return;
            imageElement.closest('.jpdb-reader-example-media')?.remove();
            if (imageElement.isConnected) imageElement.remove();
            container.querySelector<HTMLElement>('.jpdb-reader-example-card')?.classList.remove('has-image');
            this.options.repositionPopover();
        };
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
                    hideBrokenImage(imageElement);
                    return;
                }
                const currentSrc = imageElement.currentSrc || imageElement.src;
                const requestId = ++imageRequestId;
                this.options.client.fetchBlobUrl(fallbackUrl, this.options.getSettings().audioTimeoutMs)
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
                hideBrokenImage(imageElement);
                return;
            }
            loadNextImageCandidate();
        });
        this.options.repositionPopover();
        if (playAudio) void this.playExampleAudio(example, true);
        void this.options.parseJapanese([example.sentence])
            .then(([tokens]) => {
                if (!isCurrent() || !container.isConnected) return;
                const sentence = container.querySelector<HTMLElement>('[data-immersion-sentence-render]');
                if (!sentence) return;
                setInnerHtml(sentence, renderTokensToHtml(example.sentence, tokens ?? [], this.options.getSettings()));
                this.highlightTarget(sentence, card, searchQuery);
                void this.options.parsePopoverJapanese(container);
                void this.options.enrichAnkiWords(tokens ?? []);
                this.options.repositionPopover();
            })
            .catch(error => log.debug('Immersion example sentence parse failed quietly', { term: card.spelling }, error));
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
        const shouldBlur = !this.options.getSettings().immersionKitRevealTranslationOnClick;
        this.options.setImmersionTranslationBlurred(shouldBlur);
        container.querySelectorAll<HTMLElement>('.jpdb-reader-example-translation').forEach(translation => {
            setTranslationBlurAttributes(translation, shouldBlur, 'immersionTranslationBlurred');
        });
        this.options.repositionPopover();
    }

    private async playExampleAudio(example: ImmersionKitExample, quiet = false, isCurrent: () => boolean = () => true): Promise<void> {
        const urls = this.mediaUrls(example, 'sound');
        const url = urls[0] ?? '';
        if (!url) {
            log.debug('Immersion Kit example has no audio', { sourceTitle: example.sourceTitle });
            if (!quiet) this.options.toast('No Immersion Kit audio for this example.');
            return;
        }

        let requestId = 0;
        try {
            if (this.isAudioBusy(url)) {
                log.debug('Immersion Kit audio already active', { sourceTitle: example.sourceTitle });
                return;
            }

            requestId = ++this.audioRequestId;
            this.clearAudio();
            this.audioKey = url;
            this.audioLoadingKey = url;
            this.options.audio.stop();
            const src = await this.options.client.fetchBlobUrl(urls, this.options.getSettings().audioTimeoutMs);
            if (requestId !== this.audioRequestId || this.audioKey !== url || !isCurrent()) {
                if (requestId === this.audioRequestId && this.audioKey === url) this.clearAudio();
                return;
            }

            const audio = new Audio(src);
            audio.preload = 'auto';
            audio.playbackRate = this.options.getSettings().immersionKitPlaybackRate;
            this.audioBlobUrl = src;
            this.audioElement = audio;
            this.audioLoadingKey = '';
            const cleanup = () => {
                if (this.audioElement !== audio) return;
                this.clearAudio();
            };
            audio.addEventListener('ended', cleanup, { once: true });
            audio.addEventListener('error', cleanup, { once: true });
            if (!isCurrent()) {
                this.clearAudio();
                return;
            }
            await audio.play();
            if (!isCurrent()) {
                this.clearAudio();
                return;
            }
            log.debug('Immersion Kit audio playing', { sourceTitle: example.sourceTitle, viaBlob: true });
        } catch (error) {
            if (!requestId || requestId === this.audioRequestId) this.clearAudio();
            log.warn('Immersion Kit audio failed', { sourceTitle: example.sourceTitle, quiet }, error);
            if (!quiet) this.options.toast(error instanceof Error ? error.message : 'Immersion Kit audio failed.');
        }
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
        this.audioBlobUrl = undefined;
    }

    private isAudioBusy(key: string): boolean {
        if (this.audioLoadingKey === key) return true;
        return Boolean(this.audioElement && this.audioKey === key && !this.audioElement.ended);
    }
}

function renderExampleTranslation(translation: string, settings: ReaderSettings): string {
    if (!settings.immersionKitShowTranslation || !translation) return '';
    const escaped = escapeHtml(translation);
    if (!settings.immersionKitRevealTranslationOnClick) {
        return `<div class="jpdb-reader-example-translation jpdb-reader-parseable">${escaped}</div>`;
    }
    return `<div class="jpdb-reader-example-translation jpdb-reader-parseable" data-immersion-translation-blurred="true" role="button" tabindex="0" aria-label="Reveal translation">${escaped}</div>`;
}

function setTranslationBlurAttributes(element: HTMLElement, blurred: boolean, key: 'immersionTranslationBlurred'): void {
    if (blurred) {
        element.dataset[key] = 'true';
        element.setAttribute('role', 'button');
        element.setAttribute('tabindex', '0');
        element.setAttribute('aria-label', 'Reveal translation');
        return;
    }
    delete element.dataset[key];
    element.removeAttribute('tabindex');
    element.removeAttribute('role');
    element.removeAttribute('aria-label');
}

import { AUDIO_REQUEST_TIMEOUT_MS } from '../audio/request';
import { el, replaceChildrenWith } from '../dom/builder';
import type { ImmersionKitClient, ImmersionKitExample, ImmersionKitSearchOptions, ImmersionSearchResult } from '../immersion/kit';
import { sensitiveFingerprint } from '../core/sensitive-fingerprint';
import { nextImmersionExampleIndex, renderImmersionExampleToolbar } from '../immersion/player-view';
import { renderImmersionSearchLinks } from '../immersion/search-links';
import { waitForIdle as waitForBrowserIdle } from '../platform/idle';
import { IMMERSION_FALLBACK_QUERY_LIMIT, immersionFallbackFragments, isUsefulImmersionFallbackQuery, uniqueImmersionQueries } from '../immersion/query';
import { promiseWithTimeout } from '../core/async-utils';
import { BoundedMap } from '../core/bounded-map';
import type { JpdbVocabularyClient } from '../jpdb/jpdb-vocabulary';
import { canAttemptAudiblePlayback } from '../audio/media-activation';
import { activeLearningTarget, activeLearningTargetLanguage } from '../languages/target-runtime';
import { targetCanLookupCharacter, usesJapaneseProviders } from '../languages/character-lookup';
import { cardKey } from './index';
import { newTabImmersionAudioUrls, newTabImmersionImageUrl, renderNewTabImmersionImage, renderNewTabImmersionSentence, renderNewTabImmersionTranslation, syncNewTabImmersionFrameSubtitleSize } from './card-view';
import { newTabCardOptionalReading, newTabCardReading } from './study-queue';
import { fallbackSearchKanjiCard } from './kanji-helpers';
import { NewTabImmersionAudioPlayer } from './immersion-audio';
import { isJitenSrsCard } from './review-targets';
import { uniqueTrimmedStrings as uniqueStrings } from '../core/string-utils';
import { type ReaderParser } from '../lookup/parser';
import type { JPDBCard, JPDBToken, ReaderSettings } from '../app/types';
import { uiText } from '../app/i18n';
import { hasJpdbApiCredential } from '../settings/api-credential';
import { captureActiveTarget, isCurrentActiveTarget } from './target-scope';
import { newTabShortParseOptions, accurateNewTabImmersionExamples, normalizePromptContextSentence, jpdbExampleSentenceForPrompt } from './study-example-policy';

export type StudyExamplesView = {
    /** Word meaning container, or the data-newtab-kanji-immersion-mount container. */
    mount: HTMLElement;
    card: JPDBCard;
    revealed: boolean;
} & ({ mode: 'word' } | { mode: 'kanji'; kanji: string });
export interface StudyExampleSentences {
    peek(text: string): JPDBToken[] | undefined;
    prepare(text: string): Promise<JPDBToken[]>;
    enrich(node: HTMLElement, text: string, card: JPDBCard, isCurrent: () => boolean): Promise<boolean>;
    highlight(root: HTMLElement, selector: string, card: JPDBCard): void;
}
export interface StudyExamplesDependencies {
    getSettings(): ReaderSettings;
    immersionKit: Pick<ImmersionKitClient, 'searchResult' | 'mediaUrls' | 'fetchBlobUrl'>;
    parser: Pick<ReaderParser, 'canParse' | 'parse' | 'fallbackCardFromText'>;
    jpdbVocabulary?: Pick<JpdbVocabularyClient, 'lookup'>;
    parseContent?: (root: HTMLElement, options?: { jpdbTimeoutMs?: number }) => void | Promise<void>;
    sentences: StudyExampleSentences;
}

const NEW_TAB_IMMERSION_CACHE_LIMIT = 160;
const NEW_TAB_STUDY_SENTENCE_CACHE_LIMIT = 320;
const NEW_TAB_IMMERSION_SEARCH_REQUEST_LIMIT = 10;
const NEW_TAB_IMMERSION_LOAD_TIMEOUT_GRACE_MS = 1_000;
const NEW_TAB_IMMERSION_EXAMPLE_LIMIT = 12;
type FrontSentenceResult = { sentence: string; status: 'complete' | 'partial' };

/** Coordinates shared acquisition and independent mounted presentations. */
export class StudyExamples {
    private readonly queries: StudyExampleQueries;
    private readonly study: StudyExamplesPresentation;
    private readonly panels = new Map<HTMLElement, StudyExamplesPresentation>();
    private readonly lifecycle = new AbortController();
    private readonly removals: MutationObserver;
    private disposed = false;
    private lastOnlineRecovery?: number;

    constructor(private readonly deps: StudyExamplesDependencies) {
        this.queries = new StudyExampleQueries(deps);
        this.study = new StudyExamplesPresentation(deps, this.queries);
        this.removals = new MutationObserver(() => this.prunePanels());
        window.addEventListener('online', () => {
            if (this.lastOnlineRecovery !== undefined && Date.now() - this.lastOnlineRecovery < 1_000) return;
            this.lastOnlineRecovery = Date.now();
            this.queries.reset();
            this.prunePanels();
            this.study.refresh();
            for (const panel of this.panels.values()) panel.refresh();
        }, { signal: this.lifecycle.signal });
    }

    activate(mode: 'study' | 'search' | null): void {
        if (this.disposed) return;
        if (mode !== 'search') this.clearPanels();
        if (mode !== 'study') this.study.present(null);
    }

    /** Study remains singular, including rejection of an obsolete connected mount. */
    present(view: StudyExamplesView | null): void {
        if (this.disposed) return;
        this.activate('study');
        this.study.present(view);
    }

    /** Search panels coexist; removing their mount disposes their presentation. */
    presentSearch(view: StudyExamplesView & { mode: 'kanji' }): void {
        if (this.disposed) return;
        this.activate('search');
        if (!this.panels.size) this.removals.observe(document.documentElement, { childList: true, subtree: true });
        const panel = this.panels.get(view.mount) ?? new StudyExamplesPresentation(this.deps, this.queries);
        this.panels.set(view.mount, panel);
        panel.present(view);
    }

    act(action: 'previous' | 'next' | 'audio', surface?: HTMLElement): void {
        if (this.disposed) return;
        this.prunePanels();
        const panel = surface ? [...this.panels].find(([mount]) => mount === surface || mount.contains(surface))?.[1] : undefined;
        if (surface && this.panels.size && !panel) return;
        // Invalidate pending loads as well as stopping already audible media.
        this.study.stopAudio();
        for (const item of this.panels.values()) item.stopAudio();
        (panel ?? this.study).act(action, surface);
    }

    examples(card: JPDBCard): Promise<ImmersionKitExample[]> { return this.study.examples(card); }
    frontSentence(card: JPDBCard): Promise<string> { return this.study.frontSentence(card); }
    prefetch(cards: readonly JPDBCard[]): void { this.study.prefetch(cards); }
    reset(): void { this.clearPanels(); this.study.reset(); this.queries.reset(); }
    dispose(): void {
        this.disposed = true;
        this.lifecycle.abort();
        this.clearPanels();
        this.study.dispose();
        this.queries.dispose();
    }
    private clearPanels(): void {
        if (!this.panels.size) return;
        this.removals.disconnect();
        for (const panel of this.panels.values()) panel.dispose();
        this.panels.clear();
    }
    private prunePanels(): void {
        if (!this.panels.size) return;
        for (const [mount, panel] of this.panels) {
            if (mount.isConnected) continue;
            panel.dispose();
            this.panels.delete(mount);
        }
        if (!this.panels.size) this.removals.disconnect();
    }
}

class StudyExamplesPresentation {
    private view: StudyExamplesView | null = null;
    private target = captureActiveTarget();
    private viewContext = '';
    private disposed = false;
    private immersionExampleIndex = new BoundedMap<string, number>(NEW_TAB_IMMERSION_CACHE_LIMIT);
    private frontSentenceCache = new BoundedMap<string, { promise: Promise<string>; expiresAt: number }>(NEW_TAB_STUDY_SENTENCE_CACHE_LIMIT);
    private immersionPrefetchGeneration = 0;
    private readonly immersionAudioPlayer: NewTabImmersionAudioPlayer;
    private mountLifecycle = new AbortController();

    constructor(private readonly deps: StudyExamplesDependencies, private readonly queries: StudyExampleQueries) {
        this.immersionAudioPlayer = new NewTabImmersionAudioPlayer(deps);
    }
    private audioGeneration = 0;
    stopAudio(): void { this.audioGeneration++; this.immersionAudioPlayer.reset(); }
    refresh(): void { this.frontSentenceCache.clear(); if (this.view) this.present(this.view); }

    present(view: StudyExamplesView | null): void {
        if (this.disposed) return;
        const context = this.queries.searchContext();
        if (this.view && this.viewContext !== context) this.reset();
        const previous = this.view;
        this.mountLifecycle.abort();
        this.mountLifecycle = new AbortController();
        if (!view?.revealed || !previous || previous.mount !== view.mount
            || cardKey(previous.card) !== cardKey(view.card) || previous.mode !== view.mode
            || (previous.mode === 'kanji' && view.mode === 'kanji' && previous.kanji !== view.kanji)) {
            this.stopAudio();
        }
        this.view = view;
        this.target = captureActiveTarget();
        this.viewContext = context;
        this.immersionPrefetchGeneration++;
        if (!view?.revealed || !this.deps.getSettings().immersionKitEnabled) {
            previous?.mount.querySelectorAll('.jpdb-reader-newtab-immersion').forEach(node => node.remove());
            return;
        }
        if (view.mode === 'kanji') {
            this.renderNewTabKanjiImmersion(view.mount, view.kanji);
        } else {
            void this.renderImmersionExample({ meaning: view.mount }, view.card);
        }
    }

    act(action: 'previous' | 'next' | 'audio', surface?: HTMLElement): void {
        const view = this.view;
        if (!view?.revealed || !this.current()) return;
        if (surface && surface !== view.mount && !view.mount.contains(surface)) return;
        if (view.mode === 'kanji') {
            const node = surface ?? view.mount.querySelector<HTMLElement>('[data-newtab-kanji-immersion]');
            if (node) this.performNewTabKanjiImmersionAction(view.mount, node, action);
            else if (action === 'audio') void this.playCurrentKanjiImmersionAudio(view.kanji, view.card);
        } else this.performNewTabImmersionAction(view.mount, surface ?? view.mount, action);
    }

    examples(card: JPDBCard): Promise<ImmersionKitExample[]> { return this.loadImmersionExamples(card); }
    frontSentence(card: JPDBCard): Promise<string> { return this.loadFrontSentence(card); }

    prefetch(cards: readonly JPDBCard[]): void {
        if (this.disposed || !this.deps.getSettings().immersionKitEnabled) return;
        const generation = this.immersionPrefetchGeneration;
        cards.slice(0, 2).forEach((card, index) => {
            if (!index) this.prefetchNewTabImmersionCard(card, { generation, current: true });
            else void waitForBrowserIdle().then(() => {
                if (this.isCurrentImmersionPrefetchGeneration(generation)) this.prefetchNewTabImmersionCard(card, { generation, current: false });
            });
        });
    }

    reset(): void {
        this.immersionPrefetchGeneration++;
        this.mountLifecycle.abort();
        this.immersionExampleIndex.clear();
        this.frontSentenceCache.clear();
        this.stopAudio();
        this.view?.mount.querySelectorAll('.jpdb-reader-newtab-immersion').forEach(node => node.remove());
        this.view = null;
    }
    dispose(): void { this.reset(); this.disposed = true; }
    private current(): boolean { return !this.disposed && Boolean(this.view?.mount.isConnected) && isCurrentActiveTarget(this.target) && this.viewContext === this.queries.searchContext(); }
    private isVocabularyStudyRoute(): boolean { return this.current() && this.view?.mode === 'word'; }
    private isCurrentRevealedWordCard(key: string): boolean { return this.isVocabularyStudyRoute() && Boolean(this.view?.revealed && cardKey(this.view.card) === key); }
    private isCurrentRevealedKanji(kanji: string): boolean {
        return this.current() && this.view?.mode === 'kanji' && this.view.revealed
            && this.view.kanji === kanji;
    }
    private language() { return this.deps.getSettings().interfaceLanguage; }
    private newTabSentenceText(node: HTMLElement | null): string { return (node?.dataset.newtabSentenceText || node?.closest<HTMLElement>('[data-immersion-sentence]')?.dataset.immersionSentence || node?.textContent || '').trim(); }
    private prefetchNewTabParsedSentence(text: string): void { if (text.trim()) void this.deps.sentences.prepare(text).catch(() => undefined); }

    private loadFrontSentence(card: JPDBCard): Promise<string> {
        if (this.disposed) return Promise.resolve('');
        const key = this.frontSentenceCacheKey(card);
        const existing = this.frontSentenceCache.get(key);
        if (existing && existing.expiresAt > Date.now()) return existing.promise.catch(() => '');
        const entry = { promise: Promise.resolve(''), expiresAt: Infinity };
        const context = this.queries.searchContext();
        entry.promise = this.fetchFrontSentence(card).then(({ sentence, status }) => {
            this.queries.assertSearchContext(context);
            entry.expiresAt = Math.min(Date.now() + (sentence || status === 'complete' ? 30_000 : 1_000), this.queries.validUntil(card));
            return sentence;
        }).catch(error => { entry.expiresAt = Date.now() + 1_000; throw error; });
        this.frontSentenceCache.set(key, entry);
        return entry.promise.catch(() => '');
    }

    private async fetchFrontSentence(card: JPDBCard): Promise<FrontSentenceResult> {
        const context = this.queries.searchContext();
        // Provider fidelity (study-hub parity SH-5): a JPDB-backed card fronts
        // JPDB's own example sentence — exactly what jpdb.io shows on its
        // review front. Immersion Kit is the superset fallback for cards the
        // provider gives no sentence, never a replacement.
        const sources = card.source === 'jpdb' && !isJitenSrsCard(card)
            ? [() => this.loadJpdbFrontSentence(card), () => this.loadImmersionFrontSentence(card)]
            : [() => this.loadImmersionFrontSentence(card), () => this.loadJpdbFrontSentence(card)];
        let failure: unknown;
        let status: FrontSentenceResult['status'] = 'complete';
        for (const source of sources) {
            this.queries.assertSearchContext(context);
            try {
                const result = await source();
                this.queries.assertSearchContext(context);
                if (result.status === 'partial') status = 'partial';
                if (result.sentence) return { sentence: result.sentence, status };
            } catch (error) { failure = error; status = 'partial'; }
        }
        if (failure) throw failure;
        return { sentence: '', status };
    }

    private async loadImmersionFrontSentence(card: JPDBCard): Promise<FrontSentenceResult> {
        if (!this.canLoadImmersionFrontSentence()) return { sentence: '', status: 'complete' };
        const { examples, status } = await this.queries.acquire(card);
        const example = examples[this.normalizedImmersionExampleIndex(cardKey(card), examples)] ?? examples[0];
        return { sentence: normalizePromptContextSentence(example?.sentence, card), status };
    }

    private canLoadImmersionFrontSentence(): boolean {
        return this.deps.getSettings().immersionKitEnabled;
    }

    private async loadJpdbFrontSentence(card: JPDBCard): Promise<FrontSentenceResult> {
        if (!usesJapaneseProviders()) return { sentence: '', status: 'complete' };
        const settings = this.deps.getSettings();
        if (!settings.jpdbDefinitionsEnabled || !hasJpdbApiCredential(settings) || !this.deps.jpdbVocabulary) return { sentence: '', status: 'complete' };
        const { info, status } = await this.deps.jpdbVocabulary.lookup(card.vid, card.spelling, newTabCardReading(card));
        return { sentence: usesJapaneseProviders() ? jpdbExampleSentenceForPrompt(info, card) : '', status };
    }

    private frontSentenceCacheKey(card: JPDBCard): string {
        const settings = this.deps.getSettings();
        return JSON.stringify({
            card: cardKey(card),
            context: this.queries.searchContext(),
            provider: [card.source, card.reviewSource],
            enabled: settings.newTabFrontSentenceEnabled,
            immersion: settings.immersionKitEnabled ? [card.spelling, newTabCardOptionalReading(card), card.fallbackLookupTerms] : '',
            jpdbDefinitionsEnabled: settings.jpdbDefinitionsEnabled,
        });
    }

    private async renderImmersionExample(slots: { meaning: HTMLElement | null }, card: JPDBCard): Promise<void> {
        const meaning = slots.meaning;
        if (!this.canRenderImmersionExample(meaning)) return;
        const key = cardKey(card);
        const requestId = `${key}:${performance.now()}:${Math.random()}`;
        const generation = this.immersionPrefetchGeneration;
        meaning.dataset.newtabImmersionRequest = requestId;
        const examples = await this.loadImmersionExamples(card);
        if (generation !== this.immersionPrefetchGeneration) return;
        if (meaning.dataset.newtabImmersionRequest !== requestId) return;
        if (!this.canAppendImmersionExample(meaning, key, examples)) return;
        const index = this.normalizedImmersionExampleIndex(key, examples);
        const immersion = this.renderNewTabImmersionCard(card, examples, index);
        meaning.querySelectorAll(':scope > .jpdb-reader-newtab-immersion').forEach(element => element.remove());
        // Immersion Kit sits above the dictionaries regardless of which async
        // loader finishes first: the reveal reads example → sources.
        const dictionaries = meaning.querySelector(':scope > .jpdb-reader-newtab-reveal-dictionaries');
        if (dictionaries) dictionaries.before(immersion);
        else meaning.append(immersion);
        this.loadNewTabImmersionImage(immersion, examples[index]);
        await this.parseNewTabImmersionExample(immersion, card, key);
    }

    private canRenderImmersionExample(meaning: HTMLElement | null): meaning is HTMLElement {
        return Boolean(this.view?.revealed)
            && Boolean(meaning)
            && this.deps.getSettings().immersionKitEnabled;
    }

    private canAppendImmersionExample(meaning: HTMLElement, key: string, examples: ImmersionKitExample[]): boolean {
        return Boolean(examples.length)
            && Boolean(this.view && cardKey(this.view.card) === key)
            && this.view?.mount === meaning
            && meaning.isConnected
            && this.isVocabularyStudyRoute()
            && Boolean(this.view?.revealed);
    }

    private renderNewTabImmersionCard(card: JPDBCard, examples: ImmersionKitExample[], index: number): HTMLElement {
        return this.renderNewTabImmersionCardVariant(card, examples[index], index, examples.length, 'word');
    }

    private renderNewTabImmersionCardVariant(
        card: JPDBCard,
        example: ImmersionKitExample,
        index: number,
        total: number,
        variant: 'word' | 'kanji',
    ): HTMLElement {
        const settings = this.deps.getSettings();
        const audioUrls = newTabImmersionAudioUrls(example, this.deps.immersionKit);
        const isKanji = variant === 'kanji';
        const node = el('div', isKanji
            ? {
                class: 'jpdb-reader-newtab-immersion jpdb-reader-newtab-kanji-immersion',
                dataset: { newtabKanjiImmersion: true, newtabKanji: card.spelling },
            }
            : { class: 'jpdb-reader-newtab-immersion' },
            this.renderNewTabImmersionToolbar(example, index, total, audioUrls.length > 0, isKanji ? { showSource: true } : {}),
            renderImmersionSearchLinks(card.spelling, settings.interfaceLanguage),
            this.renderNewTabImmersionExampleBody(card, example, settings, index, total, audioUrls),
        );
        if (!isKanji) this.highlightNewTabImmersionTarget(node, card);
        return node;
    }

    private async parseNewTabImmersionExample(root: HTMLElement, card: JPDBCard, key: string): Promise<void> {
        const generation = this.immersionPrefetchGeneration;
        const current = () => generation === this.immersionPrefetchGeneration && this.canApplyNewTabImmersionParse(root, key);
        const sentence = root.querySelector<HTMLElement>('[data-immersion-sentence-render]');
        const sentenceText = this.newTabSentenceText(sentence);
        if (sentence && await this.deps.sentences.enrich(sentence, sentenceText, card, current)) return;
        if (!current()) return;
        await this.deps.parseContent?.(root, newTabShortParseOptions())?.catch(() => undefined);
        if (!current()) return;
        this.highlightNewTabImmersionTarget(root, card);
    }

    private canApplyNewTabImmersionParse(root: HTMLElement, key: string): boolean {
        return root.isConnected
            && Boolean(this.view && cardKey(this.view.card) === key)
            && this.isVocabularyStudyRoute()
            && Boolean(this.view?.revealed);
    }

    private highlightNewTabImmersionTarget(root: HTMLElement, card: JPDBCard): void {
        this.deps.sentences.highlight(root, '[data-immersion-sentence-render]', card);
    }

    private renderNewTabImmersionToolbar(
        example: ImmersionKitExample,
        index: number,
        total: number,
        hasAudio: boolean,
        options: { showSource?: boolean } = {},
    ): HTMLElement {
        return renderImmersionExampleToolbar({
            example,
            index,
            total,
            hasAudio,
            language: this.language(),
            showSource: options.showSource,
        });
    }

    private renderNewTabImmersionExampleBody(
        card: JPDBCard,
        example: ImmersionKitExample,
        settings: ReaderSettings,
        index: number,
        total: number,
        audioUrls: string[],
    ): HTMLElement {
        const imageUrl = newTabImmersionImageUrl(example, settings, this.deps.immersionKit);
        const sentence = renderNewTabImmersionSentence(card, example, settings, this.deps.sentences.peek(example.sentence));
        if (imageUrl) sentence.classList.add('jpdb-subtitle-primary');
        return el('div', {
            class: `jpdb-reader-example-card ${imageUrl ? 'has-image' : ''}`,
            dataset: {
                immersionIndex: String(index),
                immersionTotal: String(total),
                immersionSentence: example.sentence,
                immersionSourceTitle: example.sourceTitle,
                immersionImageUrl: imageUrl,
                immersionAudioUrls: JSON.stringify(audioUrls),
            },
        },
            el('div', { class: 'jpdb-reader-example-body' },
                renderNewTabImmersionImage(imageUrl, sentence),
                imageUrl ? null : sentence,
                renderNewTabImmersionTranslation(example, settings),
            ),
        );
    }

    private performNewTabImmersionAction(root: HTMLElement, surface: HTMLElement, action: string): void {
        const generation = this.immersionPrefetchGeneration;
        const audioGeneration = this.audioGeneration;
        const current = this.view?.card;
        if (!current) return;
        if (action === 'audio') {
            void this.playRenderedOrCurrentImmersionAudio(surface, current);
            return;
        }
        if (action !== 'previous' && action !== 'next') return;
        const key = cardKey(current);
        void this.queries.acquire(current).then(({ examples }) => {
            if (generation !== this.immersionPrefetchGeneration || !examples.length || !this.view || cardKey(this.view.card) !== key) return;
            const currentIndex = this.normalizedImmersionExampleIndex(key, examples);
            const nextIndex = nextImmersionExampleIndex(currentIndex, examples.length, action);
            this.immersionExampleIndex.set(key, nextIndex);
            const replaced = this.replaceNewTabImmersionExample(root, current, examples, nextIndex);
            if (replaced && audioGeneration === this.audioGeneration && this.shouldAutoPlayNewTabImmersionNavigationAudio()) void this.playCurrentImmersionAudio(current);
        }).catch(() => undefined);
    }

    private performNewTabKanjiImmersionAction(root: HTMLElement, surface: HTMLElement, action: string): void {
        const generation = this.immersionPrefetchGeneration;
        const audioGeneration = this.audioGeneration;
        const kanji = surface.dataset.newtabKanji ?? '';
        if (!targetCanLookupCharacter(kanji)) return;
        const card = this.newTabKanjiImmersionCard(kanji);
        if (action === 'audio') {
            void this.playRenderedOrCurrentKanjiImmersionAudio(surface, kanji, card);
            return;
        }
        if (action !== 'previous' && action !== 'next') return;
        const key = this.newTabKanjiImmersionKey(kanji);
        void this.loadImmersionExamples(card).then(examples => {
            if (generation !== this.immersionPrefetchGeneration || !examples.length || !this.isCurrentRevealedKanji(kanji)) return;
            const currentIndex = this.normalizedImmersionExampleIndex(key, examples);
            const nextIndex = nextImmersionExampleIndex(currentIndex, examples.length, action);
            this.immersionExampleIndex.set(key, nextIndex);
            const replaced = this.replaceNewTabKanjiImmersionExample(root, kanji, card, examples, nextIndex);
            if (replaced && audioGeneration === this.audioGeneration && this.shouldAutoPlayNewTabImmersionNavigationAudio()) void this.playCurrentKanjiImmersionAudio(kanji, card);
        });
    }

    private shouldAutoPlayNewTabImmersionNavigationAudio(): boolean {
        const settings = this.deps.getSettings();
        return settings.immersionKitEnabled
            && settings.immersionKitAutoPlayAudio
            && settings.audioEnabled
            && canAttemptAudiblePlayback(true);
    }

    private replaceNewTabImmersionExample(meaning: HTMLElement, card: JPDBCard, examples: ImmersionKitExample[], index: number): boolean {
        const key = cardKey(card);
        if (!this.canAppendImmersionExample(meaning, key, examples)) return false;
        const immersion = this.renderNewTabImmersionCard(card, examples, index);
        const existing = meaning.querySelector<HTMLElement>(':scope > .jpdb-reader-newtab-immersion');
        if (existing) existing.replaceWith(immersion);
        else meaning.append(immersion);
        this.loadNewTabImmersionImage(immersion, examples[index]);
        void this.parseNewTabImmersionExample(immersion, card, key);
        return true;
    }

    private replaceNewTabKanjiImmersionExample(
        root: HTMLElement,
        kanji: string,
        card: JPDBCard,
        examples: ImmersionKitExample[],
        index: number,
    ): boolean {
        const body = root.querySelector<HTMLElement>('[data-newtab-kanji-immersion-body]');
        if (!body || !this.canApplyNewTabKanjiImmersion(body, kanji)) return false;
        const immersion = this.renderNewTabKanjiImmersionCard(card, examples[index], index, examples.length);
        const existing = body.querySelector<HTMLElement>(':scope > [data-newtab-kanji-immersion]');
        if (existing) existing.replaceWith(immersion);
        else replaceChildrenWith(body, immersion);
        this.loadNewTabImmersionImage(immersion, examples[index]);
        void this.parseNewTabKanjiImmersionExample(immersion, card);
        return true;
    }

    private normalizedImmersionExampleIndex(key: string, examples: ImmersionKitExample[]): number {
        const index = this.immersionExampleIndex.get(key) ?? 0;
        if (index >= 0 && index < examples.length) return index;
        this.immersionExampleIndex.set(key, 0);
        return 0;
    }

    private loadNewTabImmersionImage(root: HTMLElement, example: ImmersionKitExample): void {
        const generation = this.immersionPrefetchGeneration;
        const current = () => this.current() && generation === this.immersionPrefetchGeneration && root.isConnected;
        const image = root.querySelector<HTMLImageElement>('.jpdb-reader-newtab-immersion [data-yomu-immersion-image-src]');
        if (!image) return;
        const urls = this.deps.immersionKit.mediaUrls(example, 'image');
        if (!urls.length) {
            this.hideNewTabImmersionImage(root, image);
            return;
        }
        let directIndex = Math.max(0, urls.indexOf(image.getAttribute('src') || image.dataset.yomuImmersionImageSrc || ''));
        const showNextDirectImage = () => {
            if (!current()) return;
            directIndex += 1;
            const nextUrl = urls[directIndex];
            if (!nextUrl) {
                this.hideNewTabImmersionImage(root, image);
                return;
            }
            if (image.isConnected) image.src = nextUrl;
        };
        image.addEventListener('error', showNextDirectImage, { signal: this.mountLifecycle.signal });
        image.addEventListener('load', () => { if (current()) syncNewTabImmersionFrameSubtitleSize(root); }, { signal: this.mountLifecycle.signal });
        const settings = this.deps.getSettings();
        void this.deps.immersionKit.fetchBlobUrl(urls, AUDIO_REQUEST_TIMEOUT_MS, settings.corsProxyUrl, settings.interfaceLanguage)
            .then(src => {
                if (!current()) return;
                image.removeEventListener('error', showNextDirectImage);
                image.src = src;
                syncNewTabImmersionFrameSubtitleSize(root);
            })
            .catch(() => undefined);
    }

    private hideNewTabImmersionImage(root: HTMLElement, image: HTMLImageElement): void {
        const media = image.closest('.jpdb-reader-example-media');
        const sentence = media?.querySelector<HTMLElement>('.jpdb-reader-example-sentence');
        if (sentence) {
            sentence.classList.remove('jpdb-subtitle-primary');
            media?.after(sentence);
        }
        media?.remove();
        root.querySelector<HTMLElement>('.jpdb-reader-example-card')?.classList.remove('has-image');
        syncNewTabImmersionFrameSubtitleSize(root);
    }

    private async playCurrentImmersionAudio(card: JPDBCard): Promise<void> {
        const key = cardKey(card);
        await this.playNewTabImmersionAudio(card, key, () => this.isCurrentRevealedWordCard(key));
    }

    private async playCurrentKanjiImmersionAudio(kanji: string, card: JPDBCard): Promise<void> {
        await this.playNewTabImmersionAudio(card, this.newTabKanjiImmersionKey(kanji), () => this.isCurrentRevealedKanji(kanji));
    }

    private async playRenderedOrCurrentImmersionAudio(surface: HTMLElement, card: JPDBCard): Promise<void> {
        const key = cardKey(card);
        await this.playRenderedOrNewTabImmersionAudio(surface, card, key, () => this.isCurrentRevealedWordCard(key));
    }

    private async playRenderedOrCurrentKanjiImmersionAudio(surface: HTMLElement, kanji: string, card: JPDBCard): Promise<void> {
        await this.playRenderedOrNewTabImmersionAudio(surface, card, this.newTabKanjiImmersionKey(kanji), () => this.isCurrentRevealedKanji(kanji));
    }

    private async playRenderedOrNewTabImmersionAudio(surface: HTMLElement, card: JPDBCard, key: string, isCurrent: () => boolean): Promise<void> {
        const generation = this.immersionPrefetchGeneration;
        const audioGeneration = this.audioGeneration;
        const stillCurrent = () => audioGeneration === this.audioGeneration && generation === this.immersionPrefetchGeneration && isCurrent();
        if (!this.deps.getSettings().audioEnabled) return;
        const source = this.renderedNewTabImmersionAudioSource(surface);
        if (source) {
            await this.immersionAudioPlayer.playSource(source, stillCurrent);
            return;
        }
        await this.playNewTabImmersionAudio(card, key, stillCurrent);
    }

    private async playNewTabImmersionAudio(card: JPDBCard, key: string, isCurrent: () => boolean): Promise<void> {
        const generation = this.immersionPrefetchGeneration;
        const audioGeneration = this.audioGeneration;
        const stillCurrent = () => audioGeneration === this.audioGeneration && generation === this.immersionPrefetchGeneration && isCurrent();
        if (!this.deps.getSettings().audioEnabled) return;
        const examples = await this.loadImmersionExamples(card);
        if (!stillCurrent()) return;
        const example = examples[this.normalizedImmersionExampleIndex(key, examples)];
        if (!example) return;
        const source = this.newTabImmersionAudioSource(example);
        if (!source) return;
        await this.immersionAudioPlayer.playSource(source, stillCurrent);
    }

    private newTabImmersionAudioSource(example: ImmersionKitExample): { urls: string[]; key: string } | null {
        const urls = newTabImmersionAudioUrls(example, this.deps.immersionKit);
        return this.newTabImmersionAudioSourceFromUrls(urls);
    }

    private newTabImmersionAudioSourceFromUrls(urls: string[]): { urls: string[]; key: string } | null {
        const candidates = uniqueStrings(urls);
        const key = candidates[0] ?? '';
        return key ? { urls: candidates, key } : null;
    }

    private renderedNewTabImmersionAudioSource(surface: HTMLElement): { urls: string[]; key: string } | null {
        const card = surface.classList.contains('jpdb-reader-example-card')
            ? surface
            : surface.querySelector<HTMLElement>('.jpdb-reader-example-card');
        const raw = card?.dataset.immersionAudioUrls;
        if (!raw) return null;
        try {
            const parsed: unknown = JSON.parse(raw);
            if (!Array.isArray(parsed)) return null;
            return this.newTabImmersionAudioSourceFromUrls(parsed.filter((value): value is string => typeof value === 'string'));
        } catch {
            return null;
        }
    }

    private loadImmersionExamples(card: JPDBCard): Promise<ImmersionKitExample[]> {
        return this.queries.acquire(card).then(result => result.examples).catch(() => []);
    }

    private prefetchNewTabImmersionCard(card: JPDBCard, context: { generation: number; current: boolean }): void {
        const sourceContext = this.queries.searchContext();
        void this.loadImmersionExamples(card)
            .then(examples => {
                if (!this.isCurrentImmersionPrefetchGeneration(context.generation) || sourceContext !== this.queries.searchContext()) return;
                this.prefetchNewTabImmersionSentences(card, examples, context.current);
                const example = examples[this.normalizedImmersionExampleIndex(cardKey(card), examples)] ?? examples[0];
                if (!example) return;
                if (context.current) this.prefetchNewTabImmersionMedia(example);
            })
            .catch(() => undefined);
    }

    private isCurrentImmersionPrefetchGeneration(generation: number): boolean {
        return generation === this.immersionPrefetchGeneration
            && !this.disposed;
    }

    private prefetchNewTabImmersionSentences(card: JPDBCard, examples: ImmersionKitExample[], includeAdjacent: boolean): void {
        if (!examples.length) return;
        const key = cardKey(card);
        const index = this.normalizedImmersionExampleIndex(key, examples);
        const indexes = includeAdjacent && examples.length > 1
            ? [index, (index + 1) % examples.length]
            : [index];
        indexes.forEach(exampleIndex => {
            const sentence = normalizePromptContextSentence(examples[exampleIndex]?.sentence, card);
            if (sentence) this.prefetchNewTabParsedSentence(sentence);
        });
    }

    private prefetchNewTabImmersionMedia(example: ImmersionKitExample): void {
        const settings = this.deps.getSettings();
        const imageUrls = settings.immersionKitShowImages ? this.deps.immersionKit.mediaUrls(example, 'image') : [];
        if (imageUrls.length) {
            void this.deps.immersionKit.fetchBlobUrl(imageUrls, AUDIO_REQUEST_TIMEOUT_MS, settings.corsProxyUrl, settings.interfaceLanguage)
                .catch(() => undefined);
        }
        const audioUrls = this.deps.immersionKit.mediaUrls(example, 'sound');
        if (audioUrls.length) {
            void this.deps.immersionKit.fetchBlobUrl(audioUrls, AUDIO_REQUEST_TIMEOUT_MS, settings.corsProxyUrl, settings.interfaceLanguage)
                .catch(() => undefined);
        }
    }

    private renderNewTabKanjiImmersion(root: HTMLElement, kanji: string): void {
        if (!targetCanLookupCharacter(kanji)) return;
        const target = captureActiveTarget();
        const generation = this.immersionPrefetchGeneration;
        const isCurrentTarget = () => isCurrentActiveTarget(target) && generation === this.immersionPrefetchGeneration && this.isCurrentRevealedKanji(kanji);
        const settings = this.deps.getSettings();
        const mount = root;
        const details = mount?.querySelector<HTMLDetailsElement>('[data-newtab-kanji-immersion-details]');
        const body = mount?.querySelector<HTMLElement>('[data-newtab-kanji-immersion-body]');
        if (!mount || !details || !body || !settings.immersionKitEnabled || !settings.kanjiImmersionKitEnabled) return;

        const card = this.newTabKanjiImmersionCard(kanji, target.target);
        const key = this.newTabKanjiImmersionKey(kanji);
        let started = false;
        const load = () => {
            if (!isCurrentTarget() || !targetCanLookupCharacter(kanji) || !details.open || started || !mount.isConnected || !body.isConnected) return;
            started = true;
            void this.queries.acquire(card).then(async ({ examples }) => {
                if (!isCurrentTarget() || !targetCanLookupCharacter(kanji) || !mount.isConnected || !body.isConnected) return;
                const index = this.normalizedImmersionExampleIndex(key, examples);
                const example = examples[index];
                if (!example) {
                    replaceChildrenWith(body, el('div', { class: 'jpdb-reader-help' }, uiText(this.language(), 'noImmersionExamplesCompact')));
                    details.dataset.immersionEmpty = 'true';
                    return;
                }
                const immersion = this.renderNewTabKanjiImmersionCard(card, example, index, examples.length);
                delete details.dataset.immersionEmpty;
                delete details.dataset.immersionFailed;
                replaceChildrenWith(body, immersion);
                this.loadNewTabImmersionImage(immersion, example);
                await this.parseNewTabKanjiImmersionExample(immersion, card);
            }).catch(() => {
                if (isCurrentTarget() && body.isConnected) {
                    started = false;
                    delete details.dataset.immersionEmpty;
                    details.dataset.immersionFailed = 'true';
                    replaceChildrenWith(body, el('div', { class: 'jpdb-reader-help' }, uiText(this.language(), 'immersionKitRequestFailed')));
                }
            });
        };
        details.addEventListener('toggle', load, { signal: this.mountLifecycle.signal });
        load();
    }

    private newTabKanjiImmersionCard(kanji: string, target = activeLearningTarget()): JPDBCard {
        return this.deps.parser.fallbackCardFromText?.(kanji, target) ?? fallbackSearchKanjiCard(kanji);
    }

    private newTabKanjiImmersionKey(kanji: string): string {
        return `kanji:${kanji}`;
    }

    private canApplyNewTabKanjiImmersion(body: HTMLElement, kanji: string): boolean {
        return body.isConnected && this.isCurrentRevealedKanji(kanji);
    }

    private async parseNewTabKanjiImmersionExample(immersion: HTMLElement, card: JPDBCard): Promise<void> {
        const generation = this.immersionPrefetchGeneration;
        await Promise.resolve(this.deps.parseContent?.(immersion, newTabShortParseOptions())).catch(() => undefined);
        if (!this.current() || generation !== this.immersionPrefetchGeneration || !immersion.isConnected) return;
        this.deps.sentences.highlight(immersion, '[data-immersion-sentence-render]', card);
    }

    private renderNewTabKanjiImmersionCard(card: JPDBCard, example: ImmersionKitExample, index: number, total: number): HTMLElement {
        return this.renderNewTabImmersionCardVariant(card, example, index, total, 'kanji');
    }
}

// A card's usable examples stay fixed for the session (bounded, and cleared on reset,
// context change or online recovery), as in v1.9.3: the example revealed on the back
// is the one prepared and prefetched for the front. Only an empty answer expires,
// quickly when a failure may explain it (ADR-0013).
function acquisitionExpiry(result: ImmersionSearchResult): number {
    if (result.examples.length) return Infinity;
    return Date.now() + (result.status === 'partial' ? 1_000 : 10_000);
}

/** Shared acquisition only: no mount, cursor, listeners or media ownership. */
class StudyExampleQueries {
    private disposed = false;
    private immersionCache = new BoundedMap<string, { promise: Promise<ImmersionSearchResult>; expiresAt: number }>(NEW_TAB_IMMERSION_CACHE_LIMIT);
    constructor(private readonly deps: StudyExamplesDependencies) {}
    reset(): void { this.immersionCache.clear(); }
    dispose(): void { this.disposed = true; this.reset(); }
    validUntil(card: JPDBCard): number { return this.immersionCache.get(this.immersionCacheKey(card))?.expiresAt ?? Infinity; }
    acquire(card: JPDBCard): Promise<ImmersionSearchResult> {
        if (this.disposed) return Promise.reject(new Error('Study examples disposed.'));
        const key = this.immersionCacheKey(card);
        const existing = this.immersionCache.get(key);
        if (existing && existing.expiresAt > Date.now()) return existing.promise;
        const entry = { promise: Promise.resolve({ examples: [], status: 'complete' } as ImmersionSearchResult), expiresAt: Infinity };
        entry.promise = promiseWithTimeout(
            this.fetchNewTabImmersionExamples(card),
            AUDIO_REQUEST_TIMEOUT_MS + NEW_TAB_IMMERSION_LOAD_TIMEOUT_GRACE_MS,
            'Immersion Kit examples timed out.',
        ).then(result => { entry.expiresAt = acquisitionExpiry(result); return result; })
            .catch(error => { entry.expiresAt = Date.now() + 1_000; throw error; });
        this.immersionCache.set(key, entry);
        return entry.promise;
    }

    private async fetchNewTabImmersionExamples(card: JPDBCard): Promise<ImmersionSearchResult> {
        const context = this.searchContext();
        const exactQuery = card.spelling.trim();
        const exactExamples = await this.searchNewTabImmersionQuery(exactQuery);
        this.assertSearchContext(context);
        if (exactExamples.examples.length) return exactExamples;

        const cheapFallback = await this.searchFirstNewTabImmersionQuery(this.cheapNewTabImmersionFallbackQueries(card, exactQuery));
        this.assertSearchContext(context);
        if (cheapFallback.examples.length) return { ...cheapFallback, status: exactExamples.status === 'partial' ? 'partial' : cheapFallback.status };

        const expensive = await this.expensiveNewTabImmersionFallbackQueries(card, exactQuery);
        this.assertSearchContext(context);
        const result = await this.searchFirstNewTabImmersionQuery(expensive.queries);
        return { ...result, status: [exactExamples, cheapFallback, expensive, result].some(outcome => outcome.status === 'partial') ? 'partial' : 'complete' };
    }

    private async searchFirstNewTabImmersionQuery(queries: string[]): Promise<ImmersionSearchResult> {
        const context = this.searchContext();
        let partial = false;
        for (const query of queries) {
            this.assertSearchContext(context);
            const examples = await this.searchNewTabImmersionQuery(query);
            this.assertSearchContext(context);
            partial ||= examples.status === 'partial';
            if (examples.examples.length) return { ...examples, status: partial ? 'partial' : 'complete' };
        }
        return { examples: [], status: partial ? 'partial' : 'complete' };
    }

    private searchNewTabImmersionQuery(query: string): Promise<ImmersionSearchResult> {
        if (!query) return Promise.resolve({ examples: [], status: 'complete' });
        const settings = this.deps.getSettings();
        const options = this.newTabImmersionSearchOptions(settings);
        const request = this.deps.immersionKit.searchResult(query, settings, options);
        return request.then(result => ({ ...result, examples: accurateNewTabImmersionExamples(query, result.examples) }));
    }

    searchContext(): string {
        const settings = this.deps.getSettings();
        return JSON.stringify([settings.immersionKitEnabled,
            sensitiveFingerprint(settings.nadeshikoApiKey), sensitiveFingerprint(settings.apiKey), sensitiveFingerprint(settings.corsProxyUrl),
            settings.immersionKitExampleSource,
            settings.immersionKitLimitEnabled, settings.immersionKitLimit, settings.jpdbDefinitionsEnabled]);
    }

    assertSearchContext(context: string): void {
        if (this.disposed || context !== this.searchContext()) throw new Error('Study example context changed.');
    }

    private newTabImmersionSearchOptions(settings: ReaderSettings): ImmersionKitSearchOptions {
        const resultLimit = this.newTabImmersionResultLimit(settings);
        return {
            requestLimit: NEW_TAB_IMMERSION_SEARCH_REQUEST_LIMIT,
            resultLimit,
            fastFirst: true,
        };
    }

    private newTabImmersionResultLimit(settings: ReaderSettings): number {
        return settings.immersionKitLimitEnabled
            ? settings.immersionKitLimit
            : NEW_TAB_IMMERSION_EXAMPLE_LIMIT;
    }

    private cheapNewTabImmersionFallbackQueries(card: JPDBCard, exactQuery: string): string[] {
        const candidates: string[] = [];
        this.addNewTabImmersionFallbackQuery(candidates, newTabCardOptionalReading(card), exactQuery);
        this.addNewTabImmersionFallbackQueries(candidates, card.fallbackLookupTerms ?? [], exactQuery);
        this.addNewTabImmersionFallbackQueries(candidates, immersionFallbackFragments(card.spelling), exactQuery);
        return uniqueImmersionQueries(candidates).slice(0, IMMERSION_FALLBACK_QUERY_LIMIT);
    }

    private async expensiveNewTabImmersionFallbackQueries(card: JPDBCard, exactQuery: string): Promise<{ queries: string[]; status: ImmersionSearchResult['status'] }> {
        const candidates: string[] = [];
        let status: ImmersionSearchResult['status'] = 'complete';
        for (const discover of [
            () => this.addNewTabParsedImmersionFallbackQueries(candidates, card, exactQuery),
            () => this.addNewTabJpdbImmersionFallbackQueries(candidates, card, exactQuery),
        ]) {
            try { if (await discover() === 'partial') status = 'partial'; }
            catch { status = 'partial'; }
        }
        return { queries: uniqueImmersionQueries(candidates).slice(0, IMMERSION_FALLBACK_QUERY_LIMIT), status };
    }

    private async addNewTabJpdbImmersionFallbackQueries(candidates: string[], card: JPDBCard, exactQuery: string): Promise<ImmersionSearchResult['status'] | void> {
        if (!usesJapaneseProviders()) return;
        const settings = this.deps.getSettings();
        const result = settings.jpdbDefinitionsEnabled && hasJpdbApiCredential(settings) && this.deps.jpdbVocabulary
            ? await this.deps.jpdbVocabulary.lookup(card.vid, card.spelling, newTabCardReading(card))
            : null;
        if (!usesJapaneseProviders()) return;
        this.addNewTabImmersionFallbackQueries(
            candidates,
            (result?.info?.compounds ?? []).flatMap(compound => [compound.term, compound.reading]),
            exactQuery,
        );
        return result?.status;
    }

    private async addNewTabParsedImmersionFallbackQueries(candidates: string[], card: JPDBCard, exactQuery: string): Promise<void> {
        if (!this.deps.parser.canParse()) return;
        const targetLanguage = activeLearningTargetLanguage();
        const [tokens] = await this.deps.parser.parse([card.spelling], {
            ...newTabShortParseOptions(),
            allowJpdbTimeoutFallback: true,
            allowSegmentedFallback: true,
            skipApi: !usesJapaneseProviders(),
        });
        if (activeLearningTargetLanguage() !== targetLanguage) return;
        for (const token of tokens ?? []) {
            this.addNewTabImmersionFallbackQuery(candidates, token.card.spelling, exactQuery);
            this.addNewTabImmersionFallbackQuery(candidates, card.spelling.slice(token.start, token.end), exactQuery);
            this.addNewTabImmersionFallbackQuery(candidates, newTabCardOptionalReading(token.card), exactQuery);
        }
    }

    private addNewTabImmersionFallbackQueries(candidates: string[], values: Iterable<string>, exactQuery: string): void {
        for (const value of values) this.addNewTabImmersionFallbackQuery(candidates, value, exactQuery);
    }

    private addNewTabImmersionFallbackQuery(candidates: string[], value: string, exactQuery: string): void {
        const query = value.trim();
        if (isUsefulImmersionFallbackQuery(query, exactQuery)) candidates.push(query);
    }

    private immersionCacheKey(card: JPDBCard): string {
        const settings = this.deps.getSettings();
        return JSON.stringify({
            query: card.spelling.trim(),
            fallback: card.fallbackLookupTerms ?? [],
            context: this.searchContext(),
            reading: newTabCardOptionalReading(card),
            requestLimit: NEW_TAB_IMMERSION_SEARCH_REQUEST_LIMIT,
            resultLimit: this.newTabImmersionResultLimit(settings),
        });
    }

}

import { escapeHtml, renderHighlightedTextHtml, renderTokensToHtml, setInnerHtml } from './dom';
import { AudioPlayer } from './audio';
import { ImmersionKitClient, type ImmersionKitExample } from './immersion-kit';
import { immersionSentenceContainsQuery, shouldRequireOriginalSurfaceMatch } from './immersion-query';
import { JpdbKanjiClient } from './jpdb-kanji';
import { Logger } from './logger';
import { immersionContextFromExample, loadMiningContext, saveMiningContext } from './mining-context';
import { createPageMediaUrl, revokePageMediaUrl } from './page-media-url';
import { speakerIcon } from './popup-render';
import { RtkClient, type RtkInfo } from './rtk';
import { gmStorageDelete, gmStorageDeleteSync, gmStorageGet, gmStorageGetSync, gmStorageSet, gmStorageSetSync } from './storage';
import type { JPDBToken, ReaderSettings } from './types';
import { getUserscriptHttpRequest } from './userscript';
import { YomitanDictionaryStore, type YomitanTermEntry } from './yomitan';
import { findDoodleCanvasMount, findDoodlePreviewMount, installDoodle, type DoodleRoot } from './jpdb-doodle';
import { renderJpdbDictionarySupplement, renderLocalDictionaryPanel, renderRtkPanel } from './jpdb-panel-render';
import { KANJI_STROKE_SOURCE_ID } from './source-sections';
import {
    currentAudioTargets,
    currentJpdbTermTarget,
    currentLocalDictionaryTargets,
    currentReviewCardState,
    dictionaryPreferencePriority,
    extractCurrentKanji,
    isJpdbHost,
    isKanjiPage,
    isKanjiReviewBack,
    isKanjiReviewFront,
    isReviewAnswer,
    isReviewPage,
    jpdbAudioCard,
    localDictionaryEntryKey,
    localDictionaryLookupVariants,
    uniqueLocalDictionaryEntries,
    type JpdbTermTarget,
    type LocalDictionaryTarget,
} from './jpdb-page-targets';
import { canonicalUchisenUrl, cleanText, decodeEntities, firstReviewGlyph, kanjiVgUrl, reviewItemsLeftCount } from './jpdb-text';

export { parseJpdbReviewCardValue } from './jpdb-page-targets';

const ROOT_ATTR = 'data-yomu-jpdb-addon';
const JPDB_KANJI_ID = 'yomu-jpdb-kanji-info';
const UCHISEN_ID = 'yomu-jpdb-uchisen';
const RTK_ID = 'yomu-jpdb-rtk';
const IMMERSION_ID = 'yomu-jpdb-immersion';
const TERM_ADDONS_ID = 'yomu-jpdb-term-addons';
const LOCAL_DICTIONARIES_SLOT = 'local-dictionaries';
const IMMERSION_SLOT = 'immersion';
const DOODLE_ROOT_ID = 'yomu-jpdb-doodle-root';
const DOODLE_PREVIEW_ID = 'yomu-jpdb-doodle-preview';
const DOODLE_STORAGE_KEY = 'yomu-jpdb-doodle-current-drawing';
const REVIEW_EXAMPLES_STORAGE_KEY = 'yomu-jpdb-review-examples-open';
const SOURCE_STATE_STORAGE_PREFIX = 'yomu-jpdb-source-open:';
const UCHISEN_STAR_PREFIX = 'yomu-jpdb-uchisen-star:';
const UCHISEN_INDEX_PREFIX = 'yomu-jpdb-uchisen-index:';
const log = Logger.scope('JpdbExtensions');
let immersionAddonAudio: HTMLAudioElement | undefined;
let immersionAddonAudioBlobUrl = '';
let immersionAddonAudioKey = '';
let immersionAddonAudioLoadingKey = '';
let immersionAddonAudioRequestId = 0;

function reviewNavigationMenu(): HTMLElement | null {
    return document.querySelector<HTMLElement>('.nav .menu, .menu');
}

function ensureReviewNavigationItem(menu: HTMLElement): HTMLElement {
    const item = menu.querySelector<HTMLElement>('.nav-item:first-child, a[href="/learn"], [href="/learn"]');
    if (item) return item;
    return createReviewNavigationItem(menu);
}

function createReviewNavigationItem(menu: HTMLElement): HTMLElement {
    const item = document.createElement('div');
    item.className = 'nav-item';
    item.dataset.yomuCreatedNavItem = 'true';
    menu.prepend(item);
    return item;
}

function reviewItemsLeftHtml(item: HTMLElement): string {
    const original = savedReviewNavigationHtml(item);
    const count = reviewItemsLeftCount(original);
    return count
        ? `Items left (<span class="yomu-jpdb-items-left-count">${escapeHtml(count)}</span>)`
        : 'Items left';
}

function savedReviewNavigationHtml(item: HTMLElement): string {
    const saved = item.getAttribute('data-yomu-original-html');
    if (saved) return saved;
    item.setAttribute('data-yomu-original-html', item.innerHTML);
    return item.innerHTML || item.textContent || '';
}

function immersionPanelAction(target: HTMLElement): string {
    const actionButton = target.closest<HTMLButtonElement>('[data-immersion-action],[data-yomu-immersion-action]');
    return actionButton?.dataset.immersionAction ?? actionButton?.dataset.yomuImmersionAction ?? '';
}

function immersionHoverPointerBlocked(event: MouseEvent | PointerEvent): boolean {
    const cannotHover = window.matchMedia?.('(hover: none)').matches ?? false;
    const pointerType = 'pointerType' in event ? event.pointerType : 'mouse';
    return pointerType === 'touch' || cannotHover;
}

function hasCurrentKanjiSurface(kanji: string): boolean {
    return Boolean(kanji && (isKanjiPage() || isReviewPage()));
}

function shouldRenderLocalDictionaryTarget(target: LocalDictionaryTarget, entries: YomitanTermEntry[]): boolean {
    return target.anchor.isConnected
        && Boolean(entries.length || target.compounds.length || target.examples.length);
}

export interface UchisenImage {
    url: string;
    story: string;
}

interface UchisenCarouselOptions {
    sourceAttributes?: string;
    detailsClass?: string;
    summaryClass?: string;
    bodyClass?: string;
    summaryHtml?: (index: number, total: number) => string;
}

interface JpdbImmersionPanelContext {
    container: HTMLElement;
    examples: ImmersionKitExample[];
    query: string;
    key: string;
    index: number;
    navigationRequestId: number;
    hoverAudioCanPlay: boolean;
    hoverAudioActive: boolean;
}

interface JpdbExtensionsOptions {
    getSettings: () => ReaderSettings;
    dictionaries: YomitanDictionaryStore;
    immersionKit: ImmersionKitClient;
    jpdbKanji: JpdbKanjiClient;
    rtk: RtkClient;
    audio: AudioPlayer;
    parseJapanese?: (paragraphs: string[]) => Promise<JPDBToken[][]>;
    setImmersionTranslationBlurred?: (blurred: boolean) => void;
}

export class JpdbExtensionsController {
    private observer?: MutationObserver;
    private timer?: number;
    private lastUrl = '';
    private rtkKanji = '';
    private uchisenKanji = '';
    private immersionKey = '';
    private reviewImmersionAutoPlayKey = '';
    private reviewWordAutoPlayKey = '';
    private rtkEmptyKanji = new Set<string>();
    private uchisenCleanup?: () => void;
    private uchisenEmptyKanji = new Set<string>();
    private localDictionaryKeys = new Set<string>();
    private sourceOpenOverrides = new Map<string, boolean>();

    constructor(private options: JpdbExtensionsOptions) {}

    init(): void {
        if (!isJpdbHost()) return;
        this.lastUrl = location.href;
        this.run();
        this.observer = new MutationObserver(() => {
            const urlChanged = this.lastUrl !== location.href;
            if (urlChanged) this.lastUrl = location.href;
            this.schedule(urlChanged ? 80 : 260);
        });
        this.observer.observe(document.documentElement, { childList: true, subtree: true });
        log.info('JPDB page add-ons initialized', { href: location.href });
    }

    destroy(): void {
        this.observer?.disconnect();
        window.clearTimeout(this.timer);
    }

    refresh(): void {
        if (!isJpdbHost()) return;
        this.resetSeenKeys();
        this.schedule(40);
        log.debug('JPDB page add-ons refresh scheduled');
    }

    private schedule(delay: number): void {
        window.clearTimeout(this.timer);
        this.timer = window.setTimeout(() => this.run(), delay);
    }

    private run(): void {
        const settings = this.options.getSettings();
        if (!settings.jpdbExtensionsEnabled) {
            this.removeAll();
            log.debug('JPDB page add-ons disabled; removed all add-ons');
            return;
        }
        log.debugThrottled('run', 2500, 'JPDB page add-ons scan', {
            isKanjiPage: isKanjiPage(),
            isReviewPage: isReviewPage(),
            isReviewAnswer: isReviewAnswer(),
            reviewCard: currentReviewCardState(),
        });

        this.applyReviewPageAddons(settings);
        this.renderKanjiSurfaceAddons(settings);
        this.renderReferenceAddons(settings);
        this.renderAudioAddons(settings);
        this.renderDoodleAddon(settings);
    }

    private applyReviewPageAddons(settings: ReaderSettings): void {
        document.documentElement.classList.toggle('yomu-jpdb-review-compact-nav', isReviewPage() && settings.jpdbReviewUiEnabled);
        if (settings.jpdbReviewUiEnabled) {
            this.applyReviewUiTweak();
            this.applyReviewExamplesPreference();
        }
        else this.restoreReviewUiTweak();

        if (settings.jpdbAutoRevealSentenceEnabled) this.revealAnswerSentence();
    }

    private renderKanjiSurfaceAddons(settings: ReaderSettings): void {
        const kanji = extractCurrentKanji();
        const hasKanjiSurface = hasCurrentKanjiSurface(kanji);
        removeElement(JPDB_KANJI_ID);
        this.renderUchisenIfEnabled(settings, kanji, hasKanjiSurface);
        this.renderRtkIfEnabled(settings, kanji, hasKanjiSurface);
    }

    private renderUchisenIfEnabled(settings: ReaderSettings, kanji: string, hasKanjiSurface: boolean): void {
        if (settings.jpdbUchisenEnabled && hasKanjiSurface) this.renderUchisen(kanji);
        else this.removeUchisen();
    }

    private renderRtkIfEnabled(settings: ReaderSettings, kanji: string, hasKanjiSurface: boolean): void {
        if (settings.jpdbRtkEnabled && settings.rtkEnabled && hasKanjiSurface) this.renderRtk(kanji);
        else removeElement(RTK_ID);
    }

    private renderReferenceAddons(settings: ReaderSettings): void {
        if (settings.jpdbImmersionKitEnabled && settings.immersionKitEnabled) this.renderImmersionKit();
        else removeElement(IMMERSION_ID);

        if (settings.jpdbLocalDictionariesEnabled && settings.localDictionariesEnabled) this.renderLocalDictionaries();
        else this.removeLocalDictionaries();
    }

    private renderAudioAddons(settings: ReaderSettings): void {
        if (settings.audioEnabled) this.renderAudioOffers();
        else this.removeAudioOffers();

        this.maybeAutoPlayReviewWordAudio();
    }

    private renderDoodleAddon(settings: ReaderSettings): void {
        if (settings.jpdbKanjiDoodleEnabled && (isReviewPage() || isKanjiPage())) this.renderDoodle();
        else this.removeDoodle();
    }

    private removeAll(): void {
        removeElement(JPDB_KANJI_ID);
        this.removeUchisen();
        removeElement(RTK_ID);
        removeElement(IMMERSION_ID);
        this.removeLocalDictionaries();
        this.removeAudioOffers();
        this.restoreReviewUiTweak();
        this.removeDoodle();
    }

    private resetSeenKeys(): void {
        this.rtkKanji = '';
        this.uchisenKanji = '';
        this.immersionKey = '';
        this.reviewWordAutoPlayKey = '';
        this.localDictionaryKeys.clear();
    }

    private applyReviewUiTweak(): void {
        if (!isReviewPage()) return;
        const menu = reviewNavigationMenu();
        if (!menu) return;
        const item = ensureReviewNavigationItem(menu);
        item.classList.add('nav-item');
        if (!item.hasAttribute('href')) item.setAttribute('href', '/learn');
        const desiredHtml = reviewItemsLeftHtml(item);
        if (item.innerHTML === desiredHtml) return;
        setInnerHtml(item, desiredHtml);
    }

    private applyReviewExamplesPreference(): void {
        if (!isReviewPage()) return;
        const checkbox = document.querySelector<HTMLInputElement>('#show-checkbox-examples');
        this.installReviewExamplesTracking(checkbox);
        const rememberedOpen = gmStorageGetSync<boolean | null>(REVIEW_EXAMPLES_STORAGE_KEY, null);
        if (rememberedOpen === null && this.options.getSettings().jpdbAutoRevealSentenceEnabled) {
            this.setReviewExamplesOpen(true, checkbox);
            return;
        }
        if (rememberedOpen === null) return;
        this.setReviewExamplesOpen(rememberedOpen, checkbox);
    }

    private installReviewExamplesTracking(checkbox: HTMLInputElement | null): void {
        if (checkbox && checkbox.dataset.yomuExamplesTracking !== 'true') {
            checkbox.dataset.yomuExamplesTracking = 'true';
            checkbox.addEventListener('change', () => this.rememberReviewExamplesOpen(checkbox.checked));
        }
        document.querySelectorAll<HTMLElement>('#show-checkbox-examples-label').forEach(label => {
            if (label.dataset.yomuExamplesTracking === 'true') return;
            label.dataset.yomuExamplesTracking = 'true';
            label.addEventListener('click', () => {
                window.setTimeout(() => this.rememberReviewExamplesOpen(this.areReviewExamplesOpen(checkbox)), 0);
            });
        });
    }

    private setReviewExamplesOpen(open: boolean, checkbox: HTMLInputElement | null = document.querySelector<HTMLInputElement>('#show-checkbox-examples')): void {
        if (checkbox && checkbox.checked !== open) {
            checkbox.checked = open;
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        }
        document.querySelectorAll<HTMLElement>('.hidden-body').forEach(body => {
            body.hidden = !open;
            body.style.display = open ? '' : 'none';
        });
        document.querySelectorAll<HTMLElement>('#show-checkbox-examples-label').forEach(label => {
            label.dataset.yomuExamplesVisible = String(open);
        });
    }

    private areReviewExamplesOpen(checkbox: HTMLInputElement | null): boolean {
        if (checkbox) return checkbox.checked;
        const body = document.querySelector<HTMLElement>('.hidden-body');
        if (body) return !body.hidden && body.style.display !== 'none';
        return false;
    }

    private rememberReviewExamplesOpen(open: boolean): void {
        gmStorageSetSync(REVIEW_EXAMPLES_STORAGE_KEY, open);
        log.debug('JPDB review examples open state remembered', { open });
    }

    private restoreReviewUiTweak(): void {
        document.documentElement.classList.remove('yomu-jpdb-review-compact-nav');
        document.querySelectorAll<HTMLElement>('[data-yomu-created-nav-item]').forEach(element => element.remove());
        document.querySelectorAll<HTMLElement>('[data-yomu-original-html]').forEach(element => {
            element.innerHTML = element.getAttribute('data-yomu-original-html') ?? element.innerHTML;
            element.removeAttribute('data-yomu-original-html');
        });
        document.querySelectorAll<HTMLElement>('[data-yomu-original-text]').forEach(element => {
            element.textContent = element.getAttribute('data-yomu-original-text') ?? element.textContent;
            element.removeAttribute('data-yomu-original-text');
        });
    }

    private revealAnswerSentence(): void {
        if (!isReviewAnswer()) return;
        document.querySelector<HTMLElement>('.sentence.blur')?.classList.remove('blur');
    }

    private async renderRtk(kanji: string): Promise<void> {
        if (this.clearCachedEmptyRtk(kanji)) return;
        if (this.hasCurrentRtk(kanji)) return;
        this.rtkKanji = kanji;
        removeElement(RTK_ID);

        const anchor = findKanjiSectionAnchor();
        if (!anchor) return;

        const container = this.renderRtkLoading(anchor);
        const info = await this.loadRtkInfo(kanji);
        if (!this.isCurrentRtkContainer(container, kanji)) return;
        this.renderRtkInfo(container, kanji, info);
    }

    private clearCachedEmptyRtk(kanji: string): boolean {
        if (!this.rtkEmptyKanji.has(kanji)) return false;
        this.rtkKanji = kanji;
        removeElement(RTK_ID);
        return true;
    }

    private hasCurrentRtk(kanji: string): boolean {
        return this.rtkKanji === kanji && Boolean(document.getElementById(RTK_ID));
    }

    private renderRtkLoading(anchor: HTMLElement): HTMLElement {
        const container = createAddonCard(RTK_ID, 'RTK');
        setInnerHtml(container, `
            <div class="yomu-jpdb-card-title">RTK</div>
            <div class="jpdb-reader-help">Loading story data...</div>
        `);
        insertAfter(anchor, container);
        return container;
    }

    private async loadRtkInfo(kanji: string): Promise<RtkInfo | null> {
        return this.options.rtk.lookup(kanji).catch(error => {
            log.warn('JPDB add-on RTK lookup failed', { kanji }, error);
            return null;
        });
    }

    private isCurrentRtkContainer(container: HTMLElement, kanji: string): boolean {
        return container.isConnected && this.rtkKanji === kanji;
    }

    private renderRtkInfo(container: HTMLElement, kanji: string, info: RtkInfo | null): void {
        if (!info) {
            this.rtkEmptyKanji.add(kanji);
            container.remove();
            return;
        }
        log.debug('JPDB add-on RTK rendered', { kanji });
        setInnerHtml(container, renderRtkPanel(info, !isReviewPage(), this.sourceStateAttributes(`rtk:${kanji}`, !isReviewPage())));
        this.installSourceStateTracking(container);
    }

    private async renderUchisen(kanji: string): Promise<void> {
        if (this.clearCachedEmptyUchisen(kanji)) return;
        if (this.hasCurrentUchisen(kanji)) return;
        this.uchisenKanji = kanji;
        this.removeUchisen();

        const anchor = findKanjiSectionAnchor();
        if (!anchor) return;

        const container = this.renderUchisenLoading(anchor);
        const images = await this.loadUchisenImagesForKanji(kanji);
        if (!this.isCurrentUchisenContainer(container, kanji)) return;
        await this.renderUchisenImages(container, kanji, images);
    }

    private clearCachedEmptyUchisen(kanji: string): boolean {
        if (!this.uchisenEmptyKanji.has(kanji)) return false;
        this.uchisenKanji = kanji;
        this.removeUchisen();
        return true;
    }

    private hasCurrentUchisen(kanji: string): boolean {
        return this.uchisenKanji === kanji && Boolean(document.getElementById(UCHISEN_ID));
    }

    private renderUchisenLoading(anchor: HTMLElement): HTMLElement {
        const container = createAddonCard(UCHISEN_ID, 'Uchisen');
        setInnerHtml(container, `
            <div class="yomu-jpdb-card-title">Uchisen</div>
            <div class="jpdb-reader-help">Loading mnemonic images...</div>
        `);
        insertAfter(anchor, container);
        return container;
    }

    private async loadUchisenImagesForKanji(kanji: string): Promise<UchisenImage[] | null> {
        return loadUchisenImages(kanji).catch(error => {
            log.warn('Uchisen request failed', { kanji }, error);
            return null;
        });
    }

    private isCurrentUchisenContainer(container: HTMLElement, kanji: string): boolean {
        return container.isConnected && this.uchisenKanji === kanji;
    }

    private async renderUchisenImages(container: HTMLElement, kanji: string, images: UchisenImage[] | null): Promise<void> {
        if (images === null) {
            container.remove();
            return;
        }
        if (!images.length) {
            this.uchisenEmptyKanji.add(kanji);
            log.debug('No Uchisen images found', { kanji });
            container.remove();
            return;
        }
        log.debug('Uchisen images loaded', { kanji, images: images.length });
        this.uchisenCleanup = await installUchisenCarousel(container, kanji, images, {
            sourceAttributes: this.sourceStateAttributes(`uchisen:${kanji}`, !isReviewPage()),
            detailsClass: 'jpdb-reader-local jpdb-reader-source-card yomu-jpdb-uchisen-source',
            summaryClass: 'jpdb-reader-local-title',
            bodyClass: 'jpdb-reader-local-entry yomu-jpdb-uchisen-body',
            summaryHtml: () => 'Uchisen',
        });
        this.installSourceStateTracking(container);
    }

    private removeUchisen(): void {
        this.uchisenCleanup?.();
        this.uchisenCleanup = undefined;
        removeElement(UCHISEN_ID);
    }

    private async renderImmersionKit(): Promise<void> {
        const renderTarget = this.nextImmersionKitRenderTarget();
        if (!renderTarget) return;
        const { target, key } = renderTarget;
        const container = this.renderImmersionLoadingState(target);

        const result = await this.searchImmersionExamples(target);
        if (!this.isCurrentImmersionRender(container, key)) return;
        const { examples, query } = result;
        if (!examples.length) {
            this.renderEmptyImmersionExamples(container, target);
            return;
        }
        log.debug('JPDB add-on Immersion Kit rendered', { term: target.term, query, examples: examples.length });
        this.installImmersionExamples(container, key, examples, query);
    }

    private nextImmersionKitRenderTarget(): { target: JpdbTermTarget; key: string } | null {
        const target = currentJpdbTermTarget();
        if (!target) return null;
        const key = `${location.href}:${target.term}:${target.queries.join('|')}`;
        if (this.immersionKey === key && document.getElementById(IMMERSION_ID)) return null;
        this.immersionKey = key;
        removeElement(IMMERSION_ID);
        return { target, key };
    }

    private renderImmersionLoadingState(target: JpdbTermTarget): HTMLElement {
        const container = createTermAddonContainer(IMMERSION_ID, 'Immersion Kit');
        setInnerHtml(container, `
            <div class="jpdb-reader-help">Loading examples for ${escapeHtml(target.term)}...</div>
        `);
        this.insertTermAddon(target.anchor, container, IMMERSION_SLOT);
        return container;
    }

    private isCurrentImmersionRender(container: HTMLElement, key: string): boolean {
        return container.isConnected && this.immersionKey === key;
    }

    private renderEmptyImmersionExamples(container: HTMLElement, target: JpdbTermTarget): void {
        log.debug('JPDB add-on Immersion Kit returned no examples', { term: target.term, queries: target.queries });
        setInnerHtml(container, `
            <div class="jpdb-reader-help">No examples found for ${escapeHtml(target.term)}.</div>
        `);
    }

    private installImmersionExamples(container: HTMLElement, key: string, examples: ImmersionKitExample[], query: string): void {
        const context: JpdbImmersionPanelContext = {
            container,
            examples,
            query,
            key,
            index: savedImmersionIndex(query, examples.length),
            navigationRequestId: 0,
            hoverAudioCanPlay: false,
            hoverAudioActive: false,
        };
        requestAnimationFrame(() => {
            context.hoverAudioCanPlay = !container.matches(':hover');
        });
        this.installImmersionPanelEvents(context);
        this.renderImmersionContext(context);
        this.parseRenderedImmersionSentence(context, context.index);
        this.installSourceStateTracking(container);
        this.maybeAutoPlayReviewImmersionAudio(context);
    }

    private renderImmersionContext(context: JpdbImmersionPanelContext, prefetchedImageSrc?: string | null): void {
        renderImmersionPanel(
            context.container,
            context.examples,
            context.index,
            context.query,
            this.options.immersionKit,
            this.options.getSettings(),
            this.sourceStateAttributes(`immersion:${context.query}`),
            prefetchedImageSrc,
        );
    }

    private parseRenderedImmersionSentence(context: JpdbImmersionPanelContext, expectedIndex: number): void {
        if (!this.options.parseJapanese) return;
        if (!this.options.getSettings().jpdbPageParsingEnabled) return;
        const sentence = context.examples[expectedIndex]?.sentence;
        if (!sentence) return;
        void this.options.parseJapanese([sentence])
            .then(([tokens]) => this.applyParsedImmersionSentence(context, expectedIndex, sentence, tokens ?? []))
            .catch(error => log.debug('JPDB add-on Immersion example parse failed quietly', { term: context.query }, error));
    }

    private applyParsedImmersionSentence(
        context: JpdbImmersionPanelContext,
        expectedIndex: number,
        sentence: string,
        tokens: JPDBToken[],
    ): void {
        if (!context.container.isConnected || context.index !== expectedIndex) return;
        const sentenceElement = context.container.querySelector<HTMLElement>('[data-yomu-immersion-sentence-render]');
        if (!sentenceElement) return;
        setInnerHtml(sentenceElement, renderTokensToHtml(sentence, tokens, this.options.getSettings()));
        highlightImmersionTerm(sentenceElement, context.query);
    }

    private installImmersionPanelEvents(context: JpdbImmersionPanelContext): void {
        context.container.addEventListener('click', event => this.handleImmersionPanelClick(event, context));
        context.container.addEventListener('keydown', event => this.handleImmersionPanelKeydown(event, context));
        this.installImmersionHoverAudio(context);
    }

    private handleImmersionPanelClick(event: MouseEvent, context: JpdbImmersionPanelContext): void {
        if (this.toggleImmersionTranslationFromEvent(event, context.container)) return;
        const target = event.target as HTMLElement;
        const action = immersionPanelAction(target);
        const media = target.closest<HTMLElement>('.jpdb-reader-example-media');
        if (!shouldHandleImmersionPanelMediaClick(action, media, this.options.getSettings().immersionKitPlayOnImageClick)) return;
        event.preventDefault();
        if (shouldPlayImmersionPanelAudio(action)) {
            this.playImmersionContextAudio(context);
            return;
        }
        this.navigateImmersionContext(context, action);
    }

    private toggleImmersionTranslationFromEvent(event: Event, container: HTMLElement): boolean {
        const translation = (event.target as HTMLElement).closest<HTMLElement>('.jpdb-reader-example-translation');
        if (!translation) return false;
        event.preventDefault();
        toggleJpdbPageTranslationBlur(container, this.options);
        return true;
    }

    private navigateImmersionContext(context: JpdbImmersionPanelContext, action: string): void {
        const nextIndex = action === 'previous'
            ? (context.index - 1 + context.examples.length) % context.examples.length
            : (context.index + 1) % context.examples.length;
        const requestId = ++context.navigationRequestId;
        void preloadImmersionImage(context.examples[nextIndex], this.options.immersionKit, this.options.getSettings())
            .then(prefetchedImageSrc => this.renderNavigatedImmersionContext(context, requestId, nextIndex, prefetchedImageSrc));
    }

    private renderNavigatedImmersionContext(
        context: JpdbImmersionPanelContext,
        requestId: number,
        nextIndex: number,
        prefetchedImageSrc?: string | null,
    ): void {
        if (!context.container.isConnected || requestId !== context.navigationRequestId) return;
        context.index = nextIndex;
        this.renderImmersionContext(context, prefetchedImageSrc);
        this.parseRenderedImmersionSentence(context, context.index);
        if (this.options.getSettings().immersionKitAutoPlayAudio) this.playImmersionContextAudio(context);
    }

    private handleImmersionPanelKeydown(event: KeyboardEvent, context: JpdbImmersionPanelContext): void {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        this.toggleImmersionTranslationFromEvent(event, context.container);
    }

    private installImmersionHoverAudio(context: JpdbImmersionPanelContext): void {
        const handleImageHover = (event: MouseEvent | PointerEvent) => this.handleImmersionImageHover(event, context);
        context.container.addEventListener('pointerover', handleImageHover);
        context.container.addEventListener('mouseover', handleImageHover);
        context.container.addEventListener('pointerleave', () => this.resetImmersionHoverAudio(context));
        context.container.addEventListener('mouseleave', () => this.resetImmersionHoverAudio(context));
    }

    private handleImmersionImageHover(event: MouseEvent | PointerEvent, context: JpdbImmersionPanelContext): void {
        const media = (event.target as HTMLElement).closest?.('.jpdb-reader-example-media');
        if (!this.shouldPlayImmersionHoverAudio(event, context, media)) return;
        context.hoverAudioActive = true;
        playExampleAudio(context.examples[context.index], this.options.immersionKit, this.options.getSettings(), () =>
            context.hoverAudioActive
            && context.container.isConnected
            && media.isConnected
            && media.matches(':hover'));
    }

    private shouldPlayImmersionHoverAudio(
        event: MouseEvent | PointerEvent,
        context: JpdbImmersionPanelContext,
        media: Element | null,
    ): media is HTMLElement {
        if (!media || !context.hoverAudioCanPlay || !this.options.getSettings().immersionKitPlayOnHover) return false;
        if (immersionHoverPointerBlocked(event)) return false;
        return !media.contains(event.relatedTarget as Node | null);
    }

    private resetImmersionHoverAudio(context: JpdbImmersionPanelContext): void {
        context.hoverAudioCanPlay = true;
        context.hoverAudioActive = false;
    }

    private playImmersionContextAudio(context: JpdbImmersionPanelContext): void {
        playExampleAudio(context.examples[context.index], this.options.immersionKit, this.options.getSettings());
    }

    private maybeAutoPlayReviewImmersionAudio(context: JpdbImmersionPanelContext): void {
        const settings = this.options.getSettings();
        const autoPlayKey = `${context.key}:${context.index}`;
        if (settings.jpdbImmersionKitAutoPlayReviewAudio && !settings.jpdbWordAudioAutoPlayReviewAudio && isReviewAnswer() && this.reviewImmersionAutoPlayKey !== autoPlayKey) {
            this.reviewImmersionAutoPlayKey = autoPlayKey;
            playExampleAudio(context.examples[context.index], this.options.immersionKit, settings);
        }
    }

    private maybeAutoPlayReviewWordAudio(): void {
        const settings = this.options.getSettings();
        if (!settings.audioEnabled || !settings.jpdbWordAudioAutoPlayReviewAudio || !isReviewAnswer()) return;
        const target = currentJpdbTermTarget();
        if (!target?.term) return;
        const key = `${location.href}:${target.term}:${target.reading}`;
        if (this.reviewWordAutoPlayKey === key) return;
        this.reviewWordAutoPlayKey = key;
        clearImmersionAddonAudio();
        void this.playYomuAudio(target.term, target.reading);
    }

    private async renderLocalDictionaries(): Promise<void> {
        const targets = currentLocalDictionaryTargets();
        const settings = this.options.getSettings();
        for (const target of targets) {
            await this.renderLocalDictionaryTarget(target, settings);
        }
    }

    private async renderLocalDictionaryTarget(target: LocalDictionaryTarget, settings: ReaderSettings): Promise<void> {
        const key = `${location.pathname}:${target.term}:${target.reading}`;
        if (this.hasRenderedLocalDictionaryTarget(target, key)) return;
        this.localDictionaryKeys.add(key);
        this.removeLocalDictionaryTargetNodes(target, key);
        const entries = await this.lookupLocalDictionaryEntries(target, settings);
        if (!shouldRenderLocalDictionaryTarget(target, entries)) return;
        const container = this.createLocalDictionaryContainer(target, entries, settings, key);
        this.installSourceStateTracking(container);
        this.insertTermAddon(target.anchor, container, LOCAL_DICTIONARIES_SLOT);
        log.debug('JPDB add-on local dictionaries rendered', { term: target.term, entries: entries.length });
    }

    private hasRenderedLocalDictionaryTarget(target: LocalDictionaryTarget, key: string): boolean {
        return this.localDictionaryKeys.has(key)
            && Boolean(target.anchor.parentElement?.querySelector(`[data-yomu-local-key="${cssEscape(key)}"]`));
    }

    private removeLocalDictionaryTargetNodes(target: LocalDictionaryTarget, key: string): void {
        target.anchor.parentElement
            ?.querySelectorAll<HTMLElement>(`[data-yomu-local-key="${cssEscape(key)}"]`)
            .forEach(node => node.remove());
    }

    private createLocalDictionaryContainer(target: LocalDictionaryTarget, entries: YomitanTermEntry[], settings: ReaderSettings, key: string): HTMLElement {
        const container = createTermAddonContainer('', 'Imported dictionaries');
        container.classList.add('yomu-jpdb-local-dictionaries');
        container.dataset.yomuLocalKey = key;
        setInnerHtml(container, `
            ${renderJpdbDictionarySupplement(
            target.compounds,
            target.examples,
            this.sourceStateAttributes(`dictionary:jpdb:${target.term}`),
            this.sourceStateAttributes(`dictionary:jpdb:${target.term}:examples`),
        )}
            ${renderLocalDictionaryPanel(
            entries,
            settings,
            dictionary => this.sourceStateAttributes(`dictionary:${dictionary}`),
        )}
        `);
        return container;
    }

    private async searchImmersionExamples(target: JpdbTermTarget): Promise<{ examples: ImmersionKitExample[]; query: string }> {
        const requireOriginalSurface = shouldRequireOriginalSurfaceMatch(target.term);
        const pageExamples = jpdbPageExamplesToImmersionKit(target);
        for (const query of target.queries) {
            const examples = await this.options.immersionKit.search(query, this.options.getSettings()).catch(error => {
                log.warn('JPDB add-on Immersion Kit search failed', { term: target.term, query }, error);
                return [];
            });
            const accurateExamples = requireOriginalSurface
                ? examples.filter(example => immersionSentenceContainsQuery(example.sentence, target.term))
                : examples;
            if (accurateExamples.length) return { examples: accurateExamples, query };
            if (query === target.term && pageExamples.length) return { examples: pageExamples, query: target.term };
        }
        return { examples: pageExamples, query: target.term };
    }

    private async lookupLocalDictionaryEntries(target: LocalDictionaryTarget, settings: ReaderSettings): Promise<YomitanTermEntry[]> {
        const limit = Math.min(settings.localDictionaryMaxResults, 8);
        const variants = localDictionaryLookupVariants(target);
        const entries: YomitanTermEntry[] = [];
        const variantRank = new Map<string, number>();

        for (let index = 0; index < variants.length; index++) {
            const variant = variants[index];
            const found = await this.options.dictionaries
                .lookup(variant.term, variant.reading, limit, settings.dictionaryPreferences)
                .catch(error => {
                    log.warn('JPDB add-on local dictionary lookup failed', { term: variant.term, reading: variant.reading, original: target.term }, error);
                    return [];
                });
            for (const entry of found) {
                entries.push(entry);
                const key = localDictionaryEntryKey(entry);
                variantRank.set(key, Math.min(variantRank.get(key) ?? index, index));
            }
        }

        return uniqueLocalDictionaryEntries(entries)
            .sort((a, b) =>
                dictionaryPreferencePriority(a.dictionary, settings) - dictionaryPreferencePriority(b.dictionary, settings)
                || (variantRank.get(localDictionaryEntryKey(a)) ?? 999) - (variantRank.get(localDictionaryEntryKey(b)) ?? 999)
                || (b.score ?? 0) - (a.score ?? 0),
            )
            .slice(0, limit);
    }

    private removeLocalDictionaries(): void {
        this.localDictionaryKeys.clear();
        document.querySelectorAll<HTMLElement>('.yomu-jpdb-local-dictionaries').forEach(node => node.remove());
        pruneEmptyTermAddonMount();
    }

    private insertTermAddon(anchor: HTMLElement, container: HTMLElement, slotName: string): void {
        if (!isKanjiPage()) {
            insertAfter(anchor, container);
            return;
        }
        const slot = ensureTermAddonSlot(slotName);
        if (!slot) {
            insertAfter(anchor, container);
            return;
        }
        slot.replaceChildren(container);
    }

    private renderAudioOffers(): void {
        for (const target of currentAudioTargets()) {
            if (target.link.parentElement?.querySelector('.yomu-jpdb-audio-button')) continue;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'yomu-jpdb-audio-button';
            button.dataset.term = target.term;
            button.dataset.reading = target.reading;
            button.title = 'Play alternate audio';
            button.setAttribute('aria-label', `Play alternate audio for ${target.term}`);
            setInnerHtml(button, speakerIcon());
            button.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                void this.playYomuAudio(target.term, target.reading);
            });
            target.link.insertAdjacentElement('afterend', button);
        }
    }

    private removeAudioOffers(): void {
        document.querySelectorAll<HTMLElement>('.yomu-jpdb-audio-button').forEach(node => node.remove());
    }

    private async playYomuAudio(term: string, reading: string): Promise<void> {
        const card = jpdbAudioCard(term, reading);
        try {
            await this.options.audio.play(card);
            log.debug('JPDB page Yomu audio started', { term });
        } catch (error) {
            log.warn('JPDB page Yomu audio failed', { term }, error);
        }
    }

    private sourceStateAttributes(key: string, fallback = this.options.getSettings().dictionarySourcesInitiallyExpanded): string {
        return `data-yomu-source-state-key="${escapeHtml(key)}"${this.isSourceOpen(key, fallback) ? ' open' : ''}`;
    }

    private isSourceOpen(key: string, fallback: boolean): boolean {
        return this.sourceOpenOverrides.get(key) ?? storageGetBooleanSync(`${SOURCE_STATE_STORAGE_PREFIX}${key}`, fallback);
    }

    private installSourceStateTracking(root: HTMLElement): void {
        if (root.dataset.yomuSourceTracking === 'true') return;
        root.dataset.yomuSourceTracking = 'true';
        root.addEventListener('toggle', event => {
            const details = event.target instanceof HTMLDetailsElement ? event.target : null;
            const key = details?.dataset.yomuSourceStateKey ?? details?.dataset.sourceStateKey;
            if (!details || !key) return;
            this.sourceOpenOverrides.set(key, details.open);
            storageSetSync(`${SOURCE_STATE_STORAGE_PREFIX}${key}`, details.open);
            log.debug('JPDB add-on source open state remembered', { key, open: details.open });
        }, true);
    }

    private renderDoodle(): void {
        if (isKanjiReviewFront()) {
            removeElement(DOODLE_PREVIEW_ID);
            this.installDoodleCanvas();
            return;
        }
        if (isKanjiReviewBack()) {
            this.removeDoodleCanvas();
            this.installDoodlePreview();
            return;
        }
        this.removeDoodle();
    }

    private installDoodleCanvas(): void {
        const glyph = this.currentDoodleGlyph();
        const existing = document.getElementById(DOODLE_ROOT_ID);
        if (this.canReuseDoodleCanvas(existing, glyph)) return;
        if (existing) this.removeDoodleCanvas();
        const mount = findDoodleCanvasMount();
        if (!mount) return;

        const root = this.createDoodleCanvasRoot(glyph);
        this.mountDoodleCanvasRoot(mount, root);
        this.installSourceStateTracking(root);
        installDoodle(root, glyph, {
            storageKey: DOODLE_STORAGE_KEY,
            loadGhostSvg: item => requestText(kanjiVgUrl(item), 5000),
            autograde: this.options.getSettings().jpdbKanjiAutogradeEnabled,
        });
    }

    private currentDoodleGlyph(): string {
        return extractCurrentKanji() || firstReviewGlyph(document.body.textContent || '') || '';
    }

    private canReuseDoodleCanvas(existing: HTMLElement | null, glyph: string): boolean {
        return existing?.dataset.yomuDoodleMode === 'review' && existing.dataset.kanji === glyph;
    }

    private createDoodleCanvasRoot(glyph: string): HTMLElement {
        const root = createAddonCard(DOODLE_ROOT_ID, 'doodle');
        root.setAttribute(ROOT_ATTR, 'doodle');
        root.dataset.yomuDoodleMode = 'review';
        root.dataset.kanji = glyph;
        const sourceAttributes = this.sourceStateAttributes(`kanji:${KANJI_STROKE_SOURCE_ID}`, true);
        setInnerHtml(root, `
            <details class="jpdb-reader-local jpdb-reader-source-card yomu-jpdb-doodle-source" ${sourceAttributes}>
                <summary class="jpdb-reader-local-title">Stroke practice</summary>
                <div class="jpdb-reader-local-entry yomu-jpdb-doodle-body">
                    <div class="yomu-doodle-stage">
                        <div class="yomu-doodle-ghost" aria-hidden="true">${escapeHtml(glyph)}</div>
                        <canvas class="yomu-doodle-canvas" aria-label="Kanji drawing pad"></canvas>
                    </div>
                    <div class="yomu-jpdb-toolbar">
                        <button class="jpdb-reader-btn" type="button" data-doodle-clear>Clear</button>
                        <button class="jpdb-reader-btn" type="button" data-doodle-ghost>Ghost: On</button>
                    </div>
                    <div class="yomu-doodle-result" data-doodle-result aria-live="polite"></div>
                </div>
            </details>
        `);
        return root;
    }

    private mountDoodleCanvasRoot(mount: HTMLElement, root: HTMLElement): void {
        mount.querySelector<HTMLElement>(':scope > .hbox')?.insertAdjacentElement('afterend', root);
        if (!root.isConnected) mount.querySelector<HTMLElement>('.yomu-jpdb-addon-card')?.before(root);
        if (!root.isConnected) mount.appendChild(root);
    }

    private removeDoodleCanvas(): void {
        const root = document.getElementById(DOODLE_ROOT_ID) as DoodleRoot | null;
        root?.__yomuDoodle?.cleanup.forEach(fn => fn());
        root?.__yomuDoodle?.resizeObserver?.disconnect();
        root?.remove();
    }

    private installDoodlePreview(): void {
        if (document.getElementById(DOODLE_PREVIEW_ID)) return;
        const drawing = gmStorageGetSync<string | null>(DOODLE_STORAGE_KEY, null);
        if (!drawing) return;
        const mount = findDoodlePreviewMount();
        if (!mount) return;
        const preview = document.createElement('div');
        preview.id = DOODLE_PREVIEW_ID;
        preview.setAttribute(ROOT_ATTR, 'doodle-preview');
        preview.innerHTML = `
            <img src="${escapeHtml(drawing)}" alt="Your kanji drawing">
        `;
        if (mount.matches('a.kanji.plain, .kanji.plain')) mount.insertAdjacentElement('afterend', preview);
        else mount.appendChild(preview);
        gmStorageDeleteSync(DOODLE_STORAGE_KEY);
    }

    private removeDoodle(): void {
        this.removeDoodleCanvas();
        removeElement(DOODLE_PREVIEW_ID);
    }
}

export function parseUchisenImages(html: string): UchisenImage[] {
    if (!html.trim()) return [];
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const images: UchisenImage[] = [];
    const mainImage = mainUchisenImageUrl(doc);
    const mainStory = cleanText(doc.querySelector('#mnemonic_story')?.textContent ?? '');
    if (mainImage) images.push({ url: canonicalUchisenUrl(mainImage), story: mainStory || 'No story available' });

    doc.querySelectorAll<HTMLElement>('.mnemonic_card').forEach(card => {
        const image = uchisenCardImage(card, mainStory);
        if (image) images.push(image);
    });

    const seen = new Set<string>();
    return images.filter(item => {
        if (!item.url || seen.has(item.url)) return false;
        seen.add(item.url);
        return true;
    });
}

function mainUchisenImageUrl(doc: Document): string {
    const mainLoader = doc.querySelector<HTMLElement>('.kanji_image_loader[data-large]');
    return mainLoader?.getAttribute('data-large')
        || doc.querySelector<HTMLImageElement>('#full_kanji_image')?.getAttribute('src')
        || '';
}

function uchisenCardImage(card: HTMLElement, mainStory: string): UchisenImage | null {
    const rawUrl = card.querySelector<HTMLInputElement>('input.image_url')?.value.trim() ?? '';
    if (!rawUrl) return null;
    return {
        url: canonicalUchisenUrl(rawUrl),
        story: uchisenCardStory(card, mainStory),
    };
}

function uchisenCardStory(card: HTMLElement, mainStory: string): string {
    const rawStory = card.querySelector<HTMLInputElement>('input.story')?.value ?? '';
    const story = cleanText(decodeEntities(rawStory).replace(/<[^>]+>/g, ' '));
    return story || mainStory || 'No story available';
}

export async function loadUchisenImages(kanji: string): Promise<UchisenImage[]> {
    const html = await requestText(`https://uchisen.com/kanji/${encodeURIComponent(kanji)}`, 9000);
    return parseUchisenImages(html);
}

export async function installUchisenCarousel(
    container: HTMLElement,
    kanji: string,
    images: UchisenImage[],
    options: UchisenCarouselOptions = {},
): Promise<() => void> {
    let index = await storageGet(`${UCHISEN_INDEX_PREFIX}${kanji}`, 0);
    const starred = await storageGet<string | null>(`${UCHISEN_STAR_PREFIX}${kanji}`, null);
    const starredIndex = starred ? images.findIndex(item => item.url === starred) : -1;
    if (starredIndex >= 0) index = starredIndex;
    if (!Number.isFinite(index) || index < 0 || index >= images.length) index = 0;

    let currentStarred = starred;
    let currentImageUrl = '';
    const cleanup = () => {
        if (!currentImageUrl) return;
        revokePageMediaUrl(currentImageUrl);
        currentImageUrl = '';
    };
    const render = () => {
        const item = images[index];
        const isStarred = currentStarred === item.url;
        const detailsClass = options.detailsClass ?? 'jpdb-reader-local-entry jpdb-reader-dictionary-group yomu-jpdb-uchisen-source';
        const summaryClass = options.summaryClass ?? 'jpdb-reader-local-head';
        const bodyClass = options.bodyClass ?? 'jpdb-reader-local-glossary yomu-jpdb-uchisen-body';
        const sourceAttributes = options.sourceAttributes ?? 'open';
        const summaryHtml = options.summaryHtml?.(index + 1, images.length) ?? `
                    <span>Uchisen</span>
                    <span class="yomu-jpdb-counter">${index + 1}/${images.length}</span>
                `;
        const bodyMeta = options.summaryHtml ? `<div class="yomu-jpdb-source-meta">${index + 1}/${images.length}</div>` : '';
        setInnerHtml(container, `
            <details class="${detailsClass}" ${sourceAttributes}>
                <summary class="${summaryClass}">${summaryHtml}</summary>
                <div class="${bodyClass}">
                    ${bodyMeta}
                    <div class="yomu-jpdb-toolbar" role="toolbar" aria-label="Uchisen mnemonic images">
                        <button class="jpdb-reader-icon-mini" type="button" data-uchisen-action="previous" title="Previous">‹</button>
                        <button class="jpdb-reader-icon-mini" type="button" data-uchisen-action="next" title="Next">›</button>
                        <button class="jpdb-reader-icon-mini" type="button" data-uchisen-action="star" title="Favorite">${isStarred ? '★' : '☆'}</button>
                        <a href="https://uchisen.com/kanji/${encodeURIComponent(kanji)}" target="_blank" rel="noopener">Open</a>
                    </div>
                    <div class="yomu-jpdb-image-shell"><img alt="Uchisen mnemonic for ${escapeHtml(kanji)}" data-uchisen-image></div>
                    <div class="yomu-jpdb-story">${escapeHtml(item.story || 'No story available')}</div>
                </div>
            </details>
        `);
        const image = container.querySelector<HTMLImageElement>('[data-uchisen-image]');
        if (!image) return;
        const srcUrl = item.url;
        requestBlobUrl(srcUrl, 9000)
            .then(url => {
                if (!image.isConnected || images[index]?.url !== srcUrl) {
                    revokePageMediaUrl(url);
                    return;
                }
                cleanup();
                currentImageUrl = url;
                image.src = url;
            })
            .catch(error => {
                log.debug('Uchisen image load failed quietly', { kanji }, error);
                if (image.isConnected) image.remove();
            });
    };

    container.addEventListener('click', event => {
        const action = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-uchisen-action]')?.dataset.uchisenAction;
        if (!action) return;
        event.preventDefault();
        event.stopPropagation();
        if (action === 'previous') index = (index - 1 + images.length) % images.length;
        if (action === 'next') index = (index + 1) % images.length;
        if (action === 'star') {
            const key = `${UCHISEN_STAR_PREFIX}${kanji}`;
            if (currentStarred === images[index].url) {
                currentStarred = null;
                void storageDelete(key);
            } else {
                currentStarred = images[index].url;
                void storageSet(key, currentStarred);
            }
        } else {
            void storageSet(`${UCHISEN_INDEX_PREFIX}${kanji}`, index);
        }
        render();
    });
    render();
    return cleanup;
}

function renderImmersionPanel(
    container: HTMLElement,
    examples: ImmersionKitExample[],
    index: number,
    term: string,
    client: ImmersionKitClient,
    settings: ReaderSettings,
    sourceStateAttributes: string,
    prefetchedImageSrc: string | null | undefined = undefined,
): void {
    const model = immersionPanelModel(examples, index, term, client, settings, prefetchedImageSrc);
    saveMiningContext(term, immersionContextFromExample(term, model.example, index, examples.length, model.imageUrl));
    setInnerHtml(container, renderImmersionPanelHtml(model, sourceStateAttributes, settings));
    hydrateImmersionPanelImage(container, model, client, settings, prefetchedImageSrc);
}

interface ImmersionPanelModel {
    example: ImmersionKitExample;
    index: number;
    total: number;
    term: string;
    imageUrls: string[];
    imageUrl: string;
    hasAudio: boolean;
    prefetchedImageSrc: string | null | undefined;
}

function immersionPanelModel(
    examples: ImmersionKitExample[],
    index: number,
    term: string,
    client: ImmersionKitClient,
    settings: ReaderSettings,
    prefetchedImageSrc: string | null | undefined,
): ImmersionPanelModel {
    const example = examples[index];
    const imageUrls = settings.immersionKitShowImages ? immersionMediaUrls(client, example, 'image') : [];
    return {
        example,
        index,
        total: examples.length,
        term,
        imageUrls,
        imageUrl: imageUrls[0] ?? '',
        hasAudio: immersionMediaUrls(client, example, 'sound').length > 0,
        prefetchedImageSrc,
    };
}

function renderImmersionPanelHtml(model: ImmersionPanelModel, sourceStateAttributes: string, settings: ReaderSettings): string {
    return `
        <details class="jpdb-reader-local-entry jpdb-reader-dictionary-group yomu-jpdb-immersion-group" ${sourceStateAttributes}>
            <summary class="jpdb-reader-local-title jpdb-reader-example-summary">
                <span class="jpdb-reader-example-source">Immersion Kit</span>
                <span class="jpdb-reader-local-dict">${escapeHtml(model.example.sourceTitle)} · ${model.index + 1}/${model.total}</span>
            </summary>
            <div class="jpdb-reader-example-actions" role="group" aria-label="Immersion Kit example controls">
                <button class="jpdb-reader-icon-mini" type="button" data-immersion-action="previous" title="Previous example" aria-label="Previous example">‹</button>
                ${renderImmersionPanelAudioButton(model.hasAudio)}
                <button class="jpdb-reader-icon-mini" type="button" data-immersion-action="next" title="Next example" aria-label="Next example">›</button>
            </div>
            <div class="jpdb-reader-local-glossary">
                <div class="jpdb-reader-example-card ${model.imageUrl && model.prefetchedImageSrc !== null ? 'has-image' : ''}">
                    <div class="jpdb-reader-example-body">
                        ${renderImmersionPanelImage(model)}
                        <div class="jpdb-reader-example-sentence" data-yomu-immersion-sentence-render>${renderHighlightedTextHtml(model.example.sentence, [model.term], 'jpdb-reader-example-target')}</div>
                        ${renderJpdbPageExampleTranslation(model.example.translation, settings)}
                    </div>
                </div>
            </div>
        </details>
    `;
}

function renderImmersionPanelAudioButton(hasAudio: boolean): string {
    return hasAudio
        ? `<button class="jpdb-reader-icon-mini" type="button" data-immersion-action="audio" title="Play example audio" aria-label="Play example audio">${speakerIcon()}</button>`
        : '';
}

function renderImmersionPanelImage(model: ImmersionPanelModel): string {
    if (!model.imageUrl || model.prefetchedImageSrc === null) return '';
    const prefetchedSrc = model.prefetchedImageSrc ? ` src="${escapeHtml(model.prefetchedImageSrc)}"` : '';
    return `<div class="jpdb-reader-example-media"><img class="jpdb-reader-example-image" alt="" loading="lazy" data-yomu-immersion-image data-yomu-immersion-image-src="${escapeHtml(model.imageUrl)}"${prefetchedSrc}></div>`;
}

function hydrateImmersionPanelImage(
    container: HTMLElement,
    model: ImmersionPanelModel,
    client: ImmersionKitClient,
    settings: ReaderSettings,
    prefetchedImageSrc: string | null | undefined,
): void {
    const imageElement = container.querySelector<HTMLImageElement>('[data-yomu-immersion-image]');
    if (!imageElement || prefetchedImageSrc !== undefined) return;
    const hideImage = () => {
        imageElement.closest('.jpdb-reader-example-media')?.remove();
        if (imageElement.isConnected) imageElement.remove();
        container.querySelector<HTMLElement>('.jpdb-reader-example-card')?.classList.remove('has-image');
    };
    imageElement.addEventListener('error', hideImage, { once: true });
    void client.fetchBlobUrl(model.imageUrls, settings.audioTimeoutMs)
        .then(src => {
            if (container.isConnected && imageElement.isConnected) imageElement.src = src;
        })
        .catch(hideImage);
}

function renderJpdbPageExampleTranslation(translation: string, settings: ReaderSettings): string {
    if (!settings.immersionKitShowTranslation || !translation) return '';
    const escaped = escapeHtml(translation);
    if (!settings.immersionKitRevealTranslationOnClick) {
        return `<div class="jpdb-reader-example-translation">${escaped}</div>`;
    }
    return `<div class="jpdb-reader-example-translation" data-yomu-immersion-translation-blurred="true" role="button" tabindex="0" aria-label="Reveal translation">${escaped}</div>`;
}

function jpdbPageExamplesToImmersionKit(target: JpdbTermTarget): ImmersionKitExample[] {
    return target.examples
        .filter(example => immersionSentenceContainsQuery(example.sentence, target.term))
        .map((example, index) => ({
            id: `jpdb-page-${encodeURIComponent(target.term)}-${index}`,
            sentence: example.sentence,
            sentenceWithFurigana: '',
            translation: example.translation,
            sourceTitle: 'JPDB examples',
            titleSlug: 'jpdb',
            category: 'jpdb',
            soundFile: '',
            imageFile: '',
            soundUrl: '',
            imageUrl: '',
        }));
}

function toggleJpdbPageTranslationBlur(container: HTMLElement, options: JpdbExtensionsOptions): void {
    const shouldBlur = !options.getSettings().immersionKitRevealTranslationOnClick;
    options.setImmersionTranslationBlurred?.(shouldBlur);
    container.querySelectorAll<HTMLElement>('.jpdb-reader-example-translation').forEach(translation => {
        setJpdbPageTranslationBlurAttributes(translation, shouldBlur);
    });
}

function setJpdbPageTranslationBlurAttributes(element: HTMLElement, blurred: boolean): void {
    if (blurred) {
        element.dataset.yomuImmersionTranslationBlurred = 'true';
        element.setAttribute('role', 'button');
        element.setAttribute('tabindex', '0');
        element.setAttribute('aria-label', 'Reveal translation');
        return;
    }
    delete element.dataset.yomuImmersionTranslationBlurred;
    element.removeAttribute('tabindex');
    element.removeAttribute('role');
    element.removeAttribute('aria-label');
}

function highlightImmersionTerm(sentence: HTMLElement, term: string): void {
    const cleanTerm = term.replace(/\s+/g, '');
    if (!cleanTerm) return;
    sentence.querySelectorAll<HTMLElement>('.jpdb-reader-word').forEach(word => {
        const surface = word.textContent?.replace(/\s+/g, '') ?? '';
        if (surface.includes(cleanTerm)) word.classList.add('jpdb-reader-example-target');
    });
}

async function preloadImmersionImage(example: ImmersionKitExample, client: ImmersionKitClient, settings: ReaderSettings): Promise<string | null> {
    if (!settings.immersionKitShowImages) return null;
    const imageUrls = immersionMediaUrls(client, example, 'image');
    if (!imageUrls.length) return null;
    return client.fetchBlobUrl(imageUrls, settings.audioTimeoutMs).catch(() => null);
}

function playExampleAudio(example: ImmersionKitExample, client: ImmersionKitClient, settings: ReaderSettings, isCurrent: () => boolean = () => true): void {
    const urls = immersionMediaUrls(client, example, 'sound');
    const url = urls[0] ?? '';
    if (!url) return;
    if (isImmersionAddonAudioBusy(url)) return;

    const requestId = ++immersionAddonAudioRequestId;
    clearImmersionAddonAudio();
    immersionAddonAudioKey = url;
    immersionAddonAudioLoadingKey = url;

    const play = (src: string, isBlob = false) => {
        if (!isCurrent() || requestId !== immersionAddonAudioRequestId || immersionAddonAudioKey !== url) {
            if (isBlob) revokePageMediaUrl(src);
            return;
        }
        const audio = new Audio(src);
        audio.playbackRate = settings.immersionKitPlaybackRate;
        if (isBlob) immersionAddonAudioBlobUrl = src;
        immersionAddonAudio = audio;
        immersionAddonAudioLoadingKey = '';
        const cleanup = () => {
            if (immersionAddonAudio === audio) clearImmersionAddonAudio();
        };
        audio.addEventListener('ended', cleanup, { once: true });
        audio.addEventListener('error', cleanup, { once: true });
        void audio.play().catch(() => {
            if (requestId === immersionAddonAudioRequestId) clearImmersionAddonAudio();
        });
    };
    void client.fetchBlobUrl(urls, settings.audioTimeoutMs)
        .then(src => play(src, true))
        .catch(() => {
            if (requestId === immersionAddonAudioRequestId) clearImmersionAddonAudio();
        });
}

function clearImmersionAddonAudio(): void {
    immersionAddonAudio?.pause();
    immersionAddonAudio = undefined;
    immersionAddonAudioKey = '';
    immersionAddonAudioLoadingKey = '';
    if (immersionAddonAudioBlobUrl) {
        revokePageMediaUrl(immersionAddonAudioBlobUrl);
        immersionAddonAudioBlobUrl = '';
    }
}

function immersionMediaUrls(client: ImmersionKitClient, example: ImmersionKitExample, kind: 'image' | 'sound'): string[] {
    const compatibleClient = client as ImmersionKitClient & { mediaUrls?: (example: ImmersionKitExample, kind: 'image' | 'sound') => string[] };
    return compatibleClient.mediaUrls?.(example, kind) ?? [compatibleClient.mediaUrl(example, kind)].filter(Boolean);
}

function isImmersionAddonAudioBusy(key: string): boolean {
    if (immersionAddonAudioLoadingKey === key) return true;
    return Boolean(immersionAddonAudio && immersionAddonAudioKey === key && !immersionAddonAudio.ended);
}

function savedImmersionIndex(term: string, total: number): number {
    const index = loadMiningContext(term)?.immersionIndex;
    return Number.isFinite(index) && index !== undefined && index >= 0 && index < total ? index : 0;
}

function findKanjiSectionAnchor(): HTMLElement | null {
    const existingDoodle = document.querySelector<HTMLElement>('[data-yomu-jpdb-addon="doodle"][data-yomu-doodle-mode]');
    if (existingDoodle?.isConnected) return existingDoodle;
    const existingAddon = lastConnectedElement([RTK_ID, UCHISEN_ID, TERM_ADDONS_ID, JPDB_KANJI_ID]);
    if (existingAddon) return existingAddon;
    return mnemonicSectionAnchor() ?? firstKanjiFallbackAnchor();
}

function shouldHandleImmersionPanelMediaClick(action: string, media: HTMLElement | null, playOnImageClick: boolean): boolean {
    return Boolean(action || (media && playOnImageClick));
}

function shouldPlayImmersionPanelAudio(action: string): boolean {
    return !action || action === 'audio';
}

function mnemonicSectionAnchor(): HTMLElement | null {
    const labels = Array.from(document.querySelectorAll<HTMLElement>('h6.subsection-label'));
    const mnemonic = labels.find(label => label.textContent?.trim().toLowerCase().startsWith('mnemonic'));
    return mnemonic?.nextElementSibling instanceof HTMLElement ? mnemonic.nextElementSibling : null;
}

function firstKanjiFallbackAnchor(): HTMLElement | null {
    return firstElement([
        document.querySelector<HTMLElement>('.mnemonic')?.closest<HTMLElement>('.subsection') ?? null,
        document.querySelector<HTMLElement>('.result.kanji'),
        document.querySelector<HTMLElement>('.answer-box'),
        document.querySelector<HTMLElement>('main'),
    ]);
}

function firstElement(elements: Array<HTMLElement | null>): HTMLElement | null {
    return elements.find(Boolean) ?? null;
}

function ensureTermAddonSlot(name: string): HTMLElement | null {
    let mount = document.getElementById(TERM_ADDONS_ID);
    if (!mount) {
        const anchor = findEarlyTermAddonAnchor();
        if (!anchor) return null;
        mount = document.createElement('section');
        mount.id = TERM_ADDONS_ID;
        mount.className = 'yomu-jpdb-term-addons';
        mount.setAttribute(ROOT_ATTR, 'term-addons');
        insertAfter(anchor, mount);
    }
    let slot = mount.querySelector<HTMLElement>(`:scope > [data-yomu-term-addon-slot="${cssEscape(name)}"]`);
    if (!slot) {
        slot = document.createElement('div');
        slot.dataset.yomuTermAddonSlot = name;
        mount.appendChild(slot);
    }
    return slot;
}

function findEarlyTermAddonAnchor(): HTMLElement | null {
    const existing = lastConnectedElement([RTK_ID, UCHISEN_ID]);
    if (existing) return existing;
    const existingDoodle = document.querySelector<HTMLElement>('[data-yomu-jpdb-addon="doodle"][data-yomu-doodle-mode]');
    if (existingDoodle?.isConnected) return existingDoodle;
    const labels = Array.from(document.querySelectorAll<HTMLElement>('h6.subsection-label'));
    const mnemonic = labels.find(label => label.textContent?.trim().toLowerCase().startsWith('mnemonic'));
    if (mnemonic?.nextElementSibling instanceof HTMLElement) return mnemonic.nextElementSibling;
    return document.querySelector<HTMLElement>('.mnemonic')?.closest<HTMLElement>('.subsection')
        ?? document.querySelector<HTMLElement>('.result.kanji')
        ?? document.querySelector<HTMLElement>('main');
}

function pruneEmptyTermAddonMount(): void {
    const mount = document.getElementById(TERM_ADDONS_ID);
    if (!mount) return;
    mount.querySelectorAll<HTMLElement>(':scope > [data-yomu-term-addon-slot]').forEach(slot => {
        if (!slot.children.length) slot.remove();
    });
    if (!mount.children.length) mount.remove();
}

function lastConnectedElement(ids: string[]): HTMLElement | null {
    return ids
        .map(id => document.getElementById(id))
        .filter((element): element is HTMLElement => Boolean(element?.isConnected))
        .sort((a, b) => {
            if (a === b) return 0;
            return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
        })
        .at(-1) ?? null;
}

function createAddonCard(id: string, label: string): HTMLElement {
    const container = document.createElement('section');
    if (id) container.id = id;
    container.className = 'yomu-jpdb-addon-card';
    container.setAttribute(ROOT_ATTR, label);
    return container;
}

function createTermAddonContainer(id: string, label: string): HTMLElement {
    return createAddonCard(id, label);
}

function insertAfter(anchor: HTMLElement, element: HTMLElement): void {
    anchor.parentNode?.insertBefore(element, anchor.nextSibling);
}

function removeElement(id: string): void {
    document.getElementById(id)?.remove();
}

function requestText(url: string, timeout: number): Promise<string> {
    return new Promise((resolve, reject) => {
        const userscriptRequest = getUserscriptHttpRequest();
        if (userscriptRequest) {
            log.debug('Text request via userscript API', { host: safeHost(url) });
            userscriptRequest({
                method: 'GET',
                url,
                timeout,
                onload: response => {
                    if (response.status >= 200 && response.status < 300) resolve(String(response.responseText ?? response.response ?? ''));
                    else reject(new Error(`HTTP ${response.status}`));
                },
                onerror: reject,
                ontimeout: () => reject(new Error('Timed out')),
            });
            return;
        }
        log.debug('Text request via fetch', { host: safeHost(url) });
        fetch(url).then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.text();
        }).then(resolve, reject);
    });
}

function requestBlobUrl(url: string, timeout: number): Promise<string> {
    return requestBlob(url, timeout).then(blob => createPageMediaUrl(blob));
}

function requestBlob(url: string, timeout: number): Promise<Blob> {
    return new Promise((resolve, reject) => {
        const userscriptRequest = getUserscriptHttpRequest();
        if (userscriptRequest) {
            log.debug('Blob request via userscript API', { host: safeHost(url) });
            userscriptRequest({
                method: 'GET',
                url,
                responseType: 'blob',
                timeout,
                onload: response => {
                    if (response.status >= 200 && response.status < 300 && response.response instanceof Blob) resolve(response.response);
                    else reject(new Error(`HTTP ${response.status}`));
                },
                onerror: reject,
                ontimeout: () => reject(new Error('Timed out')),
            });
            return;
        }
        log.debug('Blob request via fetch', { host: safeHost(url) });
        fetch(url).then(response => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.blob();
        }).then(resolve, reject);
    });
}

async function storageGet<T>(key: string, fallback: T): Promise<T> {
    return gmStorageGet(key, fallback);
}

async function storageSet(key: string, value: unknown): Promise<void> {
    await gmStorageSet(key, value);
}

function storageGetBooleanSync(key: string, fallback: boolean): boolean {
    return gmStorageGetSync(key, fallback) === true;
}

function storageSetSync(key: string, value: boolean): void {
    gmStorageSetSync(key, value);
}

async function storageDelete(key: string): Promise<void> {
    await gmStorageDelete(key);
}

function cssEscape(value: string): string {
    if (typeof window.CSS?.escape === 'function') return window.CSS.escape(value);
    return value.replace(/["\\]/g, '\\$&');
}

function safeHost(value: string): string {
    try {
        return new URL(value, location.href).host;
    } catch {
        return 'invalid-url';
    }
}

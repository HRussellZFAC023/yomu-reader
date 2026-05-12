import { escapeHtml, renderHighlightedTextHtml, setInnerHtml } from './dom';
import { AudioPlayer } from './audio';
import { ImmersionKitClient, type ImmersionKitExample } from './immersion-kit';
import { JpdbKanjiClient } from './jpdb-kanji';
import { Logger } from './logger';
import { immersionContextFromExample, loadMiningContext, saveMiningContext } from './mining-context';
import { speakerIcon } from './popup-render';
import { RtkClient } from './rtk';
import type { ReaderSettings } from './types';
import { getUserscriptHttpRequest } from './userscript';
import { YomitanDictionaryStore, type YomitanTermEntry } from './yomitan';
import { findDoodleCanvasMount, findDoodlePreviewMount, installDoodle, type DoodleRoot } from './jpdb-doodle';
import { renderJpdbKanjiPanel, renderLocalDictionaryPanel, renderRtkPanel } from './jpdb-panel-render';
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
const DOODLE_ROOT_ID = 'yomu-jpdb-doodle-root';
const DOODLE_PREVIEW_ID = 'yomu-jpdb-doodle-preview';
const DOODLE_STORAGE_KEY = 'yomu-jpdb-doodle-current-drawing';
const SOURCE_STATE_STORAGE_PREFIX = 'yomu-jpdb-source-open:';
const UCHISEN_STAR_PREFIX = 'yomu-jpdb-uchisen-star:';
const UCHISEN_INDEX_PREFIX = 'yomu-jpdb-uchisen-index:';
const log = Logger.scope('JpdbExtensions');
let immersionAddonAudio: HTMLAudioElement | undefined;
let immersionAddonAudioBlobUrl = '';
let immersionAddonAudioKey = '';
let immersionAddonAudioLoadingKey = '';
let immersionAddonAudioRequestId = 0;

export interface UchisenImage {
    url: string;
    story: string;
}

interface JpdbExtensionsOptions {
    getSettings: () => ReaderSettings;
    dictionaries: YomitanDictionaryStore;
    immersionKit: ImmersionKitClient;
    jpdbKanji: JpdbKanjiClient;
    rtk: RtkClient;
    audio: AudioPlayer;
}

export class JpdbExtensionsController {
    private observer?: MutationObserver;
    private timer?: number;
    private lastUrl = '';
    private rtkKanji = '';
    private uchisenKanji = '';
    private jpdbKanji = '';
    private immersionKey = '';
    private reviewImmersionAutoPlayKey = '';
    private localDictionaryKeys = new Set<string>();
    private sourceOpenOverrides = new Map<string, boolean>();
    private currentObjectUrl = '';

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

        document.documentElement.classList.toggle('yomu-jpdb-review-compact-nav', isReviewPage() && settings.jpdbReviewUiEnabled);
        if (settings.jpdbReviewUiEnabled) {
            this.applyReviewUiTweak();
            this.showReviewExamplesByDefault();
        }
        else this.restoreReviewUiTweak();

        if (settings.jpdbAutoRevealSentenceEnabled) this.revealAnswerSentence();

        const kanji = extractCurrentKanji();
        if (settings.jpdbKanjiEnabled && kanji && (isKanjiPage() || isReviewPage())) this.renderJpdbKanjiInfo(kanji);
        else removeElement(JPDB_KANJI_ID);

        if (settings.jpdbUchisenEnabled && kanji) this.renderUchisen(kanji);
        else removeElement(UCHISEN_ID);

        if (settings.jpdbRtkEnabled && settings.rtkEnabled && kanji) this.renderRtk(kanji);
        else removeElement(RTK_ID);

        if (settings.jpdbImmersionKitEnabled && settings.immersionKitEnabled) this.renderImmersionKit();
        else removeElement(IMMERSION_ID);

        if (settings.jpdbLocalDictionariesEnabled && settings.localDictionariesEnabled) this.renderLocalDictionaries();
        else this.removeLocalDictionaries();

        if (settings.audioEnabled) this.renderAudioOffers();
        else this.removeAudioOffers();

        if (settings.jpdbKanjiDoodleEnabled && isReviewPage()) this.renderDoodle();
        else this.removeDoodle();
    }

    private removeAll(): void {
        removeElement(JPDB_KANJI_ID);
        removeElement(UCHISEN_ID);
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
        this.jpdbKanji = '';
        this.immersionKey = '';
        this.localDictionaryKeys.clear();
    }

    private applyReviewUiTweak(): void {
        if (!isReviewPage()) return;
        const menu = document.querySelector<HTMLElement>('.nav .menu, .menu');
        if (!menu) return;
        let item = menu.querySelector<HTMLElement>('.nav-item:first-child, a[href="/learn"], [href="/learn"]');
        if (!item) {
            item = document.createElement('div');
            item.className = 'nav-item';
            item.dataset.yomuCreatedNavItem = 'true';
            menu.prepend(item);
        }
        item.classList.add('nav-item');
        if (!item.hasAttribute('href')) item.setAttribute('href', '/learn');
        if (!item.getAttribute('data-yomu-original-html')) {
            item.setAttribute('data-yomu-original-html', item.innerHTML);
        }
        const original = item.getAttribute('data-yomu-original-html') || item.innerHTML || item.textContent || '';
        const count = reviewItemsLeftCount(original);
        setInnerHtml(item, count
            ? `Items left (<span class="yomu-jpdb-items-left-count">${escapeHtml(count)}</span>)`
            : 'Items left');
    }

    private showReviewExamplesByDefault(): void {
        if (!isReviewPage()) return;
        const checkbox = document.querySelector<HTMLInputElement>('#show-checkbox-examples');
        if (checkbox && !checkbox.checked) {
            checkbox.checked = true;
            checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        }
        document.querySelectorAll<HTMLElement>('.hidden-body').forEach(body => {
            body.hidden = false;
            body.style.display = '';
        });
        document.querySelectorAll<HTMLElement>('#show-checkbox-examples-label').forEach(label => {
            label.dataset.yomuExamplesVisible = 'true';
        });
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

    private async renderJpdbKanjiInfo(kanji: string): Promise<void> {
        if (this.jpdbKanji === kanji && document.getElementById(JPDB_KANJI_ID)) return;
        this.jpdbKanji = kanji;
        removeElement(JPDB_KANJI_ID);

        const anchor = findKanjiSectionAnchor();
        if (!anchor) return;

        const container = createAddonCard(JPDB_KANJI_ID, 'JPDB kanji info');
        setInnerHtml(container, `
            <div class="yomu-jpdb-card-title">JPDB kanji info</div>
            <div class="jpdb-reader-help">Loading readings and components...</div>
        `);
        insertAfter(anchor, container);

        const info = await this.options.jpdbKanji.lookup(kanji).catch(error => {
            log.warn('JPDB add-on kanji info lookup failed', { kanji }, error);
            return null;
        });
        if (!container.isConnected || this.jpdbKanji !== kanji) return;
        if (!info) {
            container.remove();
            return;
        }
        log.debug('JPDB add-on kanji info rendered', { kanji });
        setInnerHtml(container, renderJpdbKanjiPanel(info));
    }

    private async renderRtk(kanji: string): Promise<void> {
        if (this.rtkKanji === kanji && document.getElementById(RTK_ID)) return;
        this.rtkKanji = kanji;
        removeElement(RTK_ID);

        const anchor = findKanjiSectionAnchor();
        if (!anchor) return;

        const container = createAddonCard(RTK_ID, 'RTK');
        setInnerHtml(container, `
            <div class="yomu-jpdb-card-title">RTK</div>
            <div class="jpdb-reader-help">Loading story data...</div>
        `);
        insertAfter(anchor, container);

        const info = await this.options.rtk.lookup(kanji).catch(error => {
            log.warn('JPDB add-on RTK lookup failed', { kanji }, error);
            return null;
        });
        if (!container.isConnected || this.rtkKanji !== kanji) return;
        if (!info) {
            container.remove();
            return;
        }
        log.debug('JPDB add-on RTK rendered', { kanji });
        setInnerHtml(container, renderRtkPanel(info, !isKanjiReviewFront()));
    }

    private async renderUchisen(kanji: string): Promise<void> {
        if (!isKanjiPage() && !isReviewAnswer()) return;
        if (this.uchisenKanji === kanji && document.getElementById(UCHISEN_ID)) return;
        this.uchisenKanji = kanji;
        this.revokeCurrentImage();
        removeElement(UCHISEN_ID);

        const anchor = findKanjiSectionAnchor();
        if (!anchor) return;

        const container = createAddonCard(UCHISEN_ID, 'Uchisen');
        setInnerHtml(container, `
            <div class="yomu-jpdb-card-title">Uchisen</div>
            <div class="jpdb-reader-help">Loading mnemonic images...</div>
        `);
        insertAfter(anchor, container);

        const html = await requestText(`https://uchisen.com/kanji/${encodeURIComponent(kanji)}`, 9000).catch(error => {
            log.warn('Uchisen request failed', { kanji }, error);
            return '';
        });
        if (!container.isConnected || this.uchisenKanji !== kanji) return;

        const images = parseUchisenImages(html);
        if (!images.length) {
            log.debug('No Uchisen images found', { kanji });
            container.remove();
            return;
        }
        log.debug('Uchisen images loaded', { kanji, images: images.length });

        let index = await storageGet(`${UCHISEN_INDEX_PREFIX}${kanji}`, 0);
        const starred = await storageGet<string | null>(`${UCHISEN_STAR_PREFIX}${kanji}`, null);
        const starredIndex = starred ? images.findIndex(item => item.url === starred) : -1;
        if (starredIndex >= 0) index = starredIndex;
        if (!Number.isFinite(index) || index < 0 || index >= images.length) index = 0;

        let currentStarred = starred;
        const render = () => {
            const item = images[index];
            const isStarred = currentStarred === item.url;
            setInnerHtml(container, `
                <div class="yomu-jpdb-card-title">
                    <span>Uchisen</span>
                    <a href="https://uchisen.com/kanji/${encodeURIComponent(kanji)}" target="_blank" rel="noopener">Open</a>
                </div>
                <div class="yomu-jpdb-toolbar" role="toolbar" aria-label="Uchisen mnemonic images">
                    <button class="jpdb-reader-icon-mini" type="button" data-uchisen-action="previous" title="Previous">‹</button>
                    <span class="yomu-jpdb-counter">${index + 1}/${images.length}</span>
                    <button class="jpdb-reader-icon-mini" type="button" data-uchisen-action="next" title="Next">›</button>
                    <button class="jpdb-reader-icon-mini" type="button" data-uchisen-action="star" title="Favorite">${isStarred ? '★' : '☆'}</button>
                </div>
                <div class="yomu-jpdb-image-shell"><img alt="Uchisen mnemonic for ${escapeHtml(kanji)}" data-uchisen-image></div>
                <div class="yomu-jpdb-story">${escapeHtml(item.story || 'No story available')}</div>
            `);
            const image = container.querySelector<HTMLImageElement>('[data-uchisen-image]');
            if (!image) return;
            const srcUrl = item.url;
            requestBlobUrl(srcUrl, 9000)
                .then(url => {
                    if (!image.isConnected || images[index]?.url !== srcUrl) {
                        URL.revokeObjectURL(url);
                        return;
                    }
                    this.revokeCurrentImage();
                    this.currentObjectUrl = url;
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
    }

    private revokeCurrentImage(): void {
        if (!this.currentObjectUrl) return;
        try {
            URL.revokeObjectURL(this.currentObjectUrl);
        } catch {
            // Ignore stale object URLs.
        }
        this.currentObjectUrl = '';
    }

    private async renderImmersionKit(): Promise<void> {
        const target = currentJpdbTermTarget();
        if (!target) return;
        const key = `${location.href}:${target.term}:${target.queries.join('|')}`;
        if (this.immersionKey === key && document.getElementById(IMMERSION_ID)) return;
        this.immersionKey = key;
        removeElement(IMMERSION_ID);

        const container = createAddonCard(IMMERSION_ID, 'Immersion Kit');
        setInnerHtml(container, `
            <div class="yomu-jpdb-card-title">Immersion Kit</div>
            <div class="jpdb-reader-help">Loading examples for ${escapeHtml(target.term)}...</div>
        `);
        insertAfter(target.anchor, container);

        const result = await this.searchImmersionExamples(target);
        if (!container.isConnected || this.immersionKey !== key) return;
        const { examples, query } = result;
        if (!examples.length) {
            log.debug('JPDB add-on Immersion Kit returned no examples', { term: target.term, queries: target.queries });
            setInnerHtml(container, `
                <div class="yomu-jpdb-card-title">Immersion Kit</div>
                <div class="jpdb-reader-help">No examples found for ${escapeHtml(target.term)}.</div>
            `);
            return;
        }
        log.debug('JPDB add-on Immersion Kit rendered', { term: target.term, query, examples: examples.length });

        let index = savedImmersionIndex(query, examples.length);
        const render = () => renderImmersionPanel(container, examples, index, query, this.options.immersionKit, this.options.getSettings());
        let hoverAudioCanPlay = false;
        let hoverAudioActive = false;
        requestAnimationFrame(() => {
            hoverAudioCanPlay = !container.matches(':hover');
        });
        container.addEventListener('click', event => {
            const action = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-yomu-immersion-action]')?.dataset.yomuImmersionAction;
            if (!action) return;
            event.preventDefault();
            if (action === 'previous') index = (index - 1 + examples.length) % examples.length;
            if (action === 'next') index = (index + 1) % examples.length;
            if (action === 'audio') playExampleAudio(examples[index], this.options.immersionKit, this.options.getSettings());
            if (action !== 'audio') {
                render();
                playExampleAudio(examples[index], this.options.immersionKit, this.options.getSettings());
            }
        });
        const handleImageHover = (event: MouseEvent | PointerEvent) => {
            const media = (event.target as HTMLElement).closest?.('.jpdb-reader-example-media');
            if (!media || !hoverAudioCanPlay || !this.options.getSettings().immersionKitPlayOnHover) return;
            const cannotHover = window.matchMedia?.('(hover: none)').matches ?? false;
            const pointerType = 'pointerType' in event ? event.pointerType : 'mouse';
            if (pointerType === 'touch' || cannotHover) return;
            if (media.contains(event.relatedTarget as Node | null)) return;
            hoverAudioActive = true;
            playExampleAudio(examples[index], this.options.immersionKit, this.options.getSettings(), () => hoverAudioActive && container.isConnected && media.isConnected && media.matches(':hover'));
        };
        container.addEventListener('pointerover', handleImageHover);
        container.addEventListener('mouseover', handleImageHover);
        container.addEventListener('pointerleave', () => {
            hoverAudioCanPlay = true;
            hoverAudioActive = false;
        });
        container.addEventListener('mouseleave', () => {
            hoverAudioCanPlay = true;
            hoverAudioActive = false;
        });
        render();
        const settings = this.options.getSettings();
    }

    private async renderLocalDictionaries(): Promise<void> {
        const targets = currentLocalDictionaryTargets();
        const settings = this.options.getSettings();
        for (const target of targets) {
            const key = `${location.pathname}:${target.term}:${target.reading}`;
            if (this.localDictionaryKeys.has(key) && target.anchor.parentElement?.querySelector(`[data-yomu-local-key="${cssEscape(key)}"]`)) continue;
            this.localDictionaryKeys.add(key);
            target.anchor.parentElement?.querySelectorAll<HTMLElement>(`[data-yomu-local-key="${cssEscape(key)}"]`).forEach(node => node.remove());
            const entries = await this.lookupLocalDictionaryEntries(target, settings);
            if (!entries.length || !target.anchor.isConnected) continue;
            const container = createAddonCard('', 'Imported dictionaries');
            container.classList.add('yomu-jpdb-local-dictionaries');
            container.dataset.yomuLocalKey = key;
            setInnerHtml(container, renderLocalDictionaryPanel(
                entries,
                settings,
                dictionary => this.sourceStateAttributes(`dictionary:${dictionary}`),
            ));
            this.installSourceStateTracking(container);
            insertAfter(target.anchor, container);
            log.debug('JPDB add-on local dictionaries rendered', { term: target.term, entries: entries.length });
        }
    }

    private async searchImmersionExamples(target: JpdbTermTarget): Promise<{ examples: ImmersionKitExample[]; query: string }> {
        for (const query of target.queries) {
            const examples = await this.options.immersionKit.search(query, this.options.getSettings()).catch(error => {
                log.warn('JPDB add-on Immersion Kit search failed', { term: target.term, query }, error);
                return [];
            });
            if (examples.length) return { examples, query };
        }
        return { examples: [], query: target.term };
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
    }

    private renderAudioOffers(): void {
        for (const target of currentAudioTargets()) {
            if (target.link.parentElement?.querySelector('.yomu-jpdb-audio-button')) continue;
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'yomu-jpdb-audio-button';
            button.dataset.term = target.term;
            button.dataset.reading = target.reading;
            button.title = 'Play with Yomu audio instead';
            button.setAttribute('aria-label', `Play ${target.term} with Yomu audio`);
            setInnerHtml(button, `${speakerIcon()}<span>Yomu</span>`);
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
            const key = details?.dataset.yomuSourceStateKey;
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
        if (document.getElementById(DOODLE_ROOT_ID)) return;
        const mount = findDoodleCanvasMount();
        if (!mount) return;

        const glyph = extractCurrentKanji() || firstReviewGlyph(document.body.textContent || '') || '';
        const root = document.createElement('div');
        root.id = DOODLE_ROOT_ID;
        root.setAttribute(ROOT_ATTR, 'doodle');
        root.innerHTML = `
            <div class="yomu-doodle-stage">
                <div class="yomu-doodle-ghost" aria-hidden="true">${escapeHtml(glyph)}</div>
                <canvas class="yomu-doodle-canvas" aria-label="Kanji drawing pad"></canvas>
            </div>
            <div class="yomu-jpdb-toolbar">
                <button class="jpdb-reader-btn" type="button" data-doodle-clear>Clear</button>
                <button class="jpdb-reader-btn" type="button" data-doodle-ghost>Ghost: On</button>
            </div>
        `;
        mount.querySelector<HTMLElement>(':scope > .hbox')?.insertAdjacentElement('afterend', root);
        if (!root.isConnected) mount.querySelector<HTMLElement>('.yomu-jpdb-addon-card')?.before(root);
        if (!root.isConnected) mount.appendChild(root);
        installDoodle(root, glyph, {
            storageKey: DOODLE_STORAGE_KEY,
            loadGhostSvg: item => requestText(kanjiVgUrl(item), 5000),
        });
    }

    private removeDoodleCanvas(): void {
        const root = document.getElementById(DOODLE_ROOT_ID) as DoodleRoot | null;
        root?.__yomuDoodle?.cleanup.forEach(fn => fn());
        root?.__yomuDoodle?.resizeObserver?.disconnect();
        root?.remove();
    }

    private installDoodlePreview(): void {
        if (document.getElementById(DOODLE_PREVIEW_ID)) return;
        const drawing = localStorage.getItem(DOODLE_STORAGE_KEY);
        if (!drawing) return;
        const mount = findDoodlePreviewMount();
        if (!mount) return;
        const preview = document.createElement('div');
        preview.id = DOODLE_PREVIEW_ID;
        preview.setAttribute(ROOT_ATTR, 'doodle-preview');
        preview.innerHTML = `
            <div class="yomu-doodle-preview-label">Your drawing</div>
            <img src="${escapeHtml(drawing)}" alt="Your kanji drawing">
        `;
        if (mount.matches('a.kanji.plain, .kanji.plain')) mount.insertAdjacentElement('afterend', preview);
        else mount.appendChild(preview);
        localStorage.removeItem(DOODLE_STORAGE_KEY);
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
    const mainLoader = doc.querySelector<HTMLElement>('.kanji_image_loader[data-large]');
    const mainImage = mainLoader?.getAttribute('data-large') || doc.querySelector<HTMLImageElement>('#full_kanji_image')?.getAttribute('src') || '';
    const mainStory = cleanText(doc.querySelector('#mnemonic_story')?.textContent ?? '');
    if (mainImage) images.push({ url: canonicalUchisenUrl(mainImage), story: mainStory || 'No story available' });

    doc.querySelectorAll<HTMLElement>('.mnemonic_card').forEach(card => {
        const rawUrl = card.querySelector<HTMLInputElement>('input.image_url')?.value.trim() ?? '';
        const rawStory = card.querySelector<HTMLInputElement>('input.story')?.value ?? '';
        const story = cleanText(decodeEntities(rawStory).replace(/<[^>]+>/g, ' '));
        if (rawUrl) images.push({ url: canonicalUchisenUrl(rawUrl), story: story || mainStory || 'No story available' });
    });

    const seen = new Set<string>();
    return images.filter(item => {
        if (!item.url || seen.has(item.url)) return false;
        seen.add(item.url);
        return true;
    });
}

function renderImmersionPanel(
    container: HTMLElement,
    examples: ImmersionKitExample[],
    index: number,
    term: string,
    client: ImmersionKitClient,
    settings: ReaderSettings,
): void {
    const example = examples[index];
    const imageUrls = settings.immersionKitShowImages ? immersionMediaUrls(client, example, 'image') : [];
    const imageUrl = imageUrls[0] ?? '';
    saveMiningContext(term, immersionContextFromExample(term, example, index, examples.length, imageUrl));
    const sentenceHtml = renderHighlightedTextHtml(example.sentence, [term], 'jpdb-reader-example-target');
    const image = imageUrl ? `<div class="jpdb-reader-example-media"><img class="jpdb-reader-example-image" alt="" loading="lazy" data-yomu-immersion-image data-yomu-immersion-image-src="${escapeHtml(imageUrl)}"></div>` : '';
    setInnerHtml(container, `
        <div class="yomu-jpdb-card-title">
            <span>Immersion Kit</span>
            <a href="https://www.immersionkit.com/dictionary?keyword=${encodeURIComponent(term)}" target="_blank" rel="noopener">Open</a>
        </div>
        <div class="jpdb-reader-example-card ${image ? 'has-image' : ''}">
            <div class="jpdb-reader-example-topline">
                <div class="jpdb-reader-example-meta">
                    <span class="jpdb-reader-example-source">${escapeHtml(example.sourceTitle)}</span>
                </div>
                <div class="jpdb-reader-example-actions" role="group" aria-label="Immersion Kit example controls">
                    <button class="jpdb-reader-icon-mini" type="button" data-yomu-immersion-action="previous" title="Previous">‹</button>
                    <button class="jpdb-reader-icon-mini" type="button" data-yomu-immersion-action="audio" title="Play audio">${speakerIcon()}</button>
                    <button class="jpdb-reader-icon-mini" type="button" data-yomu-immersion-action="next" title="Next">›</button>
                </div>
            </div>
            <div class="jpdb-reader-example-body">
                ${image}
                <div class="jpdb-reader-example-sentence">${sentenceHtml}</div>
                ${settings.immersionKitShowTranslation && example.translation ? `<div class="jpdb-reader-example-translation">${escapeHtml(example.translation)}</div>` : ''}
            </div>
        </div>
    `);
    const imageElement = container.querySelector<HTMLImageElement>('[data-yomu-immersion-image]');
    if (!imageElement) return;
    const hideImage = () => {
        imageElement.closest('.jpdb-reader-example-media')?.remove();
        if (imageElement.isConnected) imageElement.remove();
        container.querySelector<HTMLElement>('.jpdb-reader-example-card')?.classList.remove('has-image');
    };
    imageElement.addEventListener('error', hideImage, { once: true });
    void client.fetchDataUrl(imageUrls, settings.audioTimeoutMs)
        .then(src => {
            if (container.isConnected && imageElement.isConnected) imageElement.src = src;
        })
        .catch(() => {
            if (container.isConnected && imageElement.isConnected) imageElement.src = imageUrl;
        });
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
            if (isBlob) URL.revokeObjectURL(src);
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
        URL.revokeObjectURL(immersionAddonAudioBlobUrl);
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
    const existingAddon = lastConnectedElement([RTK_ID, UCHISEN_ID, JPDB_KANJI_ID]);
    if (existingAddon) return existingAddon;
    const labels = Array.from(document.querySelectorAll<HTMLElement>('h6.subsection-label'));
    const mnemonic = labels.find(label => label.textContent?.trim().toLowerCase().startsWith('mnemonic'));
    if (mnemonic?.nextElementSibling instanceof HTMLElement) return mnemonic.nextElementSibling;
    return document.querySelector<HTMLElement>('.mnemonic')?.closest<HTMLElement>('.subsection')
        ?? document.querySelector<HTMLElement>('.result.kanji')
        ?? document.querySelector<HTMLElement>('.answer-box')
        ?? document.querySelector<HTMLElement>('main');
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
    return requestBlob(url, timeout).then(blob => URL.createObjectURL(blob));
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
    if (typeof GM_getValue === 'function') return await GM_getValue(key, fallback);
    try {
        const value = localStorage.getItem(key);
        return value == null ? fallback : JSON.parse(value) as T;
    } catch {
        return fallback;
    }
}

async function storageSet(key: string, value: unknown): Promise<void> {
    if (typeof GM_setValue === 'function') {
        await GM_setValue(key, value);
        return;
    }
    localStorage.setItem(key, JSON.stringify(value));
}

function storageGetBooleanSync(key: string, fallback: boolean): boolean {
    try {
        const value = localStorage.getItem(key);
        return value == null ? fallback : JSON.parse(value) === true;
    } catch {
        return fallback;
    }
}

function storageSetSync(key: string, value: boolean): void {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch {
        // Ignore storage failures; the open state still lives for this page.
    }
}

async function storageDelete(key: string): Promise<void> {
    if (typeof GM_deleteValue === 'function') {
        await GM_deleteValue(key);
        return;
    }
    localStorage.removeItem(key);
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

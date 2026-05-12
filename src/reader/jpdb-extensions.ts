import { escapeHtml, renderHighlightedTextHtml, setInnerHtml } from './dom';
import { AudioPlayer } from './audio';
import { ImmersionKitClient, type ImmersionKitExample } from './immersion-kit';
import { type JpdbKanjiInfo, JpdbKanjiClient } from './jpdb-kanji';
import { Logger } from './logger';
import { immersionContextFromExample, loadMiningContext, saveMiningContext } from './mining-context';
import { speakerIcon } from './popup-render';
import { RtkClient, type RtkInfo } from './rtk';
import type { JPDBCard, ReaderSettings } from './types';
import { getUserscriptHttpRequest } from './userscript';
import { YomitanDictionaryStore, glossaryToHtml, type YomitanTermEntry } from './yomitan';

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
const KANJI_RE = /[\p{Script=Han}\u2e80-\u2eff\u2f00-\u2fdf\u31c0-\u31ef\u3005\u3006\u3007々〆ヶ]/u;
const JAPANESE_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]/u;
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

interface DoodleState {
    resizeObserver?: ResizeObserver;
    cleanup: Array<() => void>;
}

interface JpdbTermTarget {
    term: string;
    reading: string;
    queries: string[];
    anchor: HTMLElement;
}

interface LocalDictionaryTarget {
    term: string;
    reading: string;
    alternates: string[];
    anchor: HTMLElement;
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
        installDoodle(root, glyph);
    }

    private removeDoodleCanvas(): void {
        const root = document.getElementById(DOODLE_ROOT_ID) as (HTMLElement & { __yomuDoodle?: DoodleState }) | null;
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

function renderRtkPanel(info: RtkInfo, initiallyExpanded = true): string {
    const readings = [info.onYomi ? `On: ${info.onYomi}` : '', info.kunYomi ? `Kun: ${info.kunYomi}` : ''].filter(Boolean).join(' · ');
    const title = `
        <span>RTK</span>
        ${info.frameNumber ? `<span class="yomu-jpdb-counter">#${escapeHtml(info.frameNumber)}</span>` : ''}
    `;
    const body = `
        <div class="yomu-jpdb-facts">
            <span><strong>Keyword</strong>${escapeHtml(info.keyword)}</span>
            ${readings ? `<span><strong>Readings</strong>${escapeHtml(readings)}</span>` : ''}
            ${info.elements ? `<span><strong>Elements</strong>${escapeHtml(info.elements)}</span>` : ''}
        </div>
        ${info.heisigStory ? `<section><h6>Heisig story</h6><p>${escapeHtml(info.heisigStory)}</p></section>` : ''}
        ${info.heisigComment ? `<section><h6>Heisig comment</h6><p>${escapeHtml(info.heisigComment)}</p></section>` : ''}
        ${info.koohiiStories.length ? `<section><h6>Koohii stories</h6>${info.koohiiStories.map(story => `<p>${escapeHtml(story)}</p>`).join('')}</section>` : ''}
    `;
    if (!initiallyExpanded) {
        return `
            <details class="yomu-jpdb-collapsible-card">
                <summary class="yomu-jpdb-card-title">${title}</summary>
                <div class="yomu-jpdb-collapsible-body">${body}</div>
            </details>
        `;
    }
    return `<div class="yomu-jpdb-card-title">${title}</div>${body}`;
}

function renderJpdbKanjiPanel(info: JpdbKanjiInfo): string {
    const facts = [
        info.keyword ? ['Keyword', info.keyword] : null,
        info.frequency ? ['Frequency', info.frequency] : null,
        info.type ? ['Type', info.type] : null,
        info.kanken ? ['Kanken', info.kanken] : null,
        info.heisig ? ['Heisig', info.heisig] : null,
    ].filter((item): item is [string, string] => item !== null);
    return `
        <div class="yomu-jpdb-card-title">
            <span>JPDB kanji info</span>
            <a href="https://jpdb.io/kanji/${encodeURIComponent(info.kanji)}" target="_blank" rel="noopener">Open</a>
        </div>
        ${facts.length ? `<div class="yomu-jpdb-facts">${facts.map(([label, value]) => `<span><strong>${escapeHtml(label)}</strong>${escapeHtml(value)}</span>`).join('')}</div>` : ''}
        ${info.readings.length ? `<div class="yomu-jpdb-chip-row" aria-label="Readings">${info.readings.slice(0, 10).map(reading => `<span class="${reading.common ? 'common' : ''}">${escapeHtml(reading.reading)}${reading.share ? ` <small>${escapeHtml(reading.share)}</small>` : ''}</span>`).join('')}</div>` : ''}
        ${info.components.length ? `<div class="yomu-jpdb-component-row" aria-label="Components">
            ${info.components.map(component => `<a href="https://jpdb.io/kanji/${encodeURIComponent(component.kanji)}" class="yomu-jpdb-component" target="_blank" rel="noopener"><strong>${escapeHtml(component.kanji)}</strong><span>${escapeHtml(component.keyword)}</span></a>`).join('')}
        </div>` : ''}
        ${info.vocabulary.length ? `<div class="yomu-jpdb-used-words" aria-label="Common words using ${escapeHtml(info.kanji)}">
            ${info.vocabulary.slice(0, 5).map(word => `<a href="${escapeHtml(word.url)}" target="_blank" rel="noopener"><span>${escapeHtml(word.expression)}</span><small>${escapeHtml(word.reading || word.meaning)}</small></a>`).join('')}
        </div>` : ''}
    `;
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

function renderLocalDictionaryPanel(entries: YomitanTermEntry[], settings: ReaderSettings, sourceStateAttributes: (dictionary: string) => string): string {
    const byDictionary = new Map<string, YomitanTermEntry[]>();
    for (const entry of entries) {
        const list = byDictionary.get(entry.dictionary) ?? [];
        list.push(entry);
        byDictionary.set(entry.dictionary, list);
    }
    return `
        <div class="yomu-jpdb-card-title">Imported dictionaries</div>
        ${[...byDictionary.entries()].map(([dictionary, dictionaryEntries]) => `
            <details class="jpdb-reader-local-entry jpdb-reader-dictionary-group" data-dictionary="${escapeHtml(dictionary)}" ${sourceStateAttributes(dictionary)}>
                <summary class="jpdb-reader-local-head">
                    <span>${escapeHtml(dictionaryLabel(dictionary, settings))}</span>
                    <span class="jpdb-reader-local-dict">${dictionaryEntries.length}</span>
                </summary>
                <div class="jpdb-reader-local-glossary jpdb-reader-parseable" data-dictionary="${escapeHtml(dictionary)}">
                    ${dictionaryEntries.slice(0, 3).map(entry => `
                        <div>
                            <strong>${escapeHtml(entry.expression)}</strong>${entry.reading && entry.reading !== entry.expression ? ` <span class="jpdb-reader-local-reading">${escapeHtml(entry.reading)}</span>` : ''}
                            ${entry.glossary.slice(0, 3).map(item => `<div>${glossaryToHtml(item, entry.dictionary, { internalSearchLinks: true })}</div>`).join('')}
                        </div>
                    `).join('')}
                </div>
            </details>
        `).join('')}
    `;
}

function dictionaryLabel(name: string, settings: ReaderSettings): string {
    return settings.dictionaryPreferences.find(item => item.name === name)?.alias || name;
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

function installDoodle(root: HTMLElement, glyph: string): void {
    const stage = root.querySelector<HTMLElement>('.yomu-doodle-stage');
    const canvas = root.querySelector<HTMLCanvasElement>('.yomu-doodle-canvas');
    const ghost = root.querySelector<HTMLElement>('.yomu-doodle-ghost');
    if (!stage || !canvas || !ghost) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    let dpr = Math.max(1, window.devicePixelRatio || 1);
    let drawing = false;
    let pointerId = -1;
    let strokes: DoodlePoint[][] = [];
    let current: DoodlePoint[] = [];
    const cleanup: Array<() => void> = [];
    const add = <K extends keyof HTMLElementEventMap>(target: HTMLElement | Window, type: K, listener: (event: HTMLElementEventMap[K]) => void, options?: AddEventListenerOptions) => {
        target.addEventListener(type, listener as EventListener, options);
        cleanup.push(() => target.removeEventListener(type, listener as EventListener, options));
    };

    const resize = () => {
        const rect = stage.getBoundingClientRect();
        dpr = Math.max(1, window.devicePixelRatio || 1);
        canvas.width = Math.max(1, Math.round(rect.width * dpr));
        canvas.height = Math.max(1, Math.round(rect.height * dpr));
        redraw();
    };

    const point = (event: PointerEvent): DoodlePoint => {
        const rect = canvas.getBoundingClientRect();
        return {
            x: Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width))),
            y: Math.max(0, Math.min(1, (event.clientY - rect.top) / Math.max(1, rect.height))),
            pressure: Math.max(0.15, Math.min(1, event.pressure || 0.55)),
        };
    };

    const drawStroke = (stroke: DoodlePoint[]) => {
        if (!stroke.length) return;
        context.save();
        context.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue('--jpdb-reader-text') || '#111';
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.beginPath();
        stroke.forEach((item, index) => {
            const x = item.x * canvas.width;
            const y = item.y * canvas.height;
            if (index === 0) context.moveTo(x, y);
            else context.lineTo(x, y);
        });
        const last = stroke[stroke.length - 1];
        context.lineWidth = Math.max(4, Math.min(12, canvas.width * 0.018)) * (0.75 + (last?.pressure ?? 0.55) * 0.35);
        context.stroke();
        context.restore();
    };

    const redraw = () => {
        context.clearRect(0, 0, canvas.width, canvas.height);
        for (const stroke of strokes) drawStroke(stroke);
        drawStroke(current);
    };

    const save = () => {
        try {
            localStorage.setItem(DOODLE_STORAGE_KEY, canvas.toDataURL('image/png'));
        } catch {
            // Storage can be blocked in strict profiles.
        }
    };

    add(canvas, 'pointerdown', event => {
        event.preventDefault();
        drawing = true;
        pointerId = event.pointerId;
        current = [point(event)];
        try {
            canvas.setPointerCapture?.(event.pointerId);
        } catch {
            // Some browsers only allow capture for trusted pointer streams.
        }
        redraw();
    }, { passive: false });
    add(canvas, 'pointermove', event => {
        if (!drawing || event.pointerId !== pointerId) return;
        event.preventDefault();
        const next = point(event);
        const last = current[current.length - 1];
        if (!last || Math.hypot(next.x - last.x, next.y - last.y) > 0.0025) {
            current.push(next);
            redraw();
        }
    }, { passive: false });
    const finish = (event: PointerEvent) => {
        if (!drawing || event.pointerId !== pointerId) return;
        event.preventDefault();
        if (current.length) strokes = [...strokes, current];
        current = [];
        drawing = false;
        pointerId = -1;
        try {
            canvas.releasePointerCapture?.(event.pointerId);
        } catch {
            // The pointer might already be released after stylus/browser handoff.
        }
        redraw();
        save();
    };
    add(canvas, 'pointerup', finish, { passive: false });
    add(canvas, 'pointercancel', finish, { passive: false });
    add(canvas, 'lostpointercapture', finish, { passive: false });
    add(window, 'pointerup', finish, { passive: false });
    add(window, 'pointercancel', finish, { passive: false });
    root.querySelector<HTMLButtonElement>('[data-doodle-clear]')?.addEventListener('click', event => {
        event.preventDefault();
        strokes = [];
        current = [];
        redraw();
        save();
    });
    root.querySelector<HTMLButtonElement>('[data-doodle-ghost]')?.addEventListener('click', event => {
        event.preventDefault();
        ghost.hidden = !ghost.hidden;
        (event.currentTarget as HTMLButtonElement).textContent = ghost.hidden ? 'Ghost: Off' : 'Ghost: On';
    });

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(stage);
    add(window, 'resize', resize);
    resize();

    if (glyph) {
        void requestText(kanjiVgUrl(glyph), 5000)
            .then(svg => {
                if (!root.isConnected || !svg.includes('<svg')) return;
                setInnerHtml(ghost, svg.replace(/<script[\s\S]*?<\/script>/gi, ''));
            })
            .catch(() => undefined);
    }

    (root as HTMLElement & { __yomuDoodle?: DoodleState }).__yomuDoodle = { resizeObserver, cleanup };
}

interface DoodlePoint {
    x: number;
    y: number;
    pressure: number;
}

function savedImmersionIndex(term: string, total: number): number {
    const index = loadMiningContext(term)?.immersionIndex;
    return Number.isFinite(index) && index !== undefined && index >= 0 && index < total ? index : 0;
}

function currentJpdbTermTarget(): JpdbTermTarget | null {
    const pageTerm = extractCurrentTermTarget();
    const searchQuery = extractSearchQuery();
    const term = isSearchPage() && searchQuery ? searchQuery : pageTerm?.term ?? '';
    if (!term) return null;
    const anchor = document.querySelector<HTMLElement>('.subsection-meanings')
        ?? document.querySelector<HTMLElement>('.result.vocabulary')
        ?? document.querySelector<HTMLElement>('.answer-box')
        ?? document.querySelector<HTMLElement>('main')
        ?? document.body;
    const queries = isSearchPage()
        ? uniqueLookupValues([searchQuery, pageTerm?.term, pageTerm?.reading, ...searchResultTerms(8).flatMap(item => [item.term, item.reading])])
        : uniqueLookupValues([pageTerm?.term, pageTerm?.reading, term, ...searchResultTerms(8).flatMap(item => [item.term, item.reading])]);
    return { term, reading: pageTerm?.reading || term, queries: queries.length ? queries : [term], anchor };
}

function currentLocalDictionaryTargets(): LocalDictionaryTarget[] {
    if (isDeckPage() || isSearchPage()) {
        return Array.from(document.querySelectorAll<HTMLElement>('.result.vocabulary, .entry'))
            .map(section => {
                const term = extractTermFromElement(section);
                return term ? {
                    ...term,
                    alternates: uniqueLookupValues([term.reading, ...extractAlternateTerms(section)]),
                    anchor: section.querySelector<HTMLElement>('.subsection-meanings') ?? section,
                } : null;
            })
            .filter((item): item is LocalDictionaryTarget => item !== null)
            .slice(0, 16);
    }
    const target = currentJpdbTermTarget();
    if (!target) return [];
    return [{ term: target.term, reading: target.reading, alternates: target.queries, anchor: target.anchor }];
}

function currentAudioTargets(): Array<{ term: string; reading: string; link: HTMLElement }> {
    const targets: Array<{ term: string; reading: string; link: HTMLElement }> = [];
    const seen = new Set<HTMLElement>();
    document.querySelectorAll<HTMLElement>('a.vocabulary-audio[data-audio]').forEach(link => {
        if (seen.has(link) || link.closest(`[${ROOT_ATTR}], [data-jpdb-reader-root]`)) return;
        const root = link.closest<HTMLElement>('.result.vocabulary, .answer-box, .review-hidden, .subsection-headword, .plain') ?? link.parentElement;
        if (!root) return;
        const term = extractTermFromElement(root) ?? extractTermFromAudioLink(link);
        if (!term?.term) return;
        seen.add(link);
        targets.push({ ...term, link });
    });
    return targets.slice(0, 12);
}

function extractTermFromAudioLink(link: HTMLElement): { term: string; reading: string } | null {
    const root = link.closest<HTMLElement>('.result.vocabulary, .answer-box') ?? link.parentElement;
    if (!root) return null;
    const linkToVocabulary = root.querySelector<HTMLAnchorElement>('a[href^="/vocabulary/"]');
    if (linkToVocabulary) {
        const parts = linkToVocabulary.pathname.split('/').filter(Boolean);
        if (parts[0] === 'vocabulary' && parts[2]) {
            const term = decodePathPart(parts[2]);
            return { term, reading: decodePathPart(parts[3] ?? '') || term };
        }
    }
    const text = cleanText(extractBaseText(root));
    return text && JAPANESE_RE.test(text) ? { term: firstJapaneseRun(text), reading: firstJapaneseRun(text) } : null;
}

function extractCurrentTerm(): string {
    return extractCurrentTermTarget()?.term ?? '';
}

function extractCurrentTermTarget(): { term: string; reading: string } | null {
    const fromPage = extractTermFromElement(document.body);
    const fromUrl = extractTermFromUrl();
    if (fromUrl) {
        const pageReading = fromPage?.term === fromUrl ? fromPage.reading : '';
        return { term: fromUrl, reading: extractReadingFromUrl() || pageReading || fromUrl };
    }
    return fromPage;
}

function extractSearchQuery(): string {
    if (!isSearchPage()) return '';
    return cleanText(new URLSearchParams(location.search).get('q') ?? '');
}

function extractTermFromUrl(): string {
    const parts = location.pathname.split('/').filter(Boolean);
    if (parts[0] === 'vocabulary' && parts[2]) return decodeURIComponent(parts[2]);
    if (parts[0] === 'kanji' && parts[1]) return decodeURIComponent(parts[1]);
    return '';
}

function extractReadingFromUrl(): string {
    const parts = location.pathname.split('/').filter(Boolean);
    return parts[0] === 'vocabulary' && parts[3] ? decodeURIComponent(parts[3]) : '';
}

function decodePathPart(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}

function extractTermFromElement(root: ParentNode): { term: string; reading: string } | null {
    const candidates = [
        '.vocabulary-spelling a',
        '.vocabulary-spelling',
        '.horizontal-spelling',
        '.subsection-spelling',
        '.answer-box .plain',
        '.plain',
    ];
    for (const selector of candidates) {
        const element = root.querySelector<HTMLElement>(selector);
        if (!element) continue;
        const term = cleanText(extractBaseText(element)) || cleanText(element.textContent ?? '');
        const reading = cleanText(extractReadingText(element)) || term;
        if (term && JAPANESE_RE.test(term)) return { term, reading };
    }
    return null;
}

function extractBaseText(root: Node): string {
    if (root.nodeType === Node.TEXT_NODE) return root.textContent ?? '';
    if (root.nodeType !== Node.ELEMENT_NODE) return '';
    const element = root as HTMLElement;
    if (element.tagName === 'RT' || element.tagName === 'RP') return '';
    return Array.from(element.childNodes).map(extractBaseText).join('');
}

function extractReadingText(root: Node): string {
    if (root.nodeType === Node.TEXT_NODE) return root.textContent ?? '';
    if (root.nodeType !== Node.ELEMENT_NODE) return '';
    const element = root as HTMLElement;
    if (element.tagName === 'RT' || element.tagName === 'RP') return '';
    if (element.tagName === 'RUBY') {
        const rt = Array.from(element.children).find(child => child.tagName === 'RT')?.textContent ?? '';
        return rt || extractBaseText(element);
    }
    return Array.from(element.childNodes).map(extractReadingText).join('');
}

function extractAlternateTerms(root: ParentNode): string[] {
    return Array.from(root.querySelectorAll<HTMLElement>('.subsection-other-spellings .alt-spelling, .alt-spelling, a[href^="/vocabulary/"]'))
        .flatMap(element => {
            const fromText = cleanText(extractBaseText(element)) || cleanText(element.textContent ?? '');
            const href = element instanceof HTMLAnchorElement ? element : element.querySelector<HTMLAnchorElement>('a[href^="/vocabulary/"]');
            const fromHref = href ? vocabularyPathTerm(href.pathname) : '';
            return [fromText, fromHref];
        })
        .filter(value => value && JAPANESE_RE.test(value));
}

function searchResultTerms(limit: number): Array<{ term: string; reading: string }> {
    if (!isSearchPage()) return [];
    return Array.from(document.querySelectorAll<HTMLElement>('.result.vocabulary, .entry'))
        .map(section => extractTermFromElement(section))
        .filter((item): item is { term: string; reading: string } => item !== null)
        .slice(0, limit);
}

function vocabularyPathTerm(pathname: string): string {
    const parts = pathname.split('/').filter(Boolean);
    return parts[0] === 'vocabulary' && parts[2] ? decodePathPart(parts[2]) : '';
}

function uniqueLookupValues(values: Array<string | undefined | null>): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const value of values) {
        const text = cleanText(value ?? '');
        const key = text.replace(/\s+/g, '').toLowerCase();
        if (!text || seen.has(key)) continue;
        seen.add(key);
        result.push(text);
    }
    return result;
}

function localDictionaryLookupVariants(target: LocalDictionaryTarget): Array<{ term: string; reading: string }> {
    const variants: Array<{ term: string; reading: string }> = [];
    const add = (term: string, reading = '') => {
        const cleanTerm = cleanText(term);
        const cleanReading = cleanText(reading);
        if (!cleanTerm) return;
        if (variants.some(item => item.term === cleanTerm && item.reading === cleanReading)) return;
        variants.push({ term: cleanTerm, reading: cleanReading });
    };
    add(target.term, target.reading);
    add(target.reading);
    for (const alternate of target.alternates) {
        add(alternate, alternate === target.term ? target.reading : '');
        if (target.reading && alternate !== target.reading) add(alternate, target.reading);
    }
    return variants;
}

function uniqueLocalDictionaryEntries(entries: YomitanTermEntry[]): YomitanTermEntry[] {
    const seen = new Set<string>();
    return entries.filter(entry => {
        const key = localDictionaryEntryKey(entry);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function localDictionaryEntryKey(entry: YomitanTermEntry): string {
    return `${entry.dictionary}\n${entry.expression}\n${entry.reading}\n${JSON.stringify(entry.glossary).slice(0, 120)}`;
}

function dictionaryPreferencePriority(dictionary: string, settings: ReaderSettings): number {
    const preference = settings.dictionaryPreferences.find(item => item.name === dictionary);
    return preference?.priority ?? 999;
}

function extractCurrentKanji(): string {
    const parts = location.pathname.split('/').filter(Boolean);
    if (parts[0] === 'kanji' && parts[1]) return firstReviewGlyph(decodeURIComponent(parts[1])) ?? '';
    const hidden = document.querySelector<HTMLInputElement>('input[name="c"]')?.value ?? '';
    const hiddenParts = hidden.split(',');
    if (hiddenParts[0] === 'kb' && hiddenParts[1]) return firstReviewGlyph(hiddenParts[1]) ?? '';
    return firstReviewGlyph(document.querySelector<HTMLElement>('.kanji, a.kanji.plain')?.textContent ?? '') ?? '';
}

function firstReviewGlyph(text: string): string | null {
    const direct = text.match(KANJI_RE);
    if (direct) return direct[0];
    try {
        return decodeURIComponent(text).match(KANJI_RE)?.[0] ?? null;
    } catch {
        return null;
    }
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

function findDoodleCanvasMount(): HTMLElement | null {
    return document.querySelector<HTMLElement>('.result.kanji > .vbox')
        ?? document.querySelector<HTMLElement>('.answer-box')
        ?? document.querySelector<HTMLElement>('.bugfix');
}

function findDoodlePreviewMount(): HTMLElement | null {
    return document.querySelector<HTMLElement>('.result.kanji a.kanji.plain')
        ?? document.querySelector<HTMLElement>('.answer-box .kanji, .answer-box .plain')
        ?? document.querySelector<HTMLElement>('.result.kanji .hbox')
        ?? document.querySelector<HTMLElement>('.hbox')
        ?? document.querySelector<HTMLElement>('.answer-box');
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

function isJpdbHost(): boolean {
    return location.hostname === 'jpdb.io';
}

function isReviewPage(): boolean {
    return location.pathname.startsWith('/review');
}

function isKanjiPage(): boolean {
    return location.pathname.startsWith('/kanji/');
}

function isDeckPage(): boolean {
    return location.pathname.startsWith('/deck');
}

function isSearchPage(): boolean {
    return location.pathname.startsWith('/search');
}

function isReviewAnswer(): boolean {
    return isReviewPage() && (/[?&]r=/.test(location.search) || Boolean(document.querySelector('.review-reveal, .kanji, .subsection-meanings')));
}

function isKanjiReviewFront(): boolean {
    const state = currentReviewCardState();
    return state.isKanji && state.phase === 'before';
}

function isKanjiReviewBack(): boolean {
    const state = currentReviewCardState();
    return state.isKanji && state.phase === 'after';
}

export interface JpdbReviewCardState {
    kind: string;
    kanji: string;
    isKanji: boolean;
    phase: 'before' | 'after' | 'none';
}

export function parseJpdbReviewCardValue(value: string | null | undefined, response: string | null | undefined = null): JpdbReviewCardState {
    const parts = (value ?? '').split(',');
    const kind = (parts[0] ?? '').trim();
    const kanji = firstReviewGlyph(parts.slice(1).join(',')) ?? '';
    const isKanji = kind.startsWith('k') && Boolean(kanji);
    const phase = !isKanji ? 'none' : response === '1' ? 'after' : 'before';
    return { kind, kanji, isKanji, phase };
}

function currentReviewCardState(): JpdbReviewCardState {
    if (!isReviewPage()) return { kind: '', kanji: '', isKanji: false, phase: 'none' };
    const response = new URLSearchParams(location.search).get('r');
    const cardValue = new URLSearchParams(location.search).get('c')
        ?? document.querySelector<HTMLInputElement>('input[name="c"]')?.value
        ?? '';
    return parseJpdbReviewCardValue(cardValue, response);
}

function decodeEntities(value: string): string {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = value;
    return textarea.value;
}

function canonicalUchisenUrl(value: string): string {
    let url = value.trim();
    if (!/^https?:\/\//i.test(url)) {
        if (url.startsWith('/')) url = `https://ik.imagekit.io/uchisen${url}`;
        else if (url.startsWith('generated_')) url = `https://ik.imagekit.io/uchisen/generated/saved/${url}`;
        else url = `https://ik.imagekit.io/uchisen/${url}`;
    }
    try {
        const parsed = new URL(url);
        parsed.pathname = parsed.pathname.replace(/\/{2,}/g, '/');
        parsed.search = '';
        parsed.hash = '';
        return `${parsed.origin}${parsed.pathname}`;
    } catch {
        return url.replace(/\/{2,}/g, '/').split(/[?#]/)[0];
    }
}

function cleanText(value: string): string {
    return value.replace(/\s+/g, ' ').trim();
}

function reviewItemsLeftCount(htmlOrText: string): string {
    const decoded = decodeEntities(htmlOrText.replace(/<[^>]+>/g, ' '));
    return decoded.match(/\(([\d,]+)\)/)?.[1] ?? decoded.match(/\b(\d{1,6})\b/)?.[1] ?? '';
}

function firstJapaneseRun(value: string): string {
    return value.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー]+/u)?.[0] ?? cleanText(value);
}

function jpdbAudioCard(term: string, reading: string): JPDBCard {
    return {
        vid: 0,
        sid: 0,
        rid: 0,
        spelling: term,
        reading: reading || term,
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'local',
    };
}

function kanjiVgUrl(glyph: string): string {
    const hex = glyph.codePointAt(0)?.toString(16).padStart(5, '0') ?? '';
    return `https://raw.githubusercontent.com/KanjiVG/kanjivg/master/kanji/${hex}.svg`;
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

import { APP_NAME } from './constants';
import { HAS_JAPANESE } from './dom';
import { uiText } from './i18n';
import { Logger } from './logger';
import type { ReaderSettings } from './types';

const YOUTUBE_HOST_RE = /(^|\.)youtube\.com$/i;
const VIDEO_CARD_SELECTOR = [
    'ytd-rich-item-renderer',
    'ytd-video-renderer',
    'ytd-compact-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-reel-item-renderer',
    'ytd-reel-video-renderer',
    'yt-lockup-view-model',
    '.ytGridShelfViewModelGridShelfItem',
    'ytm-rich-item-renderer',
    'ytm-compact-video-renderer',
    'ytm-video-card-renderer',
    'ytm-video-with-context-renderer',
    'ytm-shorts-lockup-view-model',
    'ytm-shorts-lockup-view-model-v2',
].join(',');

const VIDEO_CARD_CLOSEST_SELECTOR = [
    'ytd-rich-item-renderer',
    'ytd-video-renderer',
    'ytd-compact-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-reel-item-renderer',
    'ytd-reel-video-renderer',
    'yt-lockup-view-model',
    '.ytGridShelfViewModelGridShelfItem',
    'ytm-rich-item-renderer',
    'ytm-compact-video-renderer',
    'ytm-video-card-renderer',
    'ytm-video-with-context-renderer',
    'ytm-shorts-lockup-view-model',
    'ytm-shorts-lockup-view-model-v2',
].join(',');

const TITLE_SELECTOR = [
    '#video-title',
    '#movie-title',
    '#video-title > yt-formatted-string',
    'a.yt-lockup-metadata-view-model__title > span.yt-core-attributed-string',
    'a.ytLockupMetadataViewModelTitle > span.yt-core-attributed-string',
    '.yt-lockup-metadata-view-model__title',
    '.ytLockupMetadataViewModelTitle',
    'h3 a',
    'h3',
    'h3.details > span.yt-core-attributed-string',
    'h4.video-card-title > span.yt-core-attributed-string',
    'h4.YtmCompactMediaItemHeadline > span.yt-core-attributed-string',
    'h3.media-item-headline > span.yt-core-attributed-string',
    'h3.media-item-headline',
    '.media-item-headline',
    'h3.shortsLockupViewModelHostMetadataTitle > span.yt-core-attributed-string',
    '.shortsLockupViewModelHostMetadataTitle span',
    '.shortsLockupViewModelHostMetadataTitle a span',
    '.shortsLockupViewModelHostMetadataTitle',
    '.yt-lockup-metadata-view-model-wiz__title',
    'yt-formatted-string#title',
].join(',');

const KANA_RE = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const HIRAGANA_RE = /[\p{Script=Hiragana}]/u;
const KATAKANA_RE = /[\p{Script=Katakana}]/u;
const HAN_RE = /[\p{Script=Han}]/u;
const DECORATIVE_SYMBOL_RE = /[≧≦°ಠ●◕○◯⊙▽△_∩∪ﾟ∇♪ω◇◆◎⌒※☆★♡♥︶︸ಥ¬╯╰┻┳━┛┗┓┏┫┣╋╂┃━─┌┐└┘├┤┴┬╱╲╳]/u;
const VIDEO_LINK_SELECTOR = 'a[href*="/watch?v="], a[href^="/watch?v="], a[href*="youtube.com/watch?v="], a[href^="/shorts/"], a[href*="youtube.com/shorts/"]';
const OEMBED_CACHE_PREFIX = 'yomu:youtube-oembed-title:';
const log = Logger.scope('YouTubeFilter');

export function isYouTubeHost(hostname = location.hostname): boolean {
    return YOUTUBE_HOST_RE.test(hostname);
}

export function isProbablyJapaneseYouTubeText(text: string): boolean {
    const compact = text
        .replace(/fypシ゚/g, '')
        .replace(/fypシ/g, '')
        .replace(/ミックスリスト/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!HAS_JAPANESE.test(compact)) return false;

    if (DECORATIVE_SYMBOL_RE.test(compact)) {
        return HIRAGANA_RE.test(compact) && KATAKANA_RE.test(compact) && HAN_RE.test(compact);
    }
    return KANA_RE.test(compact);
}

export function collectYouTubeVideoCards(root: ParentNode = document): HTMLElement[] {
    const cards = new Set<HTMLElement>();
    root.querySelectorAll<HTMLElement>(VIDEO_CARD_SELECTOR).forEach(card => {
        if (isFilterableYouTubeCard(card)) cards.add(card);
    });
    root.querySelectorAll<HTMLAnchorElement>(VIDEO_LINK_SELECTOR).forEach(link => {
        const card = link.closest<HTMLElement>(VIDEO_CARD_CLOSEST_SELECTOR) ?? link.parentElement;
        if (card && isFilterableYouTubeCard(card)) cards.add(card);
    });
    const result = [...cards].filter(card => card.isConnected);
    log.debugThrottled('collect-cards', 2000, 'Collected YouTube video cards', { count: result.length });
    return result;
}

export function readYouTubeCardText(card: HTMLElement): string {
    const title = card.querySelector<HTMLElement>(TITLE_SELECTOR);
    const titleText = [
        title?.textContent,
        title?.getAttribute('title'),
        title?.getAttribute('aria-label'),
    ].find(value => value?.trim()) ?? '';
    return titleText.trim() || card.textContent?.trim() || '';
}

export function readYouTubeCardVideoId(card: HTMLElement): string {
    const link = card.querySelector<HTMLAnchorElement>(VIDEO_LINK_SELECTOR);
    return youtubeVideoIdFromHref(link?.getAttribute('href') ?? '');
}

function isFilterableYouTubeCard(card: HTMLElement): boolean {
    if (!card.isConnected || card.closest('[data-jpdb-reader-root]')) return false;
    return Boolean(card.querySelector(TITLE_SELECTOR) && card.querySelector(VIDEO_LINK_SELECTOR));
}

function youtubeVideoIdFromHref(href: string): string {
    if (!href) return '';
    try {
        const url = new URL(href, location.origin);
        if (url.pathname === '/watch') return url.searchParams.get('v') ?? '';
        return url.pathname.match(/\/shorts\/([^/?#]+)/)?.[1] ?? '';
    } catch {
        return href.match(/[?&]v=([^&#]+)/)?.[1] ?? href.match(/\/shorts\/([^/?#]+)/)?.[1] ?? '';
    }
}

export class YoutubeImmersionFilter {
    private observer?: MutationObserver;
    private timer?: number;
    private bar?: HTMLElement;
    private revealed = false;
    private scanId = 0;
    private originalTitleCache = new Map<string, string | null>();

    constructor(private readonly options: {
        getSettings: () => ReaderSettings;
        setEnabled?: (enabled: boolean) => void;
    }) {}

    init(): void {
        if (!isYouTubeHost()) {
            log.debug('YouTube filter initialization skipped', { hostname: location.hostname });
            return;
        }
        this.observer?.disconnect();
        this.observer = new MutationObserver(mutations => {
            if (mutations.every(mutationInsideReaderRoot)) return;
            this.schedule(350);
        });
        this.observer.observe(document.body, { childList: true, subtree: true });
        window.addEventListener('yt-navigate-finish', () => this.schedule(120));
        window.addEventListener('popstate', () => this.schedule(120));
        this.schedule(300);
        log.info('YouTube filter initialized', { enabled: this.options.getSettings().youtubeImmersionEnabled });
    }

    refresh(): void {
        if (!isYouTubeHost()) return;
        if (!this.options.getSettings().youtubeImmersionEnabled) {
            log.debug('YouTube filter refresh disabled by settings');
            this.clear();
            return;
        }
        log.debug('YouTube filter refresh scheduled');
        this.schedule(0);
    }

    private schedule(delay: number): void {
        window.clearTimeout(this.timer);
        this.timer = window.setTimeout(() => this.scan(), delay);
        log.debugThrottled('schedule', 1000, 'YouTube filter scan scheduled', { delay });
    }

    private scan(): void {
        void this.scanCards();
    }

    private async scanCards(): Promise<void> {
        const scanId = ++this.scanId;
        const done = log.time('YouTube filter scan');
        const settings = this.options.getSettings();
        if (!settings.youtubeImmersionEnabled) {
            this.clear();
            done();
            return;
        }

        let filteredCount = 0;
        let shownCount = 0;
        for (const card of collectYouTubeVideoCards()) {
            const text = readYouTubeCardText(card);
            if (!text) continue;

            const videoId = readYouTubeCardVideoId(card);
            const originalTitle = isProbablyJapaneseYouTubeText(text) ? null : await this.getOriginalTitle(videoId);
            if (scanId !== this.scanId) {
                done();
                return;
            }

            const isJapanese = isProbablyJapaneseYouTubeText(text) || Boolean(originalTitle && isProbablyJapaneseYouTubeText(originalTitle));
            if (!isJapanese) filteredCount += 1;
            if (isJapanese || this.revealed) {
                if (originalTitle) this.writeOriginalTitle(card, originalTitle);
                this.showCard(card);
                shownCount += 1;
            } else {
                this.hideCard(card);
            }
        }

        if (settings.youtubeShowFilterNotice) this.renderNotice(filteredCount, shownCount, settings);
        else this.bar?.remove();
        log.debug('YouTube filter scan completed', { filteredCount, shownCount, revealed: this.revealed });
        done();
    }

    private async getOriginalTitle(videoId: string): Promise<string | null> {
        if (!videoId) return null;
        if (this.originalTitleCache.has(videoId)) return this.originalTitleCache.get(videoId) ?? null;

        const storageKey = `${OEMBED_CACHE_PREFIX}${videoId}`;
        const cached = sessionStorage.getItem(storageKey);
        if (cached !== null) {
            const value = cached || null;
            this.originalTitleCache.set(videoId, value);
            return value;
        }

        try {
            const response = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`);
            if (!response.ok) throw new Error(`oEmbed ${response.status}`);
            const data = await response.json() as { title?: unknown };
            const title = typeof data.title === 'string' ? data.title.trim() : '';
            const value = title || null;
            this.originalTitleCache.set(videoId, value);
            sessionStorage.setItem(storageKey, value ?? '');
            return value;
        } catch (error) {
            log.debugThrottled('oembed-title', 3000, 'YouTube oEmbed title lookup failed', { videoId, error });
            return null;
        }
    }

    private writeOriginalTitle(card: HTMLElement, title: string): void {
        card.dataset.yomuYoutubeOriginalTitle = title;
        const titleElement = card.querySelector<HTMLElement>(TITLE_SELECTOR);
        if (titleElement && !isProbablyJapaneseYouTubeText(titleElement.textContent ?? '')) titleElement.textContent = title;
    }

    private hideCard(card: HTMLElement): void {
        card.classList.add('jpdb-youtube-filtered');
        card.dataset.yomuYoutubeFiltered = 'true';
    }

    private showCard(card: HTMLElement): void {
        card.classList.remove('jpdb-youtube-filtered');
        delete card.dataset.yomuYoutubeFiltered;
    }

    private renderNotice(filteredCount: number, shownCount: number, settings: ReaderSettings): void {
        if (!filteredCount) {
            this.bar?.remove();
            this.bar = undefined;
            return;
        }

        if (!this.bar) {
            this.bar = document.createElement('div');
            this.bar.className = 'jpdb-youtube-filter-bar';
            this.bar.dataset.jpdbReaderRoot = 'true';
            const label = document.createElement('span');
            label.dataset.role = 'summary';
            const actions = document.createElement('div');
            actions.className = 'jpdb-youtube-filter-actions';
            const showAnyway = document.createElement('button');
            showAnyway.type = 'button';
            showAnyway.dataset.action = 'show-anyway';
            const turnOff = document.createElement('button');
            turnOff.type = 'button';
            turnOff.dataset.action = 'turn-off';
            actions.append(showAnyway, turnOff);
            this.bar.addEventListener('click', event => {
                const action = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]')?.dataset.action;
                if (action === 'show-anyway') {
                    this.revealed = !this.revealed;
                    log.info('YouTube filter reveal toggled', { revealed: this.revealed });
                    this.schedule(0);
                }
                if (action === 'turn-off') {
                    log.info('YouTube filter turn-off clicked');
                    this.options.setEnabled?.(false);
                    if (!this.options.setEnabled) this.clear();
                }
            });
            this.bar.append(label, actions);
            document.body.append(this.bar);
        }

        const summary = this.bar.querySelector<HTMLElement>('[data-role="summary"]');
        const showAnyway = this.bar.querySelector<HTMLButtonElement>('[data-action="show-anyway"]');
        const turnOff = this.bar.querySelector<HTMLButtonElement>('[data-action="turn-off"]');
        if (summary) {
            summary.textContent = this.revealed
                ? `${APP_NAME} is showing ${filteredCount} hidden YouTube item${filteredCount === 1 ? '' : 's'}`
                : `${APP_NAME} hid ${filteredCount} non-Japanese-looking YouTube item${filteredCount === 1 ? '' : 's'}`;
            summary.title = shownCount ? `${shownCount} Japanese-looking items stayed visible.` : '';
        }
        if (showAnyway) showAnyway.textContent = this.revealed ? uiText(settings.interfaceLanguage, 'youtubeFilterAgain') : uiText(settings.interfaceLanguage, 'youtubeShowAnyway');
        if (turnOff) turnOff.textContent = uiText(settings.interfaceLanguage, 'youtubeTurnOff');
    }

    private clear(): void {
        window.clearTimeout(this.timer);
        this.revealed = false;
        collectYouTubeVideoCards().forEach(card => this.showCard(card));
        document.querySelectorAll<HTMLElement>('[data-yomu-youtube-filtered="true"]').forEach(card => this.showCard(card));
        this.bar?.remove();
        this.bar = undefined;
        log.debug('YouTube filter cleared');
    }
}

function mutationInsideReaderRoot(mutation: MutationRecord): boolean {
    const nodes = [mutation.target, ...Array.from(mutation.addedNodes)];
    return nodes.every(node => {
        const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
        return Boolean(element?.closest?.('[data-jpdb-reader-root]'));
    });
}

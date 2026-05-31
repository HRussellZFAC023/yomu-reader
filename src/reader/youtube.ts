import { APP_NAME } from './constants';
import { HAS_JAPANESE, unwrapReaderWords } from './dom';
import { uiText } from './i18n';
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
    'ytm-rich-item-renderer',
    'ytm-compact-video-renderer',
    'ytm-video-card-renderer',
    'ytm-shorts-lockup-view-model',
].join(',');

const VIDEO_CARD_CLOSEST_SELECTOR = VIDEO_CARD_SELECTOR;

const VIDEO_CARD_HIDE_TARGET_SELECTOR = [
    'ytd-rich-item-renderer',
    'ytm-rich-item-renderer',
    'ytd-video-renderer',
    'ytd-compact-video-renderer',
    'ytd-grid-video-renderer',
    'ytd-reel-item-renderer',
    'ytd-reel-video-renderer',
    'ytm-compact-video-renderer',
    'ytm-video-card-renderer',
    'ytm-shorts-lockup-view-model',
].join(',');

const NON_VIDEO_CONTAINER_SELECTOR = [
    'ytd-rich-shelf-renderer',
    'ytd-shelf-renderer',
    'ytd-playlist-renderer',
    'ytd-compact-playlist-renderer',
    'ytd-radio-renderer',
    'ytd-compact-radio-renderer',
    'ytm-playlist-renderer',
    'ytm-compact-playlist-renderer',
].join(',');

const TITLE_SELECTORS = [
    '#video-title',
    'a#video-title',
    'yt-formatted-string#video-title',
    'h3 a',
    'h3',
    '.yt-lockup-metadata-view-model-wiz__title',
    '.ytLockupMetadataViewModelTitle',
    '.ytLockupMetadataViewModelHeadingReset',
    '.media-item-headline',
    'a[href*="/watch"]',
    'a[href*="/shorts"]',
];

const VIDEO_LINK_SELECTORS = [
    'a[href*="/watch"]',
    'a[href^="/shorts/"]',
    'a[href*="youtube.com/shorts/"]',
    '.yt-lockup-view-model__content-image',
    'ytd-thumbnail > a',
    'a.yt-simple-endpoint',
    'a#video-title',
    'yt-formatted-string#title > a.yt-simple-endpoint',
].join(',');

const PLAYLIST_BADGE_SELECTOR = [
    'ytd-thumbnail-overlay-bottom-panel-renderer',
    'ytd-thumbnail-overlay-side-panel-renderer',
    'ytd-badge-supported-renderer',
    '.badge-shape-wiz__text',
    '[aria-label*="再生リスト"]',
    '[aria-label*="ミックス"]',
].join(',');
const YOUTUBE_WATCH_TITLE_SELECTOR = [
    'ytd-watch-metadata h1',
    'ytd-watch-metadata #title',
].join(',');
const HIRAGANA_RE = /\p{Script=Hiragana}/u;
const KATAKANA_RE = /\p{Script=Katakana}/u;
const HAN_RE = /\p{Script=Han}/u;
const NIHONGO_TUBE_SYMBOL_RE = /[≧≦°ಠ●◕○◯⊙▽△_∩∪ﾟ∇♪ω◇◆◎⌒※☆★♡♥︶︸ಥ¬╯╰┻┳━┛┗┓┏┫┣╋╂┃━─┌┐└┘├┤┴┬╱╲╳]/u;
const OEMBED_TITLE_CACHE_LIMIT = 240;
const OEMBED_SESSION_CACHE_PREFIX = 'yomu:youtube-oembed-title:v1:';
const OEMBED_SESSION_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const OEMBED_BATCH_RESCAN_DELAY_MS = 180;
const YOUTUBE_FILTER_NOTICE_AUTO_HIDE_MS = 4200;
const YOUTUBE_VISIBLE_BACKFILL_TARGET = 18;
const YOUTUBE_BACKFILL_THROTTLE_MS = 2400;
const YOUTUBE_BACKFILL_RESTORE_DELAY_MS = 50;

type YouTubeCardInfo = {
    card: HTMLElement;
    title: string;
    videoId: string;
};

type StoredOEmbedTitle = {
    title: string | null;
    cachedAt: number;
};

function isYouTubeHost(hostname = location.hostname): boolean {
    return YOUTUBE_HOST_RE.test(hostname);
}

export function isProbablyJapaneseYouTubeText(text: string): boolean {
    const compact = normalizeYouTubeTitleForLanguageCheck(text);
    if (!HAS_JAPANESE.test(compact)) return false;

    return HIRAGANA_RE.test(compact) || KATAKANA_RE.test(compact) || HAN_RE.test(compact);
}

export function collectYouTubeVideoCards(root: ParentNode = document): HTMLElement[] {
    const cards = new Set<HTMLElement>();
    root.querySelectorAll<HTMLElement>(VIDEO_CARD_SELECTOR).forEach(card => {
        const normalized = normalizeYouTubeVideoCard(card);
        if (normalized) cards.add(normalized);
    });
    root.querySelectorAll<HTMLAnchorElement>('a[href*="/watch?v="], a[href^="/shorts/"], a[href*="youtube.com/shorts/"]').forEach(link => {
        const closestCard = link.closest<HTMLElement>(VIDEO_CARD_CLOSEST_SELECTOR);
        const normalized = closestCard ? normalizeYouTubeVideoCard(closestCard) : null;
        if (normalized) cards.add(normalized);
    });
    return [...cards].filter(card => card.isConnected);
}

function readYouTubeCardInfo(card: HTMLElement): YouTubeCardInfo {
    const title = TITLE_SELECTORS
        .map(selector => card.querySelector<HTMLElement>(selector))
        .find(Boolean);
    const titleText = [
        title?.getAttribute('title'),
        title?.getAttribute('aria-label'),
        title?.textContent,
    ].find(value => value?.trim()) ?? '';
    return {
        card,
        title: (titleText.trim() || card.textContent?.trim() || '').trim(),
        videoId: readYouTubeVideoId(card),
    };
}

export class YoutubeImmersionFilter {
    private observer?: MutationObserver;
    private events?: AbortController;
    private timer?: number;
    private metadataRescanTimer?: number;
    private noticeTimer?: number;
    private bar?: HTMLElement;
    private revealed = false;
    private lastNoticeKey = '';
    private dismissedNoticeScope = '';
    private noticeRouteKey = '';
    private lastBackfillAt = Number.NEGATIVE_INFINITY;
    private destroyed = true;
    private readonly oembedTitleCache = new Map<string, string | null>();
    private readonly pendingOembedTitles = new Set<string>();

    constructor(private readonly options: {
        getSettings: () => ReaderSettings;
        setShowFilterNotice?: (visible: boolean) => void;
        isActivePage?: () => boolean;
    }) {}

    init(): void {
        this.destroy();
        this.destroyed = false;
        if (!this.isActivePage() || !document.body || !this.options.getSettings().youtubeImmersionEnabled) {
            this.destroyed = true;
            return;
        }

        this.setFilterActiveClass(true);
        this.startWatching();
        this.schedule(0);
    }

    private startWatching(): void {
        if (this.observer || !document.body) return;
        this.events = new AbortController();
        this.observer = new MutationObserver(mutations => {
            if (mutations.every(mutationInsideReaderRoot)) return;
            if (!mutations.some(mutationMayAffectYouTubeCards)) return;
            this.schedule(350);
        });
        this.observer.observe(document.body, { childList: true, subtree: true });
        window.addEventListener('yt-navigate-finish', () => this.schedule(120), { signal: this.events.signal });
        window.addEventListener('popstate', () => this.schedule(120), { signal: this.events.signal });
    }

    refresh(): void {
        if (!this.isActivePage()) {
            this.destroy();
            return;
        }
        if (!this.options.getSettings().youtubeImmersionEnabled) {
            this.destroyed = true;
            this.stopWatching();
            this.clear();
            return;
        }
        this.destroyed = false;
        this.setFilterActiveClass(true);
        this.startWatching();
        window.clearTimeout(this.timer);
        this.timer = undefined;
        this.scan();
    }

    destroy(): void {
        this.destroyed = true;
        this.stopWatching();
        this.clear();
    }

    private stopWatching(): void {
        this.events?.abort();
        this.events = undefined;
        this.observer?.disconnect();
        this.observer = undefined;
    }

    private isActivePage(): boolean {
        return this.options.isActivePage?.() ?? isYouTubeHost();
    }

    private schedule(delay: number): void {
        window.clearTimeout(this.timer);
        this.timer = window.setTimeout(() => {
            this.timer = undefined;
            this.scan();
        }, delay);
    }

    private scan(): void {
        const settings = this.options.getSettings();
        if (!settings.youtubeImmersionEnabled) {
            this.clear();
            return;
        }

        unwrapYouTubeWatchTitleReaderWords();

        if (isYouTubeShortsWatchPage()) {
            this.clearFilteredCards();
            this.removeNotice();
            return;
        }

        let filteredCount = 0;
        let shownCount = 0;
        const visibleVideoIds = new Set<string>();
        for (const card of collectYouTubeFilterItems()) {
            if (isYouTubeAlwaysHiddenItem(card)) {
                filteredCount += 1;
                if (this.revealed) {
                    this.showCard(card);
                    shownCount += 1;
                } else {
                    this.hideCard(card);
                }
                continue;
            }

            const info = readYouTubeCardInfo(card);
            if (!info.title) continue;

            const text = this.resolveTitleForFiltering(info);
            if (!text) {
                if (!this.revealed) this.hideCard(card);
                continue;
            }

            const isJapanese = isProbablyJapaneseYouTubeText(text);
            if (!isJapanese) filteredCount += 1;
            if (isJapanese || this.revealed) {
                this.showCard(card);
                shownCount += 1;
                if (info.videoId) visibleVideoIds.add(info.videoId);
            } else {
                this.hideCard(card);
            }
        }

        if (settings.youtubeShowFilterNotice) {
            this.renderNotice(filteredCount, shownCount, settings);
        } else {
            this.bar?.remove();
            this.bar = undefined;
        }
        this.maybeBackfillFeed(filteredCount, shownCount, visibleVideoIds.size);
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
            this.removeNotice();
            this.lastNoticeKey = '';
            return;
        }

        const noticeScope = this.currentNoticeScope();
        const noticeKey = `${noticeScope}:${filteredCount}:${shownCount}`;
        if (!this.bar && this.dismissedNoticeScope === noticeScope) return;
        const shouldStartTimer = !this.bar;

        if (!this.bar) {
            this.bar = document.createElement('div');
            this.bar.className = 'jpdb-youtube-filter-bar';
            this.bar.dataset.jpdbReaderRoot = 'true';
            const label = document.createElement('span');
            label.dataset.role = 'summary';
            const actions = document.createElement('div');
            actions.className = 'jpdb-youtube-filter-actions';
            const toggleHidden = document.createElement('button');
            toggleHidden.type = 'button';
            toggleHidden.dataset.action = 'toggle-hidden';
            const hideNotice = document.createElement('button');
            hideNotice.type = 'button';
            hideNotice.dataset.action = 'hide-notice';
            actions.append(toggleHidden, hideNotice);
            this.bar.addEventListener('click', event => {
                const action = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]')?.dataset.action;
                if (action === 'toggle-hidden') {
                    this.revealed = !this.revealed;
                    this.schedule(0);
                }
                if (action === 'hide-notice') {
                    this.options.setShowFilterNotice?.(false);
                    this.dismissedNoticeScope = this.currentNoticeScope();
                    this.removeNotice();
                }
            });
            this.bar.append(label, actions);
            document.body.append(this.bar);
        }
        this.lastNoticeKey = noticeKey;

        const summary = this.bar.querySelector<HTMLElement>('[data-role="summary"]');
        const toggleHidden = this.bar.querySelector<HTMLButtonElement>('[data-action="toggle-hidden"]');
        const hideNotice = this.bar.querySelector<HTMLButtonElement>('[data-action="hide-notice"]');
        if (summary) {
            const plural = filteredCount === 1 ? '' : 's';
            summary.textContent = this.revealed
                ? formatYoutubeText(uiText(settings.interfaceLanguage, 'youtubeFilterShowing'), { appName: APP_NAME, count: String(filteredCount), plural })
                : formatYoutubeText(uiText(settings.interfaceLanguage, 'youtubeFilterHid'), { appName: APP_NAME, count: String(filteredCount), plural });
            summary.title = shownCount
                ? formatYoutubeText(uiText(settings.interfaceLanguage, 'youtubeFilterVisible'), { count: String(shownCount) })
                : '';
        }
        if (toggleHidden) toggleHidden.textContent = this.revealed ? uiText(settings.interfaceLanguage, 'youtubeHideHiddenVideos') : uiText(settings.interfaceLanguage, 'youtubeShowHiddenVideos');
        if (hideNotice) hideNotice.textContent = uiText(settings.interfaceLanguage, 'youtubeHideNotice');
        if (shouldStartTimer) this.startNoticeTimer(noticeScope);
    }

    private clear(): void {
        window.clearTimeout(this.timer);
        window.clearTimeout(this.metadataRescanTimer);
        this.timer = undefined;
        this.metadataRescanTimer = undefined;
        this.revealed = false;
        this.clearFilteredCards();
        this.removeNotice();
        this.lastNoticeKey = '';
        this.dismissedNoticeScope = '';
        this.noticeRouteKey = '';
        this.lastBackfillAt = Number.NEGATIVE_INFINITY;
        this.setFilterActiveClass(false);
    }

    private resolveTitleForFiltering(info: YouTubeCardInfo): string {
        if (!info.videoId) return info.title;
        const cached = this.cachedOEmbedTitle(info.videoId);
        if (cached !== undefined) return cached || info.title;
        if (shouldVerifyOriginalYouTubeTitle(info.title)) this.fetchOriginalTitle(info.videoId);
        return info.title;
    }

    private fetchOriginalTitle(videoId: string): void {
        if (this.pendingOembedTitles.has(videoId)) return;
        this.pendingOembedTitles.add(videoId);
        void fetchYouTubeOEmbedTitle(videoId)
            .then(title => {
                this.rememberOEmbedTitle(videoId, title);
            })
            .catch(() => {
                this.rememberOEmbedTitle(videoId, null);
            })
            .finally(() => {
                this.pendingOembedTitles.delete(videoId);
                if (!this.destroyed && this.options.getSettings().youtubeImmersionEnabled) this.scheduleMetadataRescan();
            });
    }

    private cachedOEmbedTitle(videoId: string): string | null | undefined {
        if (this.oembedTitleCache.has(videoId)) return this.oembedTitleCache.get(videoId) ?? null;
        const stored = readStoredOEmbedTitle(videoId);
        if (stored === undefined) return undefined;
        this.rememberOEmbedTitle(videoId, stored, { persist: false });
        return stored;
    }

    private rememberOEmbedTitle(videoId: string, title: string | null, options: { persist?: boolean } = {}): void {
        if (this.oembedTitleCache.size >= OEMBED_TITLE_CACHE_LIMIT) {
            const oldest = this.oembedTitleCache.keys().next().value;
            if (oldest) this.oembedTitleCache.delete(oldest);
        }
        this.oembedTitleCache.set(videoId, title);
        if (options.persist !== false) writeStoredOEmbedTitle(videoId, title);
    }

    private scheduleMetadataRescan(): void {
        if (this.metadataRescanTimer !== undefined) return;
        this.metadataRescanTimer = window.setTimeout(() => {
            this.metadataRescanTimer = undefined;
            this.schedule(0);
        }, OEMBED_BATCH_RESCAN_DELAY_MS);
    }

    private startNoticeTimer(noticeScope: string): void {
        window.clearTimeout(this.noticeTimer);
        this.noticeTimer = window.setTimeout(() => {
            if (this.currentNoticeScope() !== noticeScope) return;
            this.dismissedNoticeScope = noticeScope;
            this.removeNotice();
        }, YOUTUBE_FILTER_NOTICE_AUTO_HIDE_MS);
    }

    private removeNotice(): void {
        window.clearTimeout(this.noticeTimer);
        this.noticeTimer = undefined;
        this.bar?.remove();
        this.bar = undefined;
    }

    private clearFilteredCards(): void {
        document.querySelectorAll<HTMLElement>('[data-yomu-youtube-filtered="true"], .jpdb-youtube-filtered').forEach(card => this.showCard(card));
    }

    private currentNoticeScope(): string {
        const routeKey = `${location.pathname}${location.search}`;
        if (this.noticeRouteKey !== routeKey) {
            this.noticeRouteKey = routeKey;
            this.dismissedNoticeScope = '';
            this.lastNoticeKey = '';
            this.removeNotice();
        }
        return `${routeKey}:${this.revealed ? 'revealed' : 'hidden'}`;
    }

    private maybeBackfillFeed(filteredCount: number, shownCount: number, visibleUniqueCount: number): void {
        if (this.revealed || !filteredCount || isYouTubeWatchPage() || isYouTubeShortsWatchPage()) return;
        if (Math.max(shownCount, visibleUniqueCount) >= YOUTUBE_VISIBLE_BACKFILL_TARGET) return;
        const now = performance.now();
        if (now - this.lastBackfillAt < YOUTUBE_BACKFILL_THROTTLE_MS) return;
        const continuation = document.querySelector<HTMLElement>('ytd-continuation-item-renderer, ytm-continuation-item-renderer, tp-yt-paper-spinner-lite');
        if (!continuation?.isConnected) return;

        this.lastBackfillAt = now;
        const shouldRestoreScroll = !isNearPageBottom();
        const scrollX = window.scrollX;
        const scrollY = window.scrollY;
        continuation.scrollIntoView({ block: 'end' });
        if (shouldRestoreScroll) {
            window.setTimeout(() => window.scrollTo(scrollX, scrollY), YOUTUBE_BACKFILL_RESTORE_DELAY_MS);
        }
    }

    private setFilterActiveClass(active: boolean): void {
        document.documentElement.classList.toggle('jpdb-youtube-filter-active', active);
    }
}

function formatYoutubeText(template: string, values: Record<string, string>): string {
    return template.replace(/\{(\w+)\}/g, (_match: string, key: string) => values[key] ?? '');
}

function normalizeYouTubeTitleForLanguageCheck(text: string): string {
    return text
        .replace(/fypシ゚/g, '')
        .replace(/fypシ/g, '')
        .replace(/ミックスリスト/g, '')
        .replace(NIHONGO_TUBE_SYMBOL_RE, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function shouldVerifyOriginalYouTubeTitle(title: string): boolean {
    return isProbablyJapaneseYouTubeText(title);
}

function collectYouTubeFilterItems(root: ParentNode = document): HTMLElement[] {
    const items = new Set<HTMLElement>(collectYouTubeVideoCards(root));
    root.querySelectorAll<HTMLElement>(`${VIDEO_CARD_SELECTOR},${NON_VIDEO_CONTAINER_SELECTOR}`).forEach(element => {
        const normalized = normalizeYouTubeFilterItem(element);
        if (normalized) items.add(normalized);
    });
    return [...items].filter(item => item.isConnected);
}

function normalizeYouTubeFilterItem(element: HTMLElement): HTMLElement | null {
    if (!element.isConnected) return null;
    if (isYouTubeShortsWatchPage() && element.closest('ytd-shorts, ytd-reel-video-renderer')) return null;
    if (element.closest('[data-jpdb-reader-root]')) return null;
    if (element.matches(NON_VIDEO_CONTAINER_SELECTOR)) return element;
    if (isYouTubePlaylistLikeCard(element)) return youtubeCardHideTarget(element) ?? element;
    return normalizeYouTubeVideoCard(element);
}

function isYouTubeAlwaysHiddenItem(card: HTMLElement): boolean {
    return card.matches(NON_VIDEO_CONTAINER_SELECTOR) || isYouTubePlaylistLikeCard(card);
}

function normalizeYouTubeVideoCard(element: HTMLElement): HTMLElement | null {
    if (!element.isConnected) return null;
    if (isYouTubeShortsWatchPage() && element.closest('ytd-shorts, ytd-reel-video-renderer')) return null;
    if (element.closest('[data-jpdb-reader-root]')) return null;
    if (element.matches(NON_VIDEO_CONTAINER_SELECTOR)) return null;
    if (!element.querySelector(VIDEO_LINK_SELECTORS)) return null;
    if (isYouTubePlaylistLikeCard(element)) return null;
    const excluded = element.closest<HTMLElement>(NON_VIDEO_CONTAINER_SELECTOR);
    if (excluded && !excluded.matches(VIDEO_CARD_SELECTOR)) {
        const cardInsideExcluded = element.closest<HTMLElement>(VIDEO_CARD_SELECTOR);
        if (!cardInsideExcluded || cardInsideExcluded === excluded) return null;
    }
    return youtubeCardHideTarget(element);
}

function youtubeCardHideTarget(element: HTMLElement): HTMLElement | null {
    const outer = element.closest<HTMLElement>(VIDEO_CARD_HIDE_TARGET_SELECTOR);
    if (outer?.querySelector(VIDEO_LINK_SELECTORS)) return outer;
    return element.closest<HTMLElement>(VIDEO_CARD_SELECTOR);
}

function readYouTubeVideoId(card: HTMLElement): string {
    const link = Array.from(card.querySelectorAll<HTMLAnchorElement>(VIDEO_LINK_SELECTORS))
        .find(candidate => extractYouTubeVideoId(candidate.getAttribute('href')));
    return link ? extractYouTubeVideoId(link.getAttribute('href')) : '';
}

function extractYouTubeVideoId(href: string | null): string {
    if (!href) return '';
    try {
        const url = new URL(href, 'https://www.youtube.com');
        if (url.pathname === '/watch') return url.searchParams.get('v') ?? '';
        const shortsMatch = url.pathname.match(/^\/shorts\/([^/?#]+)/);
        return shortsMatch?.[1] ?? '';
    } catch {
        return '';
    }
}

function isYouTubeShortsWatchPage(): boolean {
    return location.pathname.startsWith('/shorts/');
}

function isNearPageBottom(): boolean {
    const page = document.scrollingElement ?? document.documentElement;
    return window.scrollY + window.innerHeight >= page.scrollHeight - Math.max(900, window.innerHeight);
}

function isYouTubeWatchPage(): boolean {
    return location.pathname === '/watch';
}

function unwrapYouTubeWatchTitleReaderWords(): void {
    if (!isYouTubeWatchPage()) return;
    document.querySelectorAll<HTMLElement>(YOUTUBE_WATCH_TITLE_SELECTOR).forEach(title => {
        unwrapReaderWords(title);
    });
}

function isYouTubePlaylistLikeCard(card: HTMLElement): boolean {
    if (card.matches(NON_VIDEO_CONTAINER_SELECTOR)) return true;
    const links = Array.from(card.querySelectorAll<HTMLAnchorElement>('a[href]'));
    const playlistLinks = links.filter(link => {
        const href = link.getAttribute('href') ?? '';
        return href.includes('/playlist?')
            || href.includes('/watch_videos?')
            || /[?&]start_radio=/.test(href)
            || (!extractYouTubeVideoId(href) && /[?&]list=/.test(href));
    });
    if (playlistLinks.length && playlistLinks.length >= links.filter(link => extractYouTubeVideoId(link.getAttribute('href'))).length) {
        return true;
    }
    return Array.from(card.querySelectorAll<HTMLElement>(PLAYLIST_BADGE_SELECTOR)).some(element => {
        const text = `${element.getAttribute('aria-label') ?? ''} ${element.textContent ?? ''}`;
        return /\bplaylist\b|\bmix\b|\bradio\b|再生リスト|ミックス|ラジオ/i.test(text);
    });
}

async function fetchYouTubeOEmbedTitle(videoId: string): Promise<string | null> {
    const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    const response = await fetch(`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(watchUrl)}`);
    if (!response.ok) return null;
    const data = await response.json() as { title?: unknown };
    return typeof data.title === 'string' && data.title.trim() ? data.title.trim() : null;
}

function readStoredOEmbedTitle(videoId: string): string | null | undefined {
    try {
        const raw = sessionStorage.getItem(storedOEmbedTitleKey(videoId));
        if (!raw) return undefined;
        const parsed = JSON.parse(raw) as Partial<StoredOEmbedTitle>;
        if (!Number.isFinite(parsed.cachedAt) || Date.now() - Number(parsed.cachedAt) > OEMBED_SESSION_CACHE_TTL_MS) {
            sessionStorage.removeItem(storedOEmbedTitleKey(videoId));
            return undefined;
        }
        return typeof parsed.title === 'string' ? parsed.title : null;
    } catch {
        return undefined;
    }
}

function writeStoredOEmbedTitle(videoId: string, title: string | null): void {
    try {
        const stored: StoredOEmbedTitle = { title, cachedAt: Date.now() };
        sessionStorage.setItem(storedOEmbedTitleKey(videoId), JSON.stringify(stored));
    } catch {
        // Session cache is only a jitter/noise reduction; memory cache still covers this page.
    }
}

function storedOEmbedTitleKey(videoId: string): string {
    return `${OEMBED_SESSION_CACHE_PREFIX}${videoId}`;
}

function mutationInsideReaderRoot(mutation: MutationRecord): boolean {
    const nodes = [mutation.target, ...Array.from(mutation.addedNodes)];
    return nodes.every(node => {
        const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
        return Boolean(element?.closest?.('[data-jpdb-reader-root]'));
    });
}

function mutationMayAffectYouTubeCards(mutation: MutationRecord): boolean {
    const nodes = [mutation.target, ...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)];
    return nodes.some(nodeMayAffectYouTubeCards);
}

function nodeMayAffectYouTubeCards(node: Node): boolean {
    const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
    if (!element || element.closest('[data-jpdb-reader-root]')) return false;
    return element.matches(VIDEO_CARD_SELECTOR)
        || element.matches(NON_VIDEO_CONTAINER_SELECTOR)
        || element.matches('ytd-rich-grid-renderer, ytd-section-list-renderer, ytd-item-section-renderer, ytm-rich-grid-renderer')
        || Boolean(element.closest(VIDEO_CARD_SELECTOR))
        || Boolean(element.querySelector?.(VIDEO_CARD_SELECTOR))
        || Boolean(element.querySelector?.('a[href*="/watch?v="], a[href^="/shorts/"], a[href*="youtube.com/shorts/"]'));
}

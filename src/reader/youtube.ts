import { APP_NAME } from './constants';
import { HAS_JAPANESE } from './dom';
import { uiText } from './i18n';
import type { ReaderSettings } from './types';

const YOUTUBE_HOST_RE = /(^|\.)youtube\.com$/i;
const VIDEO_CARD_SELECTOR = [
    'ytd-rich-item-renderer',
    'ytd-rich-grid-media',
    'ytd-rich-shelf-renderer',
    'ytd-video-renderer',
    'ytd-compact-video-renderer',
    'ytd-compact-radio-renderer',
    'ytd-compact-playlist-renderer',
    'ytd-grid-video-renderer',
    'ytd-reel-item-renderer',
    'ytd-reel-video-renderer',
    'ytd-playlist-renderer',
    'ytd-radio-renderer',
    'ytd-shelf-renderer',
    'yt-lockup-view-model',
    'ytm-rich-item-renderer',
    'ytm-compact-video-renderer',
    'ytm-video-card-renderer',
    'ytm-shorts-lockup-view-model',
].join(',');

const VIDEO_CARD_CLOSEST_SELECTOR = VIDEO_CARD_SELECTOR;

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

const HIRAGANA_RE = /\p{Script=Hiragana}/u;
const KATAKANA_RE = /\p{Script=Katakana}/u;
const HAN_RE = /\p{Script=Han}/u;
const NIHONGO_TUBE_SYMBOL_RE = /[≧≦°ಠ●◕○◯⊙▽△_∩∪ﾟ∇♪ω◇◆◎⌒※☆★♡♥︶︸ಥ¬╯╰┻┳━┛┗┓┏┫┣╋╂┃━─┌┐└┘├┤┴┬╱╲╳]/u;
const OEMBED_TITLE_CACHE_LIMIT = 240;
const YOUTUBE_FILTER_NOTICE_AUTO_HIDE_MS = 4200;

type YouTubeCardInfo = {
    card: HTMLElement;
    title: string;
    videoId: string;
};

export function isYouTubeHost(hostname = location.hostname): boolean {
    return YOUTUBE_HOST_RE.test(hostname);
}

export function isProbablyJapaneseYouTubeText(text: string): boolean {
    const compact = normalizeYouTubeTitleForLanguageCheck(text);
    if (!HAS_JAPANESE.test(compact)) return false;

    if (NIHONGO_TUBE_SYMBOL_RE.test(compact)) {
        return HIRAGANA_RE.test(compact) && KATAKANA_RE.test(compact) && HAN_RE.test(compact);
    }

    return HIRAGANA_RE.test(compact) || KATAKANA_RE.test(compact);
}

export function collectYouTubeVideoCards(root: ParentNode = document): HTMLElement[] {
    const cards = new Set<HTMLElement>();
    root.querySelectorAll<HTMLElement>(VIDEO_CARD_SELECTOR).forEach(card => {
        if (!card.closest('[data-jpdb-reader-root]')) cards.add(card);
    });
    root.querySelectorAll<HTMLAnchorElement>('a[href*="/watch?v="], a[href^="/shorts/"], a[href*="youtube.com/shorts/"]').forEach(link => {
        const card = link.closest<HTMLElement>(VIDEO_CARD_CLOSEST_SELECTOR) ?? link.parentElement;
        if (card && !card.closest('[data-jpdb-reader-root]')) cards.add(card);
    });
    return [...cards].filter(card => card.isConnected);
}

export function readYouTubeCardText(card: HTMLElement): string {
    return readYouTubeCardInfo(card).title;
}

export function readYouTubeCardInfo(card: HTMLElement): YouTubeCardInfo {
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
    private noticeTimer?: number;
    private bar?: HTMLElement;
    private revealed = false;
    private lastNoticeKey = '';
    private dismissedNoticeKey = '';
    private readonly oembedTitleCache = new Map<string, string | null>();
    private readonly pendingOembedTitles = new Set<string>();

    constructor(private readonly options: {
        getSettings: () => ReaderSettings;
        setShowFilterNotice?: (visible: boolean) => void;
        isActivePage?: () => boolean;
    }) {}

    init(): void {
        this.destroy();
        if (!this.isActivePage() || !document.body) return;
        if (!this.options.getSettings().youtubeImmersionEnabled) return;

        this.startWatching();
        this.schedule(300);
    }

    private startWatching(): void {
        if (this.observer || !document.body) return;
        this.events = new AbortController();
        this.observer = new MutationObserver(mutations => {
            if (mutations.every(mutationInsideReaderRoot)) return;
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
            this.stopWatching();
            this.clear();
            return;
        }
        this.startWatching();
        this.schedule(0);
    }

    destroy(): void {
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
        this.timer = window.setTimeout(() => this.scan(), delay);
    }

    private scan(): void {
        const settings = this.options.getSettings();
        if (!settings.youtubeImmersionEnabled) {
            this.clear();
            return;
        }

        let filteredCount = 0;
        let shownCount = 0;
        for (const card of collectYouTubeVideoCards()) {
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
            this.dismissedNoticeKey = '';
            return;
        }

        const noticeKey = `${this.revealed ? 'revealed' : 'hidden'}:${filteredCount}:${shownCount}`;
        if (!this.bar && this.dismissedNoticeKey === noticeKey) return;
        const shouldStartTimer = !this.bar || this.lastNoticeKey !== noticeKey;

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
                    this.dismissedNoticeKey = this.lastNoticeKey;
                    this.removeNotice();
                }
            });
            this.bar.append(label, actions);
            document.body.append(this.bar);
        }
        this.lastNoticeKey = noticeKey;
        this.dismissedNoticeKey = '';

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
        if (shouldStartTimer) this.startNoticeTimer(noticeKey);
    }

    private clear(): void {
        window.clearTimeout(this.timer);
        this.timer = undefined;
        this.revealed = false;
        document.querySelectorAll<HTMLElement>('[data-yomu-youtube-filtered="true"], .jpdb-youtube-filtered').forEach(card => this.showCard(card));
        this.removeNotice();
        this.lastNoticeKey = '';
        this.dismissedNoticeKey = '';
    }

    private resolveTitleForFiltering(info: YouTubeCardInfo): string {
        if (!info.videoId) return info.title;
        if (this.oembedTitleCache.has(info.videoId)) return this.oembedTitleCache.get(info.videoId) || info.title;
        this.fetchOriginalTitle(info.videoId);
        return '';
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
                if (this.options.getSettings().youtubeImmersionEnabled) this.schedule(0);
            });
    }

    private rememberOEmbedTitle(videoId: string, title: string | null): void {
        if (this.oembedTitleCache.size >= OEMBED_TITLE_CACHE_LIMIT) {
            const oldest = this.oembedTitleCache.keys().next().value;
            if (oldest) this.oembedTitleCache.delete(oldest);
        }
        this.oembedTitleCache.set(videoId, title);
    }

    private startNoticeTimer(noticeKey: string): void {
        window.clearTimeout(this.noticeTimer);
        this.noticeTimer = window.setTimeout(() => {
            if (this.lastNoticeKey !== noticeKey) return;
            this.dismissedNoticeKey = noticeKey;
            this.removeNotice();
        }, YOUTUBE_FILTER_NOTICE_AUTO_HIDE_MS);
    }

    private removeNotice(): void {
        window.clearTimeout(this.noticeTimer);
        this.noticeTimer = undefined;
        this.bar?.remove();
        this.bar = undefined;
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
        .replace(/\s+/g, ' ')
        .trim();
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

async function fetchYouTubeOEmbedTitle(videoId: string): Promise<string | null> {
    const watchUrl = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
    const response = await fetch(`https://www.youtube.com/oembed?url=${watchUrl}`);
    if (!response.ok) return null;
    const data = await response.json() as { title?: unknown };
    return typeof data.title === 'string' && data.title.trim() ? data.title.trim() : null;
}

function mutationInsideReaderRoot(mutation: MutationRecord): boolean {
    const nodes = [mutation.target, ...Array.from(mutation.addedNodes)];
    return nodes.every(node => {
        const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
        return Boolean(element?.closest?.('[data-jpdb-reader-root]'));
    });
}

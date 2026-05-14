import { APP_NAME } from './constants';
import { HAS_JAPANESE } from './dom';
import { uiText } from './i18n';
import { Logger } from './logger';
import type { ReaderSettings } from './types';
import { createWindowEvent, dispatchWindowEvent } from './window-events';

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
const log = Logger.scope('YouTubeFilter');
const FILTER_ACTIVE_CLASS = 'jpdb-youtube-filter-active';

type YouTubeCardDecision = 'pending' | 'shown' | 'filtered';

interface YouTubeCardInfo {
    card: HTMLElement;
    title: string;
}

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
    const title = readYouTubeCardTitleElement(card);
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

function readYouTubeCardInfo(card: HTMLElement): YouTubeCardInfo {
    return {
        card,
        title: readYouTubeCardText(card),
    };
}

function readYouTubeCardTitleElement(card: HTMLElement): HTMLElement | null {
    return card.querySelector<HTMLElement>(TITLE_SELECTOR);
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

class YouTubeReplacementRequester {
    private lastRequest = 0;

    reset(): void {
        this.lastRequest = 0;
    }

    request(shownCount: number): void {
        const now = performance.now();
        if (now - this.lastRequest < 1200) return;
        this.lastRequest = now;

        const previousScrollTop = window.scrollY;
        const scrollTarget = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
        dispatchWindowEvent(createWindowEvent('scroll'));
        if (shownCount < 12 && !/jsdom/i.test(navigator.userAgent)) {
            try {
                window.scrollTo({ top: scrollTarget, behavior: 'auto' });
            } catch {
                // jsdom and some embedded contexts do not implement scrollTo.
            }
            dispatchWindowEvent(createWindowEvent('scroll'));
            try {
                window.scrollTo({ top: previousScrollTop, behavior: 'auto' });
            } catch {
                // Best-effort replacement nudging only.
            }
        }
    }
}

export class YoutubeImmersionFilter {
    private observer?: MutationObserver;
    private timer?: number;
    private timerDue = 0;
    private noticeTimer?: number;
    private bar?: HTMLElement;
    private revealed = false;
    private readonly replacementRequester = new YouTubeReplacementRequester();

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
        window.addEventListener('scroll', () => this.schedule(120), { passive: true });
        this.syncFilterActiveClass();
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
        this.syncFilterActiveClass();
        log.debug('YouTube filter refresh scheduled');
        this.schedule(0);
    }

    private schedule(delay: number): void {
        const due = performance.now() + delay;
        if (this.timer !== undefined && this.timerDue <= due) return;
        window.clearTimeout(this.timer);
        this.timerDue = due;
        this.timer = window.setTimeout(() => {
            this.timer = undefined;
            this.timerDue = 0;
            this.scan();
        }, delay);
        log.debugThrottled('schedule', 1000, 'YouTube filter scan scheduled', { delay });
    }

    private scan(): void {
        void this.scanCards();
    }

    private async scanCards(): Promise<void> {
        const done = log.time('YouTube filter scan');
        const settings = this.options.getSettings();
        if (!settings.youtubeImmersionEnabled) {
            this.clear();
            done();
            return;
        }
        this.syncFilterActiveClass();

        let filteredCount = 0;
        let shownCount = 0;
        let pendingCount = 0;
        for (const card of collectYouTubeVideoCards()) {
            const info = readYouTubeCardInfo(card);
            const decision = this.decideCard(info);

            if (decision === 'pending') {
                pendingCount += 1;
                continue;
            }
            if (decision === 'filtered') filteredCount += 1;
            if (decision === 'shown' || this.revealed) {
                this.showCard(card);
                shownCount += 1;
            } else {
                this.hideCard(card);
            }
        }

        if (settings.youtubeShowFilterNotice) this.renderNotice(filteredCount, shownCount, settings);
        else this.clearNotice();
        if (pendingCount) this.schedule(180);
        if (filteredCount && !this.revealed) {
            this.replacementRequester.request(shownCount);
        }
        log.debug('YouTube filter scan completed', { filteredCount, shownCount, pendingCount, revealed: this.revealed });
        done();
    }

    private decideCard(info: YouTubeCardInfo): YouTubeCardDecision {
        if (!info.title) return 'pending';
        if (isProbablyJapaneseYouTubeText(info.title)) return 'shown';
        return 'filtered';
    }

    private hideCard(card: HTMLElement): void {
        card.dataset.yomuYoutubeChecked = 'true';
        card.classList.remove('jpdb-youtube-filter-pending');
        card.classList.add('jpdb-youtube-filtered');
        card.dataset.yomuYoutubeFiltered = 'true';
    }

    private showCard(card: HTMLElement): void {
        card.dataset.yomuYoutubeChecked = 'true';
        card.classList.remove('jpdb-youtube-filter-pending');
        card.classList.remove('jpdb-youtube-filtered');
        delete card.dataset.yomuYoutubeFiltered;
    }

    private syncFilterActiveClass(): void {
        document.documentElement.classList.toggle(FILTER_ACTIVE_CLASS, isYouTubeHost() && this.options.getSettings().youtubeImmersionEnabled && !this.revealed);
    }

    private renderNotice(filteredCount: number, shownCount: number, settings: ReaderSettings): void {
        if (!filteredCount) {
            this.clearNotice();
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
        window.clearTimeout(this.noticeTimer);
        this.noticeTimer = window.setTimeout(() => this.clearNotice(), 4500);
    }

    private clearNotice(): void {
        window.clearTimeout(this.noticeTimer);
        this.noticeTimer = undefined;
        this.bar?.remove();
        this.bar = undefined;
    }

    private clear(): void {
        window.clearTimeout(this.timer);
        window.clearTimeout(this.noticeTimer);
        this.timer = undefined;
        this.timerDue = 0;
        this.replacementRequester.reset();
        this.revealed = false;
        document.documentElement.classList.remove(FILTER_ACTIVE_CLASS);
        collectYouTubeVideoCards().forEach(card => this.showCard(card));
        document.querySelectorAll<HTMLElement>('[data-yomu-youtube-filtered="true"]').forEach(card => this.showCard(card));
        document.querySelectorAll<HTMLElement>('.jpdb-youtube-filter-pending').forEach(card => card.classList.remove('jpdb-youtube-filter-pending'));
        document.querySelectorAll<HTMLElement>('[data-yomu-youtube-checked="true"]').forEach(card => delete card.dataset.yomuYoutubeChecked);
        document.querySelectorAll<HTMLElement>('[data-yomu-youtube-checked="pending"]').forEach(card => delete card.dataset.yomuYoutubeChecked);
        this.bar?.remove();
        this.bar = undefined;
        log.debug('YouTube filter cleared');
    }
}

function mutationInsideReaderRoot(mutation: MutationRecord): boolean {
    const nodes = [mutation.target, ...Array.from(mutation.addedNodes)];
    return nodes.every(node => {
        const element = node.nodeType === 1 ? node as Element : node.parentElement;
        return Boolean(element?.closest?.('[data-jpdb-reader-root]'));
    });
}

import { APP_NAME } from '../app/constants';
import { unwrapReaderWords } from '../dom/index';
import { uiText } from '../app/i18n';
import type { ReaderSettings } from '../app/types';
import {
    YOUTUBE_CHANNEL_RECOMMENDATION_COUNT,
    YOUTUBE_CHANNEL_RECOMMENDATION_FILTERS,
    allYouTubeChannelRecommendations,
    filterYouTubeChannelRecommendations,
    starterYouTubeChannelRecommendations,
    youtubeChannelRecommendationDescription,
    youtubeChannelUrl,
    type YouTubeChannelRecommendation,
    type YouTubeChannelRecommendationFilter,
} from './youtube-channel-recommendations';
import {
    classifyYouTubeFilterCandidates,
    isProbablyJapaneseYouTubeText,
    type YouTubeFilterCandidate,
    type YouTubeFilterDecision,
} from './youtube-filter-scan';

const YOUTUBE_HOST_RE = /(^|\.)youtube\.com$/i;
const YOUTUBE_READER_ROOT_SELECTOR = '[data-jpdb-reader-root]';
const YOUTUBE_FILTERED_CLASS = 'jpdb-youtube-filtered';
const YOUTUBE_PENDING_CLASS = 'jpdb-youtube-filter-pending';
const YOUTUBE_COLLAPSING_CLASS = 'jpdb-youtube-filter-collapsing';
const YOUTUBE_COLLAPSED_CLASS = 'jpdb-youtube-filter-collapsed';
const YOUTUBE_FILTERED_SELECTOR = `[data-yomu-youtube-filtered="true"],[data-yomu-youtube-pending="true"],.${YOUTUBE_FILTERED_CLASS},.${YOUTUBE_PENDING_CLASS}`;
const SHELF_SELECTOR = 'grid-shelf-view-model,ytd-rich-shelf-renderer,ytd-reel-shelf-renderer,ytd-shelf-renderer,ytm-reel-shelf-renderer';
const SHORTS_CARD_SELECTOR = 'ytd-reel-item-renderer,ytd-reel-video-renderer,ytm-shorts-lockup-view-model,ytm-shorts-lockup-view-model-v2';
const VIDEO_CARD_HIDE_TARGET_SELECTOR = `ytd-rich-item-renderer,ytd-video-renderer,ytd-compact-video-renderer,ytd-grid-video-renderer,ytm-rich-item-renderer,ytm-compact-video-renderer,ytm-video-card-renderer,ytm-video-with-context-renderer,ytm-channel-featured-video-renderer,${SHORTS_CARD_SELECTOR}`;
const VIDEO_CARD_SELECTOR = `${VIDEO_CARD_HIDE_TARGET_SELECTOR},yt-lockup-view-model`;

const VIDEO_CARD_CLOSEST_SELECTOR = VIDEO_CARD_SELECTOR;

const NON_VIDEO_CONTAINER_SELECTOR = `${SHELF_SELECTOR},ytd-playlist-renderer,ytd-compact-playlist-renderer,ytd-radio-renderer,ytd-compact-radio-renderer,ytm-playlist-renderer,ytm-compact-playlist-renderer`;

const FILTERABLE_VIDEO_SHELF_SELECTOR = SHELF_SELECTOR;

const SHORTS_WATCH_ITEM_SELECTOR = 'ytd-shorts,ytd-reel-video-renderer,ytm-shorts-lockup-view-model,ytm-shorts-lockup-view-model-v2';

const TITLE_SELECTORS = [
    '#video-title',
    'a#video-title',
    'yt-formatted-string#video-title',
    'h3 a',
    'h3',
    '.yt-lockup-metadata-view-model-wiz__title',
    '.ytLockupMetadataViewModelTitle',
    '.ytLockupMetadataViewModelHeadingReset',
    'h3.details > span.yt-core-attributed-string',
    'h4.video-card-title > span.yt-core-attributed-string',
    'h4.YtmCompactMediaItemHeadline > span.yt-core-attributed-string',
    '.YtmCompactMediaItemHeadline',
    'h3.media-item-headline > span.yt-core-attributed-string',
    '.media-item-headline',
    '.shortsLockupViewModelHostMetadataTitle span',
    '.shortsLockupViewModelHostMetadataTitle',
    'a[href*="/watch"]',
    'a[href*="/shorts"]',
];

const WATCH_LINK_SELECTOR = 'a[href*="/watch"]';
const SHORTS_LOCAL_LINK_SELECTOR = 'a[href^="/shorts/"]';
const SHORTS_ABSOLUTE_LINK_SELECTOR = 'a[href*="youtube.com/shorts/"]';
const VIDEO_LINK_SELECTORS = `${WATCH_LINK_SELECTOR},${SHORTS_LOCAL_LINK_SELECTOR},${SHORTS_ABSOLUTE_LINK_SELECTOR},a.video-card-title-container,a.video-card-image,a.YtmCompactMediaItemMetadataContent,a.YtmCompactMediaItemImage,a.media-item-thumbnail-container,a.shortsLockupViewModelHostEndpoint,ytm-media-item a[href],.yt-lockup-view-model__content-image,ytd-thumbnail > a,a.yt-simple-endpoint,a#video-title,yt-formatted-string#title > a.yt-simple-endpoint`;

const VIDEO_ANCHOR_SELECTOR = `a[href^="/watch"],a[href*="/watch?v="],a[href*="youtube.com/watch"],${SHORTS_LOCAL_LINK_SELECTOR},${SHORTS_ABSOLUTE_LINK_SELECTOR}`;

const PLAYLIST_BADGE_SELECTOR = 'ytd-thumbnail-overlay-bottom-panel-renderer,ytd-thumbnail-overlay-side-panel-renderer,ytd-badge-supported-renderer,.badge-shape-wiz__text,[aria-label*="再生リスト"],[aria-label*="ミックス"]';
const YOUTUBE_WATCH_TITLE_SELECTOR = 'ytd-watch-metadata h1,ytd-watch-metadata #title';
const YOUTUBE_FEED_CONTAINER_SELECTOR = 'ytd-rich-grid-renderer,ytd-section-list-renderer,ytd-item-section-renderer,ytm-app,ytm-browse,ytm-rich-grid-renderer,ytm-item-section-renderer,ytm-search,lazy-list';
const OEMBED_TITLE_CACHE_LIMIT = 240;
const OEMBED_SESSION_CACHE_PREFIX = 'yomu:youtube-oembed-title:v1:';
const OEMBED_SESSION_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const OEMBED_BATCH_RESCAN_DELAY_MS = 180;
const YOUTUBE_FILTER_NOTICE_AUTO_HIDE_MS = 4200;
const YOUTUBE_FILTER_MUTATION_RESCAN_DELAY_MS = 90;
const YOUTUBE_FILTER_COLLAPSE_DELAY_MS = 80;
const YOUTUBE_FILTER_SCROLL_COLLAPSE_DELAY_MS = 650;
const YOUTUBE_FILTER_SCROLL_SETTLE_MS = 280;
const YOUTUBE_FILTER_COLLAPSE_DURATION_MS = 240;
const YOUTUBE_VISIBLE_BACKFILL_TARGET = 18;
const YOUTUBE_BACKFILL_THROTTLE_MS = 2400;
const YOUTUBE_FILTER_CARD_HEIGHT_PROPERTY = '--yomu-youtube-filter-card-height';
const YOUTUBE_CHANNEL_SHELF_COMPACT_LIMIT = 6;
const YOUTUBE_CHANNEL_SHELF_PREVIEW_LIMIT = 8;
const YOUTUBE_NAVIGATION_RESCAN_DELAY_MS = 120;
const YOUTUBE_NAVIGATION_EVENTS = [
    'yt-navigate-finish',
    'yt-page-data-updated',
    'yt-page-type-changed',
    'popstate',
    'hashchange',
] as const;

type YouTubeCardInfo = {
    card: HTMLElement;
    title: string;
    videoId: string;
};

type StoredOEmbedTitle = {
    title: string | null;
    cachedAt: number;
};

type YouTubeFilterNoticeElements = {
    summary: HTMLElement;
    toggleHidden: HTMLButtonElement;
    hideNotice: HTMLButtonElement;
};

type YouTubeChannelShelfElements = {
    title: HTMLElement;
    copy: HTMLElement;
    status: HTMLElement;
    filters: HTMLElement;
    list: HTMLElement;
    expand: HTMLButtonElement;
    subscribeVisible: HTMLButtonElement;
    subscribeAll: HTMLButtonElement;
    dismiss: HTMLButtonElement;
    never: HTMLButtonElement;
};

type YouTubeChannelPreview = {
    channelId: string;
    title: string;
    avatarUrl: string;
    subscriberText: string;
    description: string;
};

type YouTubeClientConfig = {
    apiKey: string;
    context: Record<string, unknown>;
    clientName: string;
    clientVersion: string;
    visitorId: string;
};

type YouTubeConfigSource = {
    get?: (key: string) => unknown;
    data_?: Record<string, unknown>;
};

function isYouTubeHost(hostname = location.hostname): boolean {
    return YOUTUBE_HOST_RE.test(hostname);
}

export { isProbablyJapaneseYouTubeText };

export function collectYouTubeVideoCards(root: ParentNode = document): HTMLElement[] {
    const cards = new Set<HTMLElement>();
    root.querySelectorAll<HTMLElement>(VIDEO_CARD_SELECTOR).forEach(card => {
        const normalized = normalizeYouTubeVideoCard(card);
        if (normalized) cards.add(normalized);
    });
    root.querySelectorAll<HTMLAnchorElement>(VIDEO_ANCHOR_SELECTOR).forEach(link => {
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
    const titleText = title ? readYouTubeTitleText(title) : '';
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
    private channelShelf?: HTMLElement;
    private revealed = false;
    private dismissedNoticeScope = '';
    private dismissedChannelShelfScope = '';
    private noticeRouteKey = '';
    private channelShelfRouteKey = '';
    private channelShelfExpanded = false;
    private channelShelfFilter: YouTubeChannelRecommendationFilter = 'all';
    private subscriptionBusy = false;
    private lastBackfillAt = Number.NEGATIVE_INFINITY;
    private lastScrollAt = Number.NEGATIVE_INFINITY;
    private destroyed = true;
    private readonly oembedTitleCache = new Map<string, string | null>();
    private readonly pendingOembedTitles = new Set<string>();
    private readonly channelPreviewCache = new Map<string, YouTubeChannelPreview | null>();
    private readonly channelIdCache = new Map<string, string | null>();
    private readonly pendingChannelPreviews = new Set<string>();
    private readonly cardTimers = new WeakMap<HTMLElement, number[]>();
    private readonly compactChannelRecommendations = randomStarterYouTubeChannelRecommendations(YOUTUBE_CHANNEL_SHELF_COMPACT_LIMIT);

    constructor(private readonly options: {
        getSettings: () => ReaderSettings;
        setShowFilterNotice?: (visible: boolean) => void;
        setShowChannelRecommendations?: (visible: boolean) => void;
        isActivePage?: () => boolean;
    }) {}

    // fallow-ignore-next-line unused-class-member
    init(): void {
        this.destroy();
        this.destroyed = false;
        if (!this.isActivePage() || !document.body || !this.options.getSettings().youtubeImmersionEnabled) {
            this.destroyed = true;
            return;
        }

        this.setFilterActiveClass(true);
        this.startWatching();
        this.scan();
    }

    private startWatching(): void {
        if (this.observer || !document.body) return;
        this.events = new AbortController();
        this.observer = new MutationObserver(mutations => {
            if (mutations.every(mutationInsideReaderRoot)) return;
            if (!mutations.some(mutationMayAffectYouTubeCards)) return;
            this.maskAddedYouTubeCards(mutations);
            this.schedule(YOUTUBE_FILTER_MUTATION_RESCAN_DELAY_MS);
        });
        this.observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['href', 'title', 'aria-label'],
            characterData: true,
        });
        for (const eventName of YOUTUBE_NAVIGATION_EVENTS) {
            window.addEventListener(eventName, () => this.schedule(YOUTUBE_NAVIGATION_RESCAN_DELAY_MS), { signal: this.events.signal });
        }
        window.addEventListener('scroll', () => {
            this.lastScrollAt = Date.now();
            if (isNearPageBottom()) this.schedule(180);
        }, { passive: true, signal: this.events.signal });
    }

    // fallow-ignore-next-line unused-class-member
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

        // Clean up any elements that are already pending or filtered but should be ignored
        document.querySelectorAll<HTMLElement>(YOUTUBE_FILTERED_SELECTOR).forEach(card => {
            if (shouldIgnoreYouTubeCardElement(card)) {
                this.showCard(card);
            }
        });

        unwrapYouTubeWatchTitleReaderWords();
        this.restoreCurrentShortsWatchItem();

        const result = classifyYouTubeFilterCandidates(this.collectFilterCandidates(), { revealed: this.revealed });
        result.decisions.forEach(decision => this.applyFilterDecision(decision));
        this.syncFilterableVideoShelves();

        if (settings.youtubeShowFilterNotice && shouldShowFilterNoticeForRoute()) {
            this.renderNotice(result.filteredCount, result.shownCount, settings);
        } else {
            this.bar?.remove();
            this.bar = undefined;
        }
        this.syncChannelShelf(result.filteredCount, settings);
        this.maybeBackfillFeed(result.filteredCount, result.shownCount, result.visibleVideoIds.size);
    }

    private collectFilterCandidates(): YouTubeFilterCandidate[] {
        return collectYouTubeFilterItems().map(card => this.filterCandidateForCard(card));
    }

    private filterCandidateForCard(card: HTMLElement): YouTubeFilterCandidate {
        if (isYouTubeAlwaysHiddenItem(card)) return hiddenYouTubeFilterCandidate(card);
        const info = readYouTubeCardInfo(card);
        return visibleYouTubeFilterCandidate(info, this.resolveTitleForFiltering(info));
    }

    private applyFilterDecision(decision: YouTubeFilterDecision): void {
        if (isCurrentYouTubeShortsWatchCard(decision.candidate.card)) {
            this.showCard(decision.candidate.card);
            return;
        }
        if (decision.kind === 'skip') {
            this.clearPendingCard(decision.candidate.card);
            return;
        }
        if (decision.kind === 'show') {
            this.showCard(decision.candidate.card);
            return;
        }
        this.hideCard(decision.candidate.card);
    }

    private syncFilterableVideoShelves(): void {
        for (const shelf of collectFilterableVideoShelves()) {
            const cards = collectYouTubeVideoCards(shelf);
            if (!cards.length) continue;
            if (cards.every(card => card.classList.contains(YOUTUBE_FILTERED_CLASS))) {
                this.hideCard(shelf);
            } else {
                this.showCard(shelf);
            }
        }
    }

    private restoreCurrentShortsWatchItem(): void {
        // Never let the active Shorts player stay hidden, even if its title is
        // English. Non-current English Shorts are still filtered so scrolling
        // skips them; only the reel the viewer is on is force-shown here.
        if (!isYouTubeShortsWatchPage()) return;
        document.querySelectorAll<HTMLElement>(SHORTS_WATCH_ITEM_SELECTOR).forEach(item => {
            if (isCurrentYouTubeShortsWatchCard(item)) this.showCard(item);
        });
    }

    private hideCard(card: HTMLElement): void {
        const alreadyFiltered = card.classList.contains(YOUTUBE_FILTERED_CLASS);
        this.clearPendingCard(card);
        if (alreadyFiltered) return;

        this.prepareFilteredCard(card);
        card.classList.add(YOUTUBE_FILTERED_CLASS);
        card.dataset.yomuYoutubeFiltered = 'true';
        if (!card.hasAttribute('aria-hidden')) card.dataset.yomuYoutubeAriaHidden = 'true';
        card.setAttribute('aria-hidden', 'true');
        this.queueFilteredCardCollapse(card, this.filteredCardCollapseDelay());
    }

    private showCard(card: HTMLElement): void {
        this.clearCardTimers(card);
        this.clearPendingCard(card);
        card.classList.remove(YOUTUBE_FILTERED_CLASS, YOUTUBE_COLLAPSING_CLASS, YOUTUBE_COLLAPSED_CLASS);
        card.style.removeProperty(YOUTUBE_FILTER_CARD_HEIGHT_PROPERTY);
        if (card.dataset.yomuYoutubeAriaHidden === 'true') {
            card.removeAttribute('aria-hidden');
            delete card.dataset.yomuYoutubeAriaHidden;
        }
        delete card.dataset.yomuYoutubeFiltered;
    }

    private maskAddedYouTubeCards(mutations: MutationRecord[]): void {
        const cards = new Set<HTMLElement>();
        for (const mutation of mutations) {
            mutation.addedNodes.forEach(node => {
                this.collectYouTubeCardsInAddedNode(node).forEach(card => cards.add(card));
            });
        }
        cards.forEach(card => this.markPendingCard(card));
    }

    private collectYouTubeCardsInAddedNode(node: Node): HTMLElement[] {
        if (node.nodeType !== Node.ELEMENT_NODE) return [];
        const element = node as HTMLElement;
        const cards = new Set<HTMLElement>();
        const normalized = normalizeYouTubeFilterItem(element);
        if (normalized) cards.add(normalized);
        collectYouTubeFilterItems(element).forEach(card => cards.add(card));
        return [...cards].filter(card => card.isConnected);
    }

    private markPendingCard(card: HTMLElement): void {
        if (card.classList.contains(YOUTUBE_FILTERED_CLASS)) return;
        card.classList.add(YOUTUBE_PENDING_CLASS);
        card.dataset.yomuYoutubePending = 'true';
    }

    private clearPendingCard(card: HTMLElement): void {
        card.classList.remove(YOUTUBE_PENDING_CLASS);
        delete card.dataset.yomuYoutubePending;
    }

    private prepareFilteredCard(card: HTMLElement): void {
        const height = measuredYouTubeCardHeight(card);
        if (height > 0) card.style.setProperty(YOUTUBE_FILTER_CARD_HEIGHT_PROPERTY, `${Math.ceil(height)}px`);
    }

    private filteredCardCollapseDelay(): number {
        return this.scrollSettleDelay() > 0
            ? YOUTUBE_FILTER_SCROLL_COLLAPSE_DELAY_MS
            : YOUTUBE_FILTER_COLLAPSE_DELAY_MS;
    }

    private scrollSettleDelay(): number {
        const elapsed = Date.now() - this.lastScrollAt;
        if (!Number.isFinite(elapsed)) return 0;
        return Math.max(0, YOUTUBE_FILTER_SCROLL_SETTLE_MS - elapsed);
    }

    private queueFilteredCardCollapse(card: HTMLElement, delay: number): void {
        this.queueCardTimer(card, () => this.collapseFilteredCard(card), delay);
    }

    private collapseFilteredCard(card: HTMLElement): void {
        if (!card.isConnected || !card.classList.contains(YOUTUBE_FILTERED_CLASS)) return;
        if (card.classList.contains(YOUTUBE_COLLAPSED_CLASS)) return;

        const settleDelay = this.scrollSettleDelay();
        if (settleDelay > 0) {
            this.queueFilteredCardCollapse(card, settleDelay + YOUTUBE_FILTER_COLLAPSE_DELAY_MS);
            return;
        }

        card.classList.add(YOUTUBE_COLLAPSING_CLASS);
        this.queueCardTimer(card, () => {
            if (!card.classList.contains(YOUTUBE_FILTERED_CLASS)) return;
            card.classList.add(YOUTUBE_COLLAPSED_CLASS);
            card.classList.remove(YOUTUBE_COLLAPSING_CLASS);
            card.style.removeProperty(YOUTUBE_FILTER_CARD_HEIGHT_PROPERTY);
        }, YOUTUBE_FILTER_COLLAPSE_DURATION_MS);
    }

    private queueCardTimer(card: HTMLElement, callback: () => void, delay: number): void {
        const timer = window.setTimeout(() => {
            const timers = this.cardTimers.get(card)?.filter(id => id !== timer) ?? [];
            if (timers.length) this.cardTimers.set(card, timers);
            else this.cardTimers.delete(card);
            callback();
        }, delay);
        const timers = this.cardTimers.get(card) ?? [];
        timers.push(timer);
        this.cardTimers.set(card, timers);
    }

    private clearCardTimers(card: HTMLElement): void {
        const timers = this.cardTimers.get(card);
        if (!timers) return;
        timers.forEach(timer => window.clearTimeout(timer));
        this.cardTimers.delete(card);
    }

    private renderNotice(filteredCount: number, shownCount: number, settings: ReaderSettings): void {
        if (!filteredCount) {
            this.removeNotice();
            return;
        }

        const noticeScope = this.currentNoticeScope();
        if (!this.bar && this.dismissedNoticeScope === noticeScope) return;
        const shouldStartTimer = !this.bar;

        const notice = this.ensureNoticeBar();
        this.updateNoticeSummary(notice.summary, filteredCount, shownCount, settings);
        this.updateNoticeActions(notice, settings);
        if (shouldStartTimer) this.startNoticeTimer(noticeScope);
    }

    private ensureNoticeBar(): YouTubeFilterNoticeElements {
        if (!this.bar) {
            this.bar = this.createNoticeBar();
            document.body.append(this.bar);
        }
        return this.noticeElements(this.bar);
    }

    private createNoticeBar(): HTMLElement {
        const bar = document.createElement('div');
        bar.className = 'jpdb-youtube-filter-bar';
        bar.dataset.jpdbReaderRoot = 'true';

        const summary = document.createElement('span');
        summary.dataset.role = 'summary';
        const actions = document.createElement('div');
        actions.className = 'jpdb-youtube-filter-actions';

        actions.append(noticeButton('toggle-hidden'), noticeButton('hide-notice'));
        bar.append(summary, actions);
        bar.addEventListener('click', event => this.handleNoticeClick(event));
        return bar;
    }

    private noticeElements(bar: HTMLElement): YouTubeFilterNoticeElements {
        return {
            summary: bar.querySelector<HTMLElement>('[data-role="summary"]')!,
            toggleHidden: bar.querySelector<HTMLButtonElement>('[data-action="toggle-hidden"]')!,
            hideNotice: bar.querySelector<HTMLButtonElement>('[data-action="hide-notice"]')!,
        };
    }

    private handleNoticeClick(event: MouseEvent): void {
        const action = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-action]')?.dataset.action;
        if (action === 'toggle-hidden') this.toggleHiddenVideos();
        if (action === 'hide-notice') this.dismissFilterNotice();
    }

    private toggleHiddenVideos(): void {
        this.revealed = !this.revealed;
        this.schedule(0);
    }

    private dismissFilterNotice(): void {
        this.options.setShowFilterNotice?.(false);
        this.dismissedNoticeScope = this.currentNoticeScope();
        this.removeNotice();
    }

    private updateNoticeSummary(summary: HTMLElement, filteredCount: number, shownCount: number, settings: ReaderSettings): void {
        summary.textContent = this.noticeSummaryText(filteredCount, settings);
        summary.title = shownCount
            ? formatYoutubeText(uiText(settings.interfaceLanguage, 'youtubeFilterVisible'), { count: String(shownCount) })
            : '';
    }

    private noticeSummaryText(filteredCount: number, settings: ReaderSettings): string {
        const plural = filteredCount === 1 ? '' : 's';
        const key = this.revealed ? 'youtubeFilterShowing' : 'youtubeFilterHid';
        return formatYoutubeText(uiText(settings.interfaceLanguage, key), {
            appName: APP_NAME,
            count: String(filteredCount),
            plural,
        });
    }

    private updateNoticeActions(notice: YouTubeFilterNoticeElements, settings: ReaderSettings): void {
        notice.toggleHidden.textContent = this.revealed
            ? uiText(settings.interfaceLanguage, 'youtubeHideHiddenVideos')
            : uiText(settings.interfaceLanguage, 'youtubeShowHiddenVideos');
        notice.hideNotice.textContent = uiText(settings.interfaceLanguage, 'youtubeHideNotice');
    }

    private syncChannelShelf(filteredCount: number, settings: ReaderSettings): void {
        if (!this.shouldShowChannelShelf(filteredCount, settings)) {
            this.removeChannelShelf();
            return;
        }

        const scope = this.currentChannelShelfScope();
        if (!this.channelShelf && this.dismissedChannelShelfScope === scope) return;

        const shelf = this.ensureChannelShelf();
        const elements = this.channelShelfElements(shelf);
        this.renderChannelShelf(elements);
        this.placeChannelShelf(shelf);
    }

    private shouldShowChannelShelf(filteredCount: number, settings: ReaderSettings): boolean {
        if (!settings.youtubeShowChannelRecommendations) return false;
        if (this.revealed) return false;
        if (!shouldShowChannelRecommendationsForRoute()) return false;
        return filteredCount > 0 || isYouTubeHomePage();
    }

    private ensureChannelShelf(): HTMLElement {
        if (!this.channelShelf) this.channelShelf = this.createChannelShelf();
        return this.channelShelf;
    }

    private createChannelShelf(): HTMLElement {
        const shelf = document.createElement('section');
        shelf.className = 'jpdb-youtube-channel-shelf';
        shelf.dataset.jpdbReaderRoot = 'true';
        shelf.setAttribute('role', 'region');
        shelf.setAttribute('aria-label', 'Japanese channel recommendations');

        const header = document.createElement('div');
        header.className = 'jpdb-youtube-channel-shelf-head';
        const copy = document.createElement('div');
        copy.className = 'jpdb-youtube-channel-shelf-copy';
        const eyebrow = document.createElement('div');
        eyebrow.className = 'jpdb-youtube-channel-shelf-eyebrow';
        eyebrow.textContent = APP_NAME;
        const title = document.createElement('h2');
        title.dataset.role = 'channel-title';
        const description = document.createElement('p');
        description.dataset.role = 'channel-copy';
        copy.append(eyebrow, title, description);

        const actions = document.createElement('div');
        actions.className = 'jpdb-youtube-channel-shelf-actions';
        actions.append(
            channelShelfButton('subscribe-visible'),
            channelShelfButton('subscribe-all'),
            channelShelfButton('dismiss'),
            channelShelfButton('never'),
        );
        header.append(copy, actions);

        const filters = document.createElement('div');
        filters.className = 'jpdb-youtube-channel-shelf-filters';
        filters.dataset.role = 'channel-filters';

        const list = document.createElement('ol');
        list.className = 'jpdb-youtube-channel-shelf-list';
        list.dataset.role = 'channel-list';

        const footer = document.createElement('div');
        footer.className = 'jpdb-youtube-channel-shelf-foot';
        const status = document.createElement('div');
        status.className = 'jpdb-youtube-channel-shelf-status';
        status.dataset.role = 'channel-status';
        status.setAttribute('aria-live', 'polite');
        const expand = channelShelfButton('expand');
        footer.append(status, expand);

        shelf.append(header, filters, list, footer);
        shelf.addEventListener('click', event => this.handleChannelShelfClick(event));
        return shelf;
    }

    private channelShelfElements(shelf: HTMLElement): YouTubeChannelShelfElements {
        return {
            title: shelf.querySelector<HTMLElement>('[data-role="channel-title"]')!,
            copy: shelf.querySelector<HTMLElement>('[data-role="channel-copy"]')!,
            status: shelf.querySelector<HTMLElement>('[data-role="channel-status"]')!,
            filters: shelf.querySelector<HTMLElement>('[data-role="channel-filters"]')!,
            list: shelf.querySelector<HTMLElement>('[data-role="channel-list"]')!,
            expand: shelf.querySelector<HTMLButtonElement>('[data-yomu-youtube-channel-action="expand"]')!,
            subscribeVisible: shelf.querySelector<HTMLButtonElement>('[data-yomu-youtube-channel-action="subscribe-visible"]')!,
            subscribeAll: shelf.querySelector<HTMLButtonElement>('[data-yomu-youtube-channel-action="subscribe-all"]')!,
            dismiss: shelf.querySelector<HTMLButtonElement>('[data-yomu-youtube-channel-action="dismiss"]')!,
            never: shelf.querySelector<HTMLButtonElement>('[data-yomu-youtube-channel-action="never"]')!,
        };
    }

    private renderChannelShelf(elements: YouTubeChannelShelfElements): void {
        const recommendations = this.currentChannelRecommendations();
        const visibleRecommendations = this.channelShelfExpanded
            ? recommendations
            : this.compactChannelRecommendations;
        const renderedRecommendations = visibleRecommendations.slice(0, this.channelShelfExpanded ? YOUTUBE_CHANNEL_RECOMMENDATION_COUNT : YOUTUBE_CHANNEL_SHELF_COMPACT_LIMIT);

        this.channelShelf?.classList.toggle('is-expanded', this.channelShelfExpanded);
        elements.title.textContent = 'Start your Japanese YouTube feed';
        elements.copy.textContent = this.channelShelfExpanded
            ? `${recommendations.length} shown from ${YOUTUBE_CHANNEL_RECOMMENDATION_COUNT} curated channels.`
            : `${YOUTUBE_CHANNEL_RECOMMENDATION_COUNT} curated channels, shown as compact YouTube-style rows.`;
        elements.subscribeVisible.textContent = `Subscribe visible (${renderedRecommendations.length})`;
        elements.subscribeAll.textContent = `Subscribe all ${YOUTUBE_CHANNEL_RECOMMENDATION_COUNT}`;
        elements.dismiss.textContent = 'Dismiss';
        elements.never.textContent = 'Hide';
        elements.expand.textContent = this.channelShelfExpanded ? 'Collapse' : 'Browse all channels';
        elements.expand.setAttribute('aria-expanded', String(this.channelShelfExpanded));
        if (!this.subscriptionBusy) elements.status.textContent = readYouTubeClientConfig() ? 'Previews load from YouTube on this page.' : 'Subscribe here when YouTube session data is available.';

        this.renderChannelFilters(elements.filters);
        elements.list.replaceChildren(...renderedRecommendations.map(channel => this.renderChannelRow(channel)));
        this.setChannelShelfBusy(this.subscriptionBusy);
        void this.hydrateChannelPreviews(renderedRecommendations.slice(0, YOUTUBE_CHANNEL_SHELF_PREVIEW_LIMIT));
    }

    private currentChannelRecommendations(): YouTubeChannelRecommendation[] {
        return this.channelShelfExpanded
            ? filterYouTubeChannelRecommendations(this.channelShelfFilter)
            : this.compactChannelRecommendations;
    }

    private renderChannelFilters(filters: HTMLElement): void {
        filters.hidden = !this.channelShelfExpanded;
        if (!this.channelShelfExpanded) {
            filters.replaceChildren();
            return;
        }
        filters.replaceChildren(...YOUTUBE_CHANNEL_RECOMMENDATION_FILTERS.map(filter => {
            const button = channelShelfButton('filter');
            button.dataset.filter = filter.id;
            button.textContent = filter.label;
            button.setAttribute('aria-pressed', String(filter.id === this.channelShelfFilter));
            return button;
        }));
    }

    private renderChannelRow(channel: YouTubeChannelRecommendation): HTMLElement {
        const preview = this.channelPreviewCache.get(channel.handle) ?? null;
        const row = document.createElement('li');
        row.className = 'jpdb-youtube-channel-row';
        row.dataset.yomuChannelHandle = channel.handle;
        row.append(
            this.renderChannelAvatar(channel, preview),
            this.renderChannelBody(channel, preview),
            this.renderChannelSubscribeButton(channel),
        );
        return row;
    }

    private renderChannelAvatar(channel: YouTubeChannelRecommendation, preview: YouTubeChannelPreview | null): HTMLElement {
        const avatar = document.createElement('a');
        avatar.className = 'jpdb-youtube-channel-avatar';
        avatar.href = youtubeChannelUrl(channel);
        avatar.target = '_blank';
        avatar.rel = 'noopener';
        avatar.setAttribute('aria-label', `${channel.name} on YouTube`);

        const fallback = document.createElement('span');
        fallback.textContent = channel.name.trim().charAt(0).toUpperCase() || '日';
        const image = document.createElement('img');
        const avatarUrl = preview?.avatarUrl ?? '';
        image.alt = '';
        image.hidden = !avatarUrl;
        if (avatarUrl) image.src = avatarUrl;
        avatar.append(image, fallback);
        return avatar;
    }

    private renderChannelBody(channel: YouTubeChannelRecommendation, preview: YouTubeChannelPreview | null): HTMLElement {
        const body = document.createElement('div');
        body.className = 'jpdb-youtube-channel-body';

        const name = document.createElement('a');
        name.className = 'jpdb-youtube-channel-name';
        name.href = youtubeChannelUrl(channel);
        name.target = '_blank';
        name.rel = 'noopener';
        name.textContent = preview?.title || channel.name;

        const meta = document.createElement('div');
        meta.className = 'jpdb-youtube-channel-meta';
        meta.textContent = channelRowMetaText(channel, preview);

        const description = document.createElement('div');
        description.className = 'jpdb-youtube-channel-description';
        description.textContent = preview?.description || youtubeChannelRecommendationDescription(channel);

        const tags = document.createElement('div');
        tags.className = 'jpdb-youtube-channel-tags';
        channelRowTags(channel).forEach(tag => {
            const chip = document.createElement('span');
            chip.textContent = tag;
            tags.append(chip);
        });

        body.append(name, meta, description, tags);
        return body;
    }

    private renderChannelSubscribeButton(channel: YouTubeChannelRecommendation): HTMLButtonElement {
        const subscribe = channelShelfButton('subscribe-one');
        subscribe.dataset.handle = channel.handle;
        subscribe.textContent = 'Subscribe';
        subscribe.setAttribute('aria-label', `Subscribe to ${channel.name}`);
        return subscribe;
    }

    private placeChannelShelf(shelf: HTMLElement): void {
        if (shelf.isConnected) return;
        const anchor = findChannelShelfAnchor();
        if (anchor) {
            anchor.prepend(shelf);
            return;
        }
        document.body?.prepend(shelf);
    }

    private handleChannelShelfClick(event: MouseEvent): void {
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-yomu-youtube-channel-action]');
        if (!button) return;
        this.handleChannelShelfAction(button);
    }

    private handleChannelShelfAction(button: HTMLButtonElement): void {
        const action = button.dataset.yomuYoutubeChannelAction;
        if (this.handleChannelShelfViewAction(action, button)) return;
        this.handleChannelShelfSubscriptionAction(action, button);
    }

    private handleChannelShelfViewAction(action: string | undefined, button: HTMLButtonElement): boolean {
        switch (action) {
            case 'expand':
                this.channelShelfExpanded = !this.channelShelfExpanded;
                this.renderChannelShelf(this.channelShelfElements(this.ensureChannelShelf()));
                return true;
            case 'filter':
                this.channelShelfFilter = (button.dataset.filter as YouTubeChannelRecommendationFilter | undefined) ?? 'all';
                this.channelShelfExpanded = true;
                this.renderChannelShelf(this.channelShelfElements(this.ensureChannelShelf()));
                return true;
            case 'dismiss':
                this.dismissedChannelShelfScope = this.currentChannelShelfScope();
                this.removeChannelShelf();
                return true;
            case 'never':
                this.options.setShowChannelRecommendations?.(false);
                this.removeChannelShelf();
                return true;
            default:
                return false;
        }
    }

    private handleChannelShelfSubscriptionAction(action: string | undefined, button: HTMLButtonElement): void {
        switch (action) {
            case 'subscribe-one':
                this.subscribeToChannelHandle(button.dataset.handle);
                return;
            case 'subscribe-visible':
                void this.subscribeToChannels(this.currentRenderedChannels());
                return;
            case 'subscribe-all':
                void this.subscribeToChannels(allYouTubeChannelRecommendations());
                return;
        }
    }

    private subscribeToChannelHandle(handle: string | undefined): void {
        const channel = allYouTubeChannelRecommendations().find(candidate => candidate.handle === handle);
        if (channel) void this.subscribeToChannels([channel]);
    }

    private currentRenderedChannels(): YouTubeChannelRecommendation[] {
        if (!this.channelShelfExpanded) return this.compactChannelRecommendations;
        return filterYouTubeChannelRecommendations(this.channelShelfFilter);
    }

    private async hydrateChannelPreviews(channels: YouTubeChannelRecommendation[]): Promise<void> {
        const config = readYouTubeClientConfig();
        if (!config) return;
        for (const channel of channels) {
            if (this.channelPreviewCache.has(channel.handle) || this.pendingChannelPreviews.has(channel.handle)) continue;
            this.pendingChannelPreviews.add(channel.handle);
            void fetchYouTubeChannelPreview(channel, config, this.channelIdCache)
                .then(preview => {
                    this.channelPreviewCache.set(channel.handle, preview);
                    if (preview?.channelId) this.channelIdCache.set(channel.handle, preview.channelId);
                    this.updateRenderedChannelPreview(channel);
                })
                .catch(() => {
                    this.channelPreviewCache.set(channel.handle, null);
                })
                .finally(() => {
                    this.pendingChannelPreviews.delete(channel.handle);
                });
        }
    }

    private updateRenderedChannelPreview(channel: YouTubeChannelRecommendation): void {
        if (!this.channelShelf) return;
        const row = Array.from(this.channelShelf.querySelectorAll<HTMLElement>('[data-yomu-channel-handle]'))
            .find(candidate => candidate.dataset.yomuChannelHandle === channel.handle);
        if (!row) return;
        const replacement = this.renderChannelRow(channel);
        row.replaceWith(replacement);
    }

    private async subscribeToChannels(channels: YouTubeChannelRecommendation[]): Promise<void> {
        if (this.subscriptionBusy || !channels.length) return;
        const elements = this.channelShelfElements(this.ensureChannelShelf());
        const config = readYouTubeClientConfig();
        if (!config) {
            elements.status.textContent = 'YouTube session data is not available on this page yet.';
            return;
        }

        this.subscriptionBusy = true;
        this.setChannelShelfBusy(true);
        let subscribed = 0;
        let failed = 0;
        for (let index = 0; index < channels.length; index += 1) {
            const channel = channels[index]!;
            elements.status.textContent = `Subscribing ${index + 1}/${channels.length}: ${channel.name}`;
            try {
                const channelId = await resolveYouTubeChannelId(channel, config, this.channelIdCache);
                if (!channelId) throw new Error('Missing YouTube channel id.');
                await subscribeYouTubeChannel(channelId, config);
                subscribed += 1;
            } catch {
                failed += 1;
            }
        }
        this.subscriptionBusy = false;
        this.setChannelShelfBusy(false);
        elements.status.textContent = failed
            ? `Subscribed to ${subscribed}; ${failed} could not be completed by YouTube.`
            : `Subscribed to ${subscribed} channel${subscribed === 1 ? '' : 's'}.`;
    }

    private setChannelShelfBusy(busy: boolean): void {
        this.channelShelf?.querySelectorAll<HTMLButtonElement>('[data-yomu-youtube-channel-action^="subscribe"]').forEach(button => {
            button.disabled = busy;
        });
        this.channelShelf?.setAttribute('aria-busy', String(busy));
    }

    private removeChannelShelf(): void {
        this.channelShelf?.remove();
        this.channelShelf = undefined;
    }

    private currentChannelShelfScope(): string {
        const routeKey = this.currentRouteKey();
        if (this.channelShelfRouteKey !== routeKey) {
            this.channelShelfRouteKey = routeKey;
            this.dismissedChannelShelfScope = '';
            this.removeChannelShelf();
        }
        return routeKey;
    }

    private clear(): void {
        window.clearTimeout(this.timer);
        window.clearTimeout(this.metadataRescanTimer);
        this.timer = undefined;
        this.metadataRescanTimer = undefined;
        this.revealed = false;
        this.clearFilteredCards();
        this.removeNotice();
        this.removeChannelShelf();
        this.dismissedNoticeScope = '';
        this.dismissedChannelShelfScope = '';
        this.noticeRouteKey = '';
        this.channelShelfRouteKey = '';
        this.channelShelfExpanded = false;
        this.channelShelfFilter = 'all';
        this.subscriptionBusy = false;
        this.lastBackfillAt = Number.NEGATIVE_INFINITY;
        this.lastScrollAt = Number.NEGATIVE_INFINITY;
        this.setFilterActiveClass(false);
    }

    private resolveTitleForFiltering(info: YouTubeCardInfo): string {
        if (!info.videoId) return info.title;
        const cached = this.cachedOEmbedTitle(info.videoId);
        if (cached !== undefined) return cached || info.title;
        this.fetchOriginalTitle(info.videoId);
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
        document
            .querySelectorAll<HTMLElement>(YOUTUBE_FILTERED_SELECTOR)
            .forEach(card => this.showCard(card));
    }

    private currentNoticeScope(): string {
        const routeKey = this.currentRouteKey();
        if (this.noticeRouteKey !== routeKey) {
            this.noticeRouteKey = routeKey;
            this.dismissedNoticeScope = '';
            this.removeNotice();
        }
        return `${routeKey}:${this.revealed ? 'revealed' : 'hidden'}`;
    }

    private currentRouteKey(): string {
        return `${location.pathname}${location.search}`;
    }

    private maybeBackfillFeed(filteredCount: number, shownCount: number, visibleUniqueCount: number): void {
        const now = performance.now();
        if (!shouldBackfillYouTubeFeed({
            filteredCount,
            lastBackfillAt: this.lastBackfillAt,
            now,
            revealed: this.revealed,
            shownCount,
            visibleUniqueCount,
        })) return;

        const continuation = findYouTubeContinuationItem();
        if (!continuation) return;
        if (nudgeYouTubeContinuationItem(continuation)) this.lastBackfillAt = now;
    }

    private setFilterActiveClass(active: boolean): void {
        document.documentElement.classList.toggle('jpdb-youtube-filter-active', active);
    }
}

function formatYoutubeText(template: string, values: Record<string, string>): string {
    return template.replace(/\{(\w+)\}/g, (_match: string, key: string) => values[key] ?? '');
}

function noticeButton(action: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.action = action;
    return button;
}

function channelShelfButton(action: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.yomuYoutubeChannelAction = action;
    return button;
}

function channelRowMetaText(channel: YouTubeChannelRecommendation, preview: YouTubeChannelPreview | null): string {
    const subscriberText = preview?.subscriberText ?? '';
    return subscriberText ? `${channel.handle} · ${subscriberText}` : channel.handle;
}

function channelRowTags(channel: YouTubeChannelRecommendation): string[] {
    const tags = [channel.level, ...channel.topics.slice(0, 2)];
    if (channel.captions.length) tags.push('captions');
    return tags;
}

function findChannelShelfAnchor(): HTMLElement | null {
    return document.querySelector<HTMLElement>(
        'ytd-rich-grid-renderer #contents, ytd-two-column-browse-results-renderer #contents, ytd-section-list-renderer, ytm-rich-grid-renderer, ytm-browse, ytm-search, main',
    );
}

function isYouTubeHomePage(): boolean {
    return location.pathname === '/' || location.pathname === '/feed/explore';
}

function shouldShowChannelRecommendationsForRoute(): boolean {
    if (isYouTubeWatchPage()) return false;
    if (isYouTubeShortsWatchPage()) return false;
    return isYouTubeHomePage()
        || location.pathname === '/results'
        || location.pathname.startsWith('/feed/subscriptions');
}

function readYouTubeClientConfig(): YouTubeClientConfig | null {
    const ytcfg = readYouTubeConfigSource();
    const apiKey = readYouTubeConfigString(ytcfg, 'INNERTUBE_API_KEY');
    if (!apiKey) return null;
    const context = readYouTubeInnerTubeContext(ytcfg);
    const client = recordValue(context.client) ?? {};
    return {
        apiKey,
        context,
        clientName: readYouTubeClientString(ytcfg, client, 'INNERTUBE_CLIENT_NAME', 'clientName', '1'),
        clientVersion: readYouTubeClientString(ytcfg, client, 'INNERTUBE_CLIENT_VERSION', 'clientVersion'),
        visitorId: readYouTubeClientString(ytcfg, client, 'VISITOR_DATA', 'visitorData'),
    };
}

function readYouTubeConfigSource(): YouTubeConfigSource | undefined {
    return (window as Window & { ytcfg?: YouTubeConfigSource }).ytcfg ?? readYouTubeConfigSourceFromScripts();
}

function readYouTubeConfigString(ytcfg: YouTubeConfigSource | undefined, key: string): string {
    return stringValue(readYouTubeConfigValue(ytcfg, key));
}

function readYouTubeConfigValue(ytcfg: YouTubeConfigSource | undefined, key: string): unknown {
    try {
        if (typeof ytcfg?.get === 'function') return ytcfg.get(key);
    } catch {
        // Fall through to ytcfg.data_.
    }
    return ytcfg?.data_?.[key];
}

function readYouTubeConfigSourceFromScripts(): YouTubeConfigSource | undefined {
    const data: Record<string, unknown> = {};
    for (const key of ['INNERTUBE_API_KEY', 'INNERTUBE_CLIENT_NAME', 'INNERTUBE_CLIENT_VERSION', 'VISITOR_DATA']) {
        const value = readYouTubeConfigScriptValue(key);
        if (value) data[key] = value;
    }
    const context = readYouTubeConfigScriptObject('INNERTUBE_CONTEXT');
    if (context) data.INNERTUBE_CONTEXT = context;
    return Object.keys(data).length ? { data_: data } : undefined;
}

function readYouTubeConfigScriptValue(key: string): string {
    const escapedKey = escapeRegExp(key);
    const patterns = [
        new RegExp(`"${escapedKey}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 'u'),
        new RegExp(`${escapedKey}\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`, 'u'),
    ];
    for (const script of Array.from(document.scripts)) {
        const text = script.textContent ?? '';
        const raw = patterns.map(pattern => text.match(pattern)?.[1]).find(Boolean);
        if (raw) return unescapeYouTubeConfigString(raw);
    }
    return '';
}

function readYouTubeConfigScriptObject(key: string): Record<string, unknown> | null {
    const escapedKey = escapeRegExp(key);
    const pattern = new RegExp(`"${escapedKey}"\\s*:\\s*(\\{.+?\\})\\s*,\\s*"`, 'su');
    for (const script of Array.from(document.scripts)) {
        const text = script.textContent ?? '';
        const raw = text.match(pattern)?.[1];
        if (!raw) continue;
        try {
            return recordValue(JSON.parse(raw));
        } catch {
            return null;
        }
    }
    return null;
}

function unescapeYouTubeConfigString(value: string): string {
    try {
        return JSON.parse(`"${value}"`) as string;
    } catch {
        return value;
    }
}

function readYouTubeInnerTubeContext(ytcfg: YouTubeConfigSource | undefined): Record<string, unknown> {
    return recordValue(readYouTubeConfigValue(ytcfg, 'INNERTUBE_CONTEXT')) ?? defaultYouTubeInnerTubeContext(ytcfg);
}

function defaultYouTubeInnerTubeContext(ytcfg: YouTubeConfigSource | undefined): Record<string, unknown> {
    return {
        client: {
            clientName: firstStringValue(readYouTubeConfigValue(ytcfg, 'INNERTUBE_CLIENT_NAME'), 'WEB'),
            clientVersion: firstStringValue(readYouTubeConfigValue(ytcfg, 'INNERTUBE_CLIENT_VERSION'), '2.20240101.00.00'),
        },
    };
}

function readYouTubeClientString(
    ytcfg: YouTubeConfigSource | undefined,
    client: Record<string, unknown>,
    configKey: string,
    clientKey: string,
    fallback = '',
): string {
    return firstStringValue(readYouTubeConfigValue(ytcfg, configKey), client[clientKey], fallback);
}

async function fetchYouTubeChannelPreview(
    channel: YouTubeChannelRecommendation,
    config: YouTubeClientConfig,
    channelIdCache: Map<string, string | null>,
): Promise<YouTubeChannelPreview | null> {
    const channelId = await resolveYouTubeChannelId(channel, config, channelIdCache);
    if (!channelId) return null;
    const data = await postYouTubeInnerTube('browse', config, { browseId: channelId });
    return youTubeChannelPreviewFromBrowseData(channel, channelId, data);
}

function youTubeChannelPreviewFromBrowseData(
    channel: YouTubeChannelRecommendation,
    channelId: string,
    data: Record<string, unknown>,
): YouTubeChannelPreview {
    const metadata = youTubeChannelMetadata(data);
    return {
        channelId,
        title: youTubeChannelPreviewTitle(channel, metadata, data),
        avatarUrl: youTubeChannelPreviewAvatarUrl(metadata, data),
        subscriberText: findNestedString(data, 'subscriberCountText'),
        description: youTubeChannelPreviewDescription(metadata, data),
    };
}

function youTubeChannelMetadata(data: Record<string, unknown>): Record<string, unknown> {
    return recordValue(recordValue(data.metadata)?.channelMetadataRenderer) ?? {};
}

function youTubeChannelPreviewTitle(
    channel: YouTubeChannelRecommendation,
    metadata: Record<string, unknown>,
    data: Record<string, unknown>,
): string {
    return firstStringValue(metadata.title, findNestedString(data, 'title'), channel.name);
}

function youTubeChannelPreviewAvatarUrl(metadata: Record<string, unknown>, data: Record<string, unknown>): string {
    const avatarUrl = thumbnailUrl(metadata.avatar);
    return avatarUrl || findNestedThumbnailUrl(data);
}

function youTubeChannelPreviewDescription(metadata: Record<string, unknown>, data: Record<string, unknown>): string {
    return firstStringValue(metadata.description, findNestedString(data, 'description'));
}

async function resolveYouTubeChannelId(
    channel: YouTubeChannelRecommendation,
    config: YouTubeClientConfig,
    channelIdCache: Map<string, string | null>,
): Promise<string | null> {
    if (channelIdCache.has(channel.handle)) return channelIdCache.get(channel.handle) ?? null;
    const data = await postYouTubeInnerTube('navigation/resolve_url', config, {
        url: youtubeChannelUrl(channel),
    });
    const channelId = findNestedString(data, 'browseId', value => /^UC[\w-]{20,}$/u.test(value));
    channelIdCache.set(channel.handle, channelId);
    return channelId;
}

async function subscribeYouTubeChannel(channelId: string, config: YouTubeClientConfig): Promise<void> {
    await postYouTubeInnerTube('subscription/subscribe', config, {
        channelIds: [channelId],
    });
}

async function postYouTubeInnerTube(path: string, config: YouTubeClientConfig, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    const response = await fetch(`${location.origin}/youtubei/v1/${path}?key=${encodeURIComponent(config.apiKey)}&prettyPrint=false`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: youtubeInnerTubeHeaders(config),
        body: JSON.stringify({ context: config.context, ...body }),
    });
    if (!response.ok) throw new Error(`YouTube request failed: ${response.status}`);
    const json = await response.json() as unknown;
    return recordValue(json) ?? {};
}

function youtubeInnerTubeHeaders(config: YouTubeClientConfig): Record<string, string> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-YouTube-Client-Name': config.clientName,
        'X-YouTube-Client-Version': config.clientVersion,
    };
    if (config.visitorId) headers['X-Goog-Visitor-Id'] = config.visitorId;
    return headers;
}

function findNestedString(value: unknown, key: string, predicate: (value: string) => boolean = Boolean): string {
    return findNestedYouTubeValue(value, candidate => nestedYouTubeText(candidate, key, predicate));
}

function findNestedThumbnailUrl(value: unknown): string {
    return findNestedYouTubeValue(value, nestedYouTubeThumbnailUrl);
}

function findNestedYouTubeValue(value: unknown, readValue: (value: unknown) => string): string {
    if (!isNestedYouTubeValue(value)) return '';
    const direct = readValue(value);
    if (direct) return direct;
    for (const child of nestedYouTubeChildren(value)) {
        const found = findNestedYouTubeValue(child, readValue);
        if (found) return found;
    }
    return '';
}

function nestedYouTubeText(value: unknown, key: string, predicate: (value: string) => boolean): string {
    const record = recordValue(value);
    if (!record) return '';
    const text = textFromYouTubeValue(record[key]);
    return text && predicate(text) ? text : '';
}

function nestedYouTubeThumbnailUrl(value: unknown): string {
    const record = recordValue(value);
    if (!record) return '';
    return thumbnailUrl(record.thumbnail) || thumbnailUrl(record.avatar);
}

function nestedYouTubeChildren(value: Record<string, unknown> | unknown[]): unknown[] {
    return Array.isArray(value) ? value : Object.values(value);
}

function isNestedYouTubeValue(value: unknown): value is Record<string, unknown> | unknown[] {
    return Boolean(value) && typeof value === 'object';
}

function thumbnailUrl(value: unknown): string {
    const thumbnails = recordValue(value)?.thumbnails;
    if (!Array.isArray(thumbnails)) return '';
    const candidates = thumbnails
        .map(thumbnail => recordValue(thumbnail))
        .filter(Boolean)
        .sort((a, b) => Number(b?.width ?? 0) - Number(a?.width ?? 0));
    return stringValue(candidates[0]?.url);
}

function textFromYouTubeValue(value: unknown): string {
    if (typeof value === 'string') return value.trim();
    const record = recordValue(value);
    if (!record) return '';
    const simpleText = stringValue(record.simpleText);
    if (simpleText) return simpleText;
    const runs = record.runs;
    if (Array.isArray(runs)) {
        return runs.map(run => stringValue(recordValue(run)?.text)).join('').trim();
    }
    return '';
}

function stringValue(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function firstStringValue(...values: unknown[]): string {
    for (const value of values) {
        const text = stringValue(value);
        if (text) return text;
    }
    return '';
}

function recordValue(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function randomStarterYouTubeChannelRecommendations(limit: number): YouTubeChannelRecommendation[] {
    const channels = starterYouTubeChannelRecommendations(YOUTUBE_CHANNEL_RECOMMENDATION_COUNT);
    return shuffleYouTubeChannels(channels).slice(0, limit);
}

function shuffleYouTubeChannels(channels: YouTubeChannelRecommendation[]): YouTubeChannelRecommendation[] {
    const shuffled = [...channels];
    for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex]!, shuffled[index]!];
    }
    return shuffled;
}

function hiddenYouTubeFilterCandidate(card: HTMLElement): YouTubeFilterCandidate {
    return {
        card,
        title: '',
        videoId: '',
        filterText: '',
        alwaysHidden: true,
    };
}

function visibleYouTubeFilterCandidate(info: YouTubeCardInfo, filterText: string): YouTubeFilterCandidate {
    return {
        card: info.card,
        title: youTubeFilterCandidateTitle(info, filterText),
        videoId: info.videoId,
        filterText,
        alwaysHidden: false,
    };
}

function youTubeFilterCandidateTitle(info: YouTubeCardInfo, filterText: string): string {
    return info.title || filterText || info.videoId || '';
}

function readYouTubeTitleText(title: HTMLElement): string {
    const visibleTitle = [
        title.getAttribute('title'),
        title.textContent,
    ].find(value => value?.trim());
    if (visibleTitle) return visibleTitle.trim();
    return cleanYouTubeAriaTitle(title.getAttribute('aria-label') ?? '');
}

function cleanYouTubeAriaTitle(title: string): string {
    return title
        .split(/\s+by\s+/i)[0]
        .split(/\s+視聴回数\s*/)[0]
        .split(/\s+再生回数\s*/)[0]
        .split(/\s+回視聴\s*/)[0]
        .split(/\s+views?\s*/i)[0]
        .split(/\s+•\s*/)[0]
        .split(/\s+·\s*/)[0]
        .split(/\s*,\s*/)[0]
        .trim();
}

function collectYouTubeFilterItems(root: ParentNode = document): HTMLElement[] {
    const items = new Set<HTMLElement>(collectYouTubeVideoCards(root));
    root.querySelectorAll<HTMLElement>(`${VIDEO_CARD_SELECTOR},${NON_VIDEO_CONTAINER_SELECTOR}`).forEach(element => {
        const normalized = normalizeYouTubeFilterItem(element);
        if (normalized) items.add(normalized);
    });
    return [...items].filter(item => item.isConnected);
}

function collectFilterableVideoShelves(root: ParentNode = document): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>(FILTERABLE_VIDEO_SHELF_SELECTOR))
        .filter(isFilterableVideoShelf);
}

function normalizeYouTubeFilterItem(element: HTMLElement): HTMLElement | null {
    if (shouldIgnoreYouTubeCardElement(element)) return null;
    if (element.matches(NON_VIDEO_CONTAINER_SELECTOR)) return normalizeYouTubeNonVideoContainer(element);
    if (isYouTubePlaylistLikeCard(element)) {
        const target = youtubeCardHideTarget(element);
        if (target) return target;
        if (element.matches('ytd-playlist-renderer,ytd-compact-playlist-renderer,ytm-playlist-renderer,ytm-compact-playlist-renderer,ytd-grid-playlist-renderer,yt-lockup-view-model')) {
            return element;
        }
        return null;
    }
    return normalizeYouTubeVideoCard(element);
}

function isYouTubeAlwaysHiddenItem(card: HTMLElement): boolean {
    return card.matches(NON_VIDEO_CONTAINER_SELECTOR) || isYouTubePlaylistLikeCard(card);
}

function normalizeYouTubeNonVideoContainer(element: HTMLElement): HTMLElement | null {
    if (isFilterableVideoShelf(element)) return null;
    return element;
}

function isFilterableVideoShelf(element: HTMLElement): boolean {
    return element.matches(FILTERABLE_VIDEO_SHELF_SELECTOR)
        && collectYouTubeVideoCards(element).length > 0;
}

function normalizeYouTubeVideoCard(element: HTMLElement): HTMLElement | null {
    if (!isNormalizableYouTubeVideoCard(element)) return null;
    return youtubeCardHideTarget(element);
}

function isNormalizableYouTubeVideoCard(element: HTMLElement): boolean {
    if (shouldIgnoreYouTubeCardElement(element)) return false;
    if (element.matches(NON_VIDEO_CONTAINER_SELECTOR)) return false;
    if (!hasYouTubeVideoLink(element)) return false;
    if (isYouTubePlaylistLikeCard(element)) return false;
    return !isInsideExcludedYouTubeContainer(element);
}

function shouldIgnoreYouTubeCardElement(element: HTMLElement): boolean {
    if (!element.isConnected) return true;
    if (element.closest(YOUTUBE_READER_ROOT_SELECTOR)) return true;

    // Ignore native YouTube shell and main page components to prevent them from
    // being incorrectly matched as video cards or playlist shelves.
    const ignoredShellSelector = [
        'ytd-watch-metadata',
        'ytm-watch',
        '#movie_player',
        '.html5-video-player',
        'ytd-comments',
        '#comments',
        'ytd-masthead',
        '#masthead',
        'ytd-guide-renderer',
        '#guide',
        'ytd-playlist-header-renderer',
        'ytm-playlist-header-renderer',
        'ytd-c4-tabbed-header-renderer',
        'ytd-channel-sub-menu-renderer',
    ].join(',');
    if (closestCrossingShadow(element, ignoredShellSelector)) return true;

    return false;
}

function closestCrossingShadow(element: HTMLElement, selector: string): HTMLElement | null {
    let current: Node | null = element;
    while (current) {
        if (current instanceof HTMLElement && current.matches(selector)) {
            return current;
        }
        if (current.parentNode) {
            current = current.parentNode;
        } else if (current instanceof ShadowRoot) {
            current = current.host;
        } else {
            current = null;
        }
    }
    return null;
}

function hasYouTubeVideoLink(element: HTMLElement): boolean {
    return Boolean(element.querySelector(VIDEO_LINK_SELECTORS));
}

function isInsideExcludedYouTubeContainer(element: HTMLElement): boolean {
    const excluded = element.closest<HTMLElement>(NON_VIDEO_CONTAINER_SELECTOR);
    if (!excluded || excluded.matches(VIDEO_CARD_SELECTOR)) return false;
    const cardInsideExcluded = element.closest<HTMLElement>(VIDEO_CARD_SELECTOR);
    return !cardInsideExcluded || cardInsideExcluded === excluded;
}

function youtubeCardHideTarget(element: HTMLElement): HTMLElement | null {
    const outer = element.closest<HTMLElement>(VIDEO_CARD_HIDE_TARGET_SELECTOR);
    if (outer?.querySelector(VIDEO_LINK_SELECTORS)) return outer;
    return element.closest<HTMLElement>(VIDEO_CARD_SELECTOR);
}

function measuredYouTubeCardHeight(card: HTMLElement): number {
    const rect = card.getBoundingClientRect();
    return Math.max(rect.height, card.offsetHeight, card.scrollHeight, 0);
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

function isCurrentYouTubeShortsWatchCard(card: HTMLElement): boolean {
    if (!isYouTubeShortsWatchPage()) return false;
    const item = card.closest<HTMLElement>(SHORTS_WATCH_ITEM_SELECTOR) ?? card;
    // Protect the active reel by several independent signals so the player is
    // never blanked: YouTube's own active marker, the reel covering the
    // viewport centre (snap feed always centres the current short), and the
    // URL video id. Any match keeps the reel visible.
    if (isActiveYouTubeShortsReel(item)) return true;
    const currentVideoId = currentYouTubeShortsVideoId();
    return Boolean(currentVideoId) && readYouTubeVideoId(item) === currentVideoId;
}

function isActiveYouTubeShortsReel(item: HTMLElement): boolean {
    if (item.hasAttribute('is-active') || item.getAttribute('aria-hidden') === 'false') return true;
    const rect = item.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const viewportCenter = window.innerHeight / 2;
    return rect.top <= viewportCenter && rect.bottom >= viewportCenter;
}

function currentYouTubeShortsVideoId(): string {
    return location.pathname.match(/^\/shorts\/([^/?#]+)/)?.[1] ?? '';
}

function isNearPageBottom(): boolean {
    const page = document.scrollingElement ?? document.documentElement;
    return window.scrollY + window.innerHeight >= page.scrollHeight - Math.max(900, window.innerHeight);
}

function shouldBackfillYouTubeFeed(options: {
    filteredCount: number;
    lastBackfillAt: number;
    now: number;
    revealed: boolean;
    shownCount: number;
    visibleUniqueCount: number;
}): boolean {
    if (options.revealed) return false;
    if (!options.filteredCount) return false;
    if (isYouTubeWatchPage()) return false;
    if (isYouTubeShortsWatchPage()) return false;
    if (Math.max(options.shownCount, options.visibleUniqueCount) >= YOUTUBE_VISIBLE_BACKFILL_TARGET) return false;
    return options.now - options.lastBackfillAt >= YOUTUBE_BACKFILL_THROTTLE_MS;
}

function findYouTubeContinuationItem(): HTMLElement | null {
    const continuation = document.querySelector<HTMLElement>('ytd-continuation-item-renderer, ytm-continuation-item-renderer, tp-yt-paper-spinner-lite');
    return continuation?.isConnected ? continuation : null;
}

function nudgeYouTubeContinuationItem(continuation: HTMLElement): boolean {
    if (!isNearPageBottom()) return false;
    continuation.scrollIntoView({ block: 'end' });
    return true;
}

function isYouTubeWatchPage(): boolean {
    return location.pathname === '/watch';
}

function shouldShowFilterNoticeForRoute(): boolean {
    return !isYouTubeWatchPage() && !isYouTubeShortsWatchPage();
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
        return Boolean(element?.closest?.(YOUTUBE_READER_ROOT_SELECTOR));
    });
}

function mutationMayAffectYouTubeCards(mutation: MutationRecord): boolean {
    const nodes = [mutation.target, ...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)];
    return nodes.some(nodeMayAffectYouTubeCards);
}

function nodeMayAffectYouTubeCards(node: Node): boolean {
    const element = elementForYouTubeCardMutation(node);
    if (!element) return false;
    if (isYouTubeCardOrFeedElement(element)) return true;
    if (element.querySelector(VIDEO_CARD_SELECTOR)) return true;
    return Boolean(element.querySelector(VIDEO_ANCHOR_SELECTOR));
}

function elementForYouTubeCardMutation(node: Node): Element | null {
    const element = node.nodeType === Node.ELEMENT_NODE ? node as Element : node.parentElement;
    if (!element || element.closest(YOUTUBE_READER_ROOT_SELECTOR)) return null;
    return element;
}

function isYouTubeCardOrFeedElement(element: Element): boolean {
    if (element.matches(VIDEO_CARD_SELECTOR)) return true;
    if (element.matches(NON_VIDEO_CONTAINER_SELECTOR)) return true;
    if (element.matches(YOUTUBE_FEED_CONTAINER_SELECTOR)) return true;
    return Boolean(element.closest(VIDEO_CARD_SELECTOR));
}

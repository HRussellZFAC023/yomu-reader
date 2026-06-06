import { APP_NAME } from './constants';
import { unwrapReaderWords } from './dom';
import { uiText } from './i18n';
import type { ReaderSettings } from './types';
import {
    YOUTUBE_CHANNEL_RECOMMENDATION_COUNT,
    YOUTUBE_CHANNEL_RECOMMENDATION_FILTERS,
    filterYouTubeChannelRecommendations,
    starterYouTubeChannelRecommendations,
    youtubeChannelRecommendationDescription,
    youtubeChannelSubscribeUrl,
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
    'ytm-video-with-context-renderer',
    'ytm-channel-featured-video-renderer',
    'ytm-shorts-lockup-view-model',
    'ytm-shorts-lockup-view-model-v2',
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
    'ytm-video-with-context-renderer',
    'ytm-channel-featured-video-renderer',
    'ytm-shorts-lockup-view-model',
    'ytm-shorts-lockup-view-model-v2',
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

const FILTERABLE_VIDEO_SHELF_SELECTOR = [
    'ytd-rich-shelf-renderer',
    'ytd-shelf-renderer',
].join(',');

const SHORTS_WATCH_ITEM_SELECTOR = [
    'ytd-shorts',
    'ytd-reel-video-renderer',
    'ytm-shorts-lockup-view-model',
    'ytm-shorts-lockup-view-model-v2',
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

const VIDEO_LINK_SELECTORS = [
    'a[href*="/watch"]',
    'a[href^="/shorts/"]',
    'a[href*="youtube.com/shorts/"]',
    'a.video-card-title-container',
    'a.video-card-image',
    'a.YtmCompactMediaItemMetadataContent',
    'a.YtmCompactMediaItemImage',
    'a.media-item-thumbnail-container',
    'a.shortsLockupViewModelHostEndpoint',
    'ytm-media-item a[href]',
    '.yt-lockup-view-model__content-image',
    'ytd-thumbnail > a',
    'a.yt-simple-endpoint',
    'a#video-title',
    'yt-formatted-string#title > a.yt-simple-endpoint',
].join(',');

const VIDEO_ANCHOR_SELECTOR = [
    'a[href^="/watch"]',
    'a[href*="/watch?v="]',
    'a[href*="youtube.com/watch"]',
    'a[href^="/shorts/"]',
    'a[href*="youtube.com/shorts/"]',
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
const YOUTUBE_FEED_CONTAINER_SELECTOR = [
    'ytd-rich-grid-renderer',
    'ytd-section-list-renderer',
    'ytd-item-section-renderer',
    'ytm-app',
    'ytm-browse',
    'ytm-rich-grid-renderer',
    'ytm-item-section-renderer',
    'ytm-search',
    'lazy-list',
].join(',');
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
const YOUTUBE_CHANNEL_GUIDE_COMPACT_LIMIT = 6;
const YOUTUBE_CHANNEL_GUIDE_EXPANDED_LIMIT = 100;

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

type YouTubeChannelGuideElements = {
    eyebrow: HTMLElement;
    title: HTMLElement;
    copy: HTMLElement;
    filters: HTMLElement;
    list: HTMLElement;
    expand: HTMLButtonElement;
    close: HTMLButtonElement;
    never: HTMLButtonElement;
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
    private channelGuide?: HTMLElement;
    private revealed = false;
    private dismissedNoticeScope = '';
    private dismissedChannelGuideScope = '';
    private noticeRouteKey = '';
    private channelGuideExpanded = false;
    private channelGuideFilter: YouTubeChannelRecommendationFilter = 'all';
    private lastBackfillAt = Number.NEGATIVE_INFINITY;
    private lastScrollAt = Number.NEGATIVE_INFINITY;
    private destroyed = true;
    private readonly oembedTitleCache = new Map<string, string | null>();
    private readonly pendingOembedTitles = new Set<string>();
    private readonly cardTimers = new WeakMap<HTMLElement, number[]>();

    constructor(private readonly options: {
        getSettings: () => ReaderSettings;
        setShowFilterNotice?: (visible: boolean) => void;
        setShowChannelRecommendations?: (visible: boolean) => void;
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
        window.addEventListener('yt-navigate-finish', () => this.schedule(120), { signal: this.events.signal });
        window.addEventListener('yt-page-data-updated', () => this.schedule(120), { signal: this.events.signal });
        window.addEventListener('yt-page-type-changed', () => this.schedule(120), { signal: this.events.signal });
        window.addEventListener('popstate', () => this.schedule(120), { signal: this.events.signal });
        window.addEventListener('hashchange', () => this.schedule(120), { signal: this.events.signal });
        window.addEventListener('scroll', () => {
            this.lastScrollAt = Date.now();
            if (isNearPageBottom()) this.schedule(180);
        }, { passive: true, signal: this.events.signal });
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
            this.removeChannelGuide();
            return;
        }

        const result = classifyYouTubeFilterCandidates(this.collectFilterCandidates(), { revealed: this.revealed });
        result.decisions.forEach(decision => this.applyFilterDecision(decision));

        if (settings.youtubeShowFilterNotice && shouldShowFilterNoticeForRoute()) {
            this.renderNotice(result.filteredCount, result.shownCount, settings);
        } else {
            this.bar?.remove();
            this.bar = undefined;
        }
        if (settings.youtubeShowChannelRecommendations && shouldShowChannelRecommendationsForRoute() && result.filteredCount) {
            this.renderChannelGuide(settings);
        } else {
            this.removeChannelGuide();
        }
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

    private hideCard(card: HTMLElement): void {
        const alreadyFiltered = card.classList.contains('jpdb-youtube-filtered');
        this.clearPendingCard(card);
        if (alreadyFiltered) return;

        this.prepareFilteredCard(card);
        card.classList.add('jpdb-youtube-filtered');
        card.dataset.yomuYoutubeFiltered = 'true';
        if (!card.hasAttribute('aria-hidden')) card.dataset.yomuYoutubeAriaHidden = 'true';
        card.setAttribute('aria-hidden', 'true');
        this.queueFilteredCardCollapse(card, this.filteredCardCollapseDelay());
    }

    private showCard(card: HTMLElement): void {
        this.clearCardTimers(card);
        this.clearPendingCard(card);
        card.classList.remove('jpdb-youtube-filtered', 'jpdb-youtube-filter-collapsing', 'jpdb-youtube-filter-collapsed');
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
        if (card.classList.contains('jpdb-youtube-filtered')) return;
        card.classList.add('jpdb-youtube-filter-pending');
        card.dataset.yomuYoutubePending = 'true';
    }

    private clearPendingCard(card: HTMLElement): void {
        card.classList.remove('jpdb-youtube-filter-pending');
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
        if (!card.isConnected || !card.classList.contains('jpdb-youtube-filtered')) return;
        if (card.classList.contains('jpdb-youtube-filter-collapsed')) return;

        const settleDelay = this.scrollSettleDelay();
        if (settleDelay > 0) {
            this.queueFilteredCardCollapse(card, settleDelay + YOUTUBE_FILTER_COLLAPSE_DELAY_MS);
            return;
        }

        card.classList.add('jpdb-youtube-filter-collapsing');
        this.queueCardTimer(card, () => {
            if (!card.classList.contains('jpdb-youtube-filtered')) return;
            card.classList.add('jpdb-youtube-filter-collapsed');
            card.classList.remove('jpdb-youtube-filter-collapsing');
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

    private renderChannelGuide(settings: ReaderSettings): void {
        const routeKey = this.currentRouteKey();
        if (!this.channelGuide && this.dismissedChannelGuideScope === routeKey) return;
        const guide = this.ensureChannelGuide();
        this.updateChannelGuide(guide, settings);
    }

    private ensureChannelGuide(): YouTubeChannelGuideElements {
        if (!this.channelGuide) {
            this.channelGuide = this.createChannelGuide();
            document.body.append(this.channelGuide);
        }
        return this.channelGuideElements(this.channelGuide);
    }

    private createChannelGuide(): HTMLElement {
        const guide = document.createElement('aside');
        guide.className = 'jpdb-youtube-channel-guide';
        guide.dataset.jpdbReaderRoot = 'true';
        guide.setAttribute('role', 'complementary');

        const head = document.createElement('div');
        head.className = 'jpdb-youtube-channel-guide-head';
        const text = document.createElement('div');
        text.className = 'jpdb-youtube-channel-guide-copy';
        const eyebrow = document.createElement('div');
        eyebrow.dataset.role = 'channel-guide-eyebrow';
        eyebrow.className = 'jpdb-youtube-channel-guide-eyebrow';
        const title = document.createElement('h2');
        title.dataset.role = 'channel-guide-title';
        const copy = document.createElement('p');
        copy.dataset.role = 'channel-guide-copy';
        text.append(eyebrow, title, copy);

        const actions = document.createElement('div');
        actions.className = 'jpdb-youtube-channel-guide-actions';
        actions.append(channelGuideButton('close'), channelGuideButton('never'));
        head.append(text, actions);

        const filters = document.createElement('div');
        filters.className = 'jpdb-youtube-channel-guide-filters';
        filters.dataset.role = 'channel-guide-filters';

        const list = document.createElement('div');
        list.className = 'jpdb-youtube-channel-guide-list';
        list.dataset.role = 'channel-guide-list';

        const foot = document.createElement('div');
        foot.className = 'jpdb-youtube-channel-guide-foot';
        foot.append(channelGuideButton('expand'));

        guide.append(head, filters, list, foot);
        guide.addEventListener('click', event => this.handleChannelGuideClick(event));
        return guide;
    }

    private channelGuideElements(guide: HTMLElement): YouTubeChannelGuideElements {
        return {
            eyebrow: guide.querySelector<HTMLElement>('[data-role="channel-guide-eyebrow"]')!,
            title: guide.querySelector<HTMLElement>('[data-role="channel-guide-title"]')!,
            copy: guide.querySelector<HTMLElement>('[data-role="channel-guide-copy"]')!,
            filters: guide.querySelector<HTMLElement>('[data-role="channel-guide-filters"]')!,
            list: guide.querySelector<HTMLElement>('[data-role="channel-guide-list"]')!,
            expand: guide.querySelector<HTMLButtonElement>('[data-yomu-youtube-channel-action="expand"]')!,
            close: guide.querySelector<HTMLButtonElement>('[data-yomu-youtube-channel-action="close"]')!,
            never: guide.querySelector<HTMLButtonElement>('[data-yomu-youtube-channel-action="never"]')!,
        };
    }

    private updateChannelGuide(guide: YouTubeChannelGuideElements, settings: ReaderSettings): void {
        this.channelGuide?.classList.toggle('is-expanded', this.channelGuideExpanded);
        guide.eyebrow.textContent = formatYoutubeText(uiText(settings.interfaceLanguage, 'youtubeChannelGuideEyebrow'), {
            count: String(YOUTUBE_CHANNEL_RECOMMENDATION_COUNT),
        });
        guide.title.textContent = uiText(settings.interfaceLanguage, 'youtubeChannelGuideTitle');
        guide.copy.textContent = uiText(settings.interfaceLanguage, 'youtubeChannelGuideCopy');
        guide.close.textContent = uiText(settings.interfaceLanguage, 'youtubeChannelGuideLater');
        guide.never.textContent = uiText(settings.interfaceLanguage, 'youtubeChannelGuideNever');
        guide.expand.textContent = uiText(settings.interfaceLanguage, this.channelGuideExpanded ? 'youtubeChannelGuideLess' : 'youtubeChannelGuideMore');
        this.renderChannelGuideFilters(guide.filters);
        this.renderChannelGuideList(guide.list, settings);
    }

    private renderChannelGuideFilters(filters: HTMLElement): void {
        filters.hidden = !this.channelGuideExpanded;
        filters.replaceChildren(...YOUTUBE_CHANNEL_RECOMMENDATION_FILTERS.map(filter => {
            const button = channelGuideButton('filter');
            button.dataset.filter = filter.id;
            button.className = 'jpdb-youtube-channel-filter';
            button.textContent = filter.label;
            button.setAttribute('aria-pressed', String(this.channelGuideFilter === filter.id));
            return button;
        }));
    }

    private renderChannelGuideList(list: HTMLElement, settings: ReaderSettings): void {
        const channels = this.channelGuideChannels();
        list.replaceChildren(...channels.map(channel => this.createChannelCard(channel, settings)));
    }

    private channelGuideChannels(): YouTubeChannelRecommendation[] {
        if (!this.channelGuideExpanded) return starterYouTubeChannelRecommendations(YOUTUBE_CHANNEL_GUIDE_COMPACT_LIMIT);
        return filterYouTubeChannelRecommendations(this.channelGuideFilter).slice(0, YOUTUBE_CHANNEL_GUIDE_EXPANDED_LIMIT);
    }

    private createChannelCard(channel: YouTubeChannelRecommendation, settings: ReaderSettings): HTMLElement {
        const card = document.createElement('article');
        card.className = 'jpdb-youtube-channel-card';
        card.dataset.level = channel.level;

        const avatar = document.createElement('div');
        avatar.className = 'jpdb-youtube-channel-avatar';
        avatar.textContent = channelAvatarText(channel);

        const body = document.createElement('div');
        body.className = 'jpdb-youtube-channel-body';
        const title = document.createElement('a');
        title.className = 'jpdb-youtube-channel-name';
        title.href = youtubeChannelUrl(channel);
        title.target = '_blank';
        title.rel = 'noopener';
        title.textContent = channel.name;
        title.title = uiText(settings.interfaceLanguage, 'youtubeChannelOpen');
        const meta = document.createElement('div');
        meta.className = 'jpdb-youtube-channel-meta';
        meta.textContent = `${channel.handle} · ${youtubeChannelRecommendationDescription(channel)}`;
        const tags = document.createElement('div');
        tags.className = 'jpdb-youtube-channel-tags';
        tags.append(...channelTags(channel).map(tag => {
            const pill = document.createElement('span');
            pill.textContent = tag;
            return pill;
        }));
        body.append(title, meta, tags);

        const subscribe = document.createElement('a');
        subscribe.className = 'jpdb-youtube-channel-subscribe';
        subscribe.href = youtubeChannelSubscribeUrl(channel);
        subscribe.target = '_blank';
        subscribe.rel = 'noopener';
        subscribe.textContent = uiText(settings.interfaceLanguage, 'youtubeChannelSubscribe');
        subscribe.title = formatYoutubeText(uiText(settings.interfaceLanguage, 'youtubeChannelSource'), {
            source: channel.sources.map(source => sourceLabel(source)).join(', '),
        });

        card.append(avatar, body, subscribe);
        return card;
    }

    private handleChannelGuideClick(event: MouseEvent): void {
        const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-yomu-youtube-channel-action]');
        const action = button?.dataset.yomuYoutubeChannelAction;
        if (!action) return;
        if (action === 'close') this.dismissChannelGuide();
        if (action === 'never') this.disableChannelGuide();
        if (action === 'expand') this.toggleChannelGuideExpanded();
        if (action === 'filter') this.setChannelGuideFilter(button.dataset.filter);
    }

    private dismissChannelGuide(): void {
        this.dismissedChannelGuideScope = this.currentRouteKey();
        this.removeChannelGuide();
    }

    private disableChannelGuide(): void {
        this.options.setShowChannelRecommendations?.(false);
        this.removeChannelGuide();
    }

    private toggleChannelGuideExpanded(): void {
        this.channelGuideExpanded = !this.channelGuideExpanded;
        this.schedule(0);
    }

    private setChannelGuideFilter(filter: string | undefined): void {
        if (!isYouTubeChannelRecommendationFilter(filter)) return;
        this.channelGuideFilter = filter;
        this.schedule(0);
    }

    private clear(): void {
        window.clearTimeout(this.timer);
        window.clearTimeout(this.metadataRescanTimer);
        this.timer = undefined;
        this.metadataRescanTimer = undefined;
        this.revealed = false;
        this.clearFilteredCards();
        this.removeNotice();
        this.removeChannelGuide();
        this.dismissedNoticeScope = '';
        this.dismissedChannelGuideScope = '';
        this.noticeRouteKey = '';
        this.channelGuideExpanded = false;
        this.channelGuideFilter = 'all';
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

    private removeChannelGuide(): void {
        this.channelGuide?.remove();
        this.channelGuide = undefined;
    }

    private clearFilteredCards(): void {
        document
            .querySelectorAll<HTMLElement>('[data-yomu-youtube-filtered="true"], [data-yomu-youtube-pending="true"], .jpdb-youtube-filtered, .jpdb-youtube-filter-pending')
            .forEach(card => this.showCard(card));
    }

    private currentNoticeScope(): string {
        const routeKey = this.currentRouteKey();
        if (this.noticeRouteKey !== routeKey) {
            this.noticeRouteKey = routeKey;
            this.dismissedNoticeScope = '';
            this.dismissedChannelGuideScope = '';
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

function channelGuideButton(action: string): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.yomuYoutubeChannelAction = action;
    return button;
}

function channelAvatarText(channel: YouTubeChannelRecommendation): string {
    const text = channel.name.trim() || channel.handle.replace(/^@/, '');
    return Array.from(text)[0]?.toUpperCase() ?? '日';
}

function channelTags(channel: YouTubeChannelRecommendation): string[] {
    return [
        channel.level,
        ...channel.topics.slice(0, 2),
        ...(channel.captions.length ? ['captions'] : []),
    ];
}

function sourceLabel(source: string): string {
    if (source === 'nihongotube') return 'NihongoTube';
    if (source === 'jpdb') return 'JPDB';
    if (source === 'reddit') return 'Reddit';
    if (source === 'search') return 'search';
    if (source === 'user') return 'your example';
    return source;
}

function isYouTubeChannelRecommendationFilter(value: string | undefined): value is YouTubeChannelRecommendationFilter {
    return YOUTUBE_CHANNEL_RECOMMENDATION_FILTERS.some(filter => filter.id === value);
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

function normalizeYouTubeFilterItem(element: HTMLElement): HTMLElement | null {
    if (shouldIgnoreYouTubeCardElement(element)) return null;
    if (element.matches(NON_VIDEO_CONTAINER_SELECTOR)) return normalizeYouTubeNonVideoContainer(element);
    if (isYouTubePlaylistLikeCard(element)) return youtubeCardHideTarget(element) ?? element;
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
    if (isYouTubeShortsWatchPage() && element.closest(SHORTS_WATCH_ITEM_SELECTOR)) return true;
    return Boolean(element.closest('[data-jpdb-reader-root]'));
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
    return !isYouTubeWatchPage();
}

function shouldShowChannelRecommendationsForRoute(): boolean {
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
        return Boolean(element?.closest?.('[data-jpdb-reader-root]'));
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
    if (!element || element.closest('[data-jpdb-reader-root]')) return null;
    return element;
}

function isYouTubeCardOrFeedElement(element: Element): boolean {
    if (element.matches(VIDEO_CARD_SELECTOR)) return true;
    if (element.matches(NON_VIDEO_CONTAINER_SELECTOR)) return true;
    if (element.matches(YOUTUBE_FEED_CONTAINER_SELECTOR)) return true;
    return Boolean(element.closest(VIDEO_CARD_SELECTOR));
}

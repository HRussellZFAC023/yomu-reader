import { APP_NAME } from '../app/constants';
import { uiText } from '../app/i18n';
import { targetLanguageDisplayName } from '../app/target-language-name';
import type { InterfaceLanguage, ReaderSettings } from '../app/types';
import {
    YOUTUBE_CHANNEL_RECOMMENDATION_COUNT,
    YOUTUBE_CHANNEL_RECOMMENDATION_FILTERS,
    allYouTubeChannelRecommendations,
    channelRecommendationsCoverTarget,
    filterYouTubeChannelRecommendations,
    starterYouTubeChannelRecommendations,
    youTubeChannelListSignature,
    youtubeChannelRecommendationDescription,
    youtubeChannelUrl,
    type YouTubeChannelRecommendation,
    type YouTubeChannelRecommendationFilter,
} from './youtube-channel-recommendations';
import { gmStorageDeleteSync, gmStorageGetSync, gmStorageSetSync, managedSessionStorage } from '../app/storage';
import {
    classifyYouTubeFilterCandidates,
    isProbablyJapaneseYouTubeText,
    youTubeSettingsTargetLanguageDetector,
    type YouTubeFilterCandidate,
    type YouTubeFilterDecision,
    type YouTubeFilterScanDecision,
} from './youtube-filter-scan';
import { escapeRegExp, readYouTubeConfigStringFromScripts } from './youtube-config';
import {
    isYouTubeHomePage,
    isYouTubeShortsWatchPage,
    isYouTubeWatchPage,
    shouldShowChannelRecommendationsForRoute,
} from './youtube-routes';
import { isYouTubeAppHostname } from '../app/youtube-host';
import { jpOnlyOn } from '../settings/language-gating';
const YOUTUBE_READER_ROOT_SELECTOR = '[data-jpdb-reader-root]';
const YOUTUBE_FILTERED_CLASS = 'jpdb-youtube-filtered';
const YOUTUBE_UNRENDERED_SLOT_CLASS = 'jpdb-youtube-unrendered-slot';
const YOUTUBE_SHELF_BACKFILL_MIN_VISIBLE = 3;
const YOUTUBE_SHELF_BACKFILL_MAX_PAGES = 4;
const YOUTUBE_SHELF_BACKFILL_THROTTLE_MS = 1500;
const YOUTUBE_RENDERED_SLOT_SELECTOR = 'ytd-rich-grid-media, ytd-rich-grid-slim-media, yt-lockup-view-model, ytm-shorts-lockup-view-model';
const YOUTUBE_PENDING_CLASS = 'jpdb-youtube-filter-pending';
const YOUTUBE_FIRST_IN_ROW_CLASS = 'jpdb-youtube-first-in-row';
const YOUTUBE_COLLAPSING_CLASS = 'jpdb-youtube-filter-collapsing';
const YOUTUBE_COLLAPSED_CLASS = 'jpdb-youtube-filter-collapsed';
const YOUTUBE_FILTERED_SELECTOR = `[data-yomu-youtube-filtered="true"],[data-yomu-youtube-pending="true"],.${YOUTUBE_FILTERED_CLASS},.${YOUTUBE_PENDING_CLASS}`;
const SHELF_SELECTOR = 'grid-shelf-view-model,ytd-rich-shelf-renderer,ytd-reel-shelf-renderer,ytd-shelf-renderer,ytm-reel-shelf-renderer';
const YOUTUBE_UNRENDERED_SHELF_SLOT_SELECTOR = SHELF_SELECTOR
    .split(',')
    .flatMap(selector => [`${selector} ytd-rich-item-renderer`, `${selector} ytm-rich-item-renderer`])
    .join(',');
const SHORTS_CARD_SELECTOR = 'ytd-reel-item-renderer,ytd-reel-video-renderer,ytm-shorts-lockup-view-model,ytm-shorts-lockup-view-model-v2';
const VIDEO_CARD_HIDE_TARGET_SELECTOR = `ytd-rich-item-renderer,ytd-video-renderer,ytd-compact-video-renderer,ytd-grid-video-renderer,ytm-rich-item-renderer,ytm-compact-video-renderer,ytm-video-card-renderer,ytm-video-with-context-renderer,ytm-channel-featured-video-renderer,${SHORTS_CARD_SELECTOR}`;
const VIDEO_CARD_SELECTOR = `${VIDEO_CARD_HIDE_TARGET_SELECTOR},yt-lockup-view-model`;

const VIDEO_CARD_CLOSEST_SELECTOR = VIDEO_CARD_SELECTOR;

const NON_VIDEO_CONTAINER_SELECTOR = `${SHELF_SELECTOR},ytd-playlist-renderer,ytd-compact-playlist-renderer,ytd-radio-renderer,ytd-compact-radio-renderer,ytm-playlist-renderer,ytm-compact-playlist-renderer`;

const FILTERABLE_VIDEO_SHELF_SELECTOR = SHELF_SELECTOR;

const CHANNEL_LISTING_CONTENT_SELECTOR = 'ytd-channel-renderer,ytd-grid-channel-renderer,ytm-channel-list-item-renderer,ytm-compact-channel-renderer';

const SHORTS_WATCH_ITEM_SELECTOR = 'ytd-shorts,ytd-reel-video-renderer,ytm-shorts-lockup-view-model,ytm-shorts-lockup-view-model-v2';
const YT_TITLE = 0;
const YT_EXPANDED = 1;
const YT_COMPACT = 2;
const YT_RECOMMENDATIONS = 3;
const YT_SUBSCRIBE_VISIBLE = 4;
const YT_SUBSCRIBE_ALL = 5;
const YT_ALL_SUBSCRIBED = 6;
const YT_BROWSE_ALL = 7;
const YT_COLLAPSE = 8;
const YT_SUBSCRIBE = 9;
const YT_SUBSCRIBED = 10;
const YT_SUBSCRIBE_TO = 11;
const YT_SUBSCRIBED_TO = 12;
const YT_ALREADY_SUBSCRIBED = 13;
const YT_PARTIAL_STATUS = 14;
const YT_STATUS_ONE = 15;
const YT_STATUS_MANY = 16;
const YOUTUBE_SHELF_COPY = {
    en: [
        'Start your Japanese YouTube feed',
        '{shown} shown from {total} curated channels.',
        '{total} curated channels, shown as compact YouTube-style rows.',
        'Japanese channel recommendations',
        'Subscribe visible ({count})',
        'Subscribe all {count}',
        'All {total} subscribed',
        'Browse all channels',
        'Collapse',
        'Subscribe',
        'Subscribed',
        'Subscribe to {name}',
        'Subscribed to {name}',
        'All of these channels are already subscribed.',
        'Subscribed to {subscribed}; {failed} could not be completed by YouTube.',
        'Subscribed to {count} channel.',
        'Subscribed to {count} channels.',
    ],
    ja: [
        '日本語YouTubeを始める',
        '{shown}/{total}件を表示',
        '厳選{total}件を表示',
        '日本語チャンネル',
        '表示中を登録({count})',
        '全{count}件登録',
        '{total}件すべて登録済み',
        'すべて見る',
        '折りたたむ',
        '登録',
        '登録済み',
        '{name}を登録',
        '{name}を登録済み',
        'すべて登録済みです。',
        '{subscribed}件登録、{failed}件失敗。',
        '{count}件登録しました。',
        '{count}件登録しました。',
    ],
} as const;

// Community posts surfaced in feeds (home/subscriptions). Captured live
// 2026-06-12: desktop posts carry their text in
// yt-formatted-string#content-text; mweb posts in
// div.ytmBackstagePostRendererHostContentText, whose truncated-text contains
// a 続きを読む button that must NOT count as Japanese content.
const COMMUNITY_POST_SELECTOR = 'ytd-post-renderer,ytd-backstage-post-thread-renderer,ytm-backstage-post-thread-renderer,ytm-post-renderer,ytm-backstage-post-renderer';
const COMMUNITY_POST_TEXT_SELECTOR = '#content-text,[class*="BackstagePostRendererHostContentText"]';

const TITLE_SELECTORS = [
    '#video-title',
    'a#video-title',
    'yt-formatted-string#video-title',
    'h3 a',
    'h3',
    'ytd-reel-player-overlay-renderer h2.title',
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
const YOUTUBE_FEED_CONTAINER_SELECTOR = 'ytd-rich-grid-renderer,ytd-section-list-renderer,ytd-item-section-renderer,ytm-app,ytm-browse,ytm-rich-grid-renderer,ytm-item-section-renderer,ytm-search,lazy-list';
const OEMBED_TITLE_CACHE_LIMIT = 240;
const OEMBED_SESSION_CACHE_PREFIX = 'yomu:youtube-oembed-title:v1:';
const OEMBED_SESSION_CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const OEMBED_BATCH_RESCAN_DELAY_MS = 180;
const YOUTUBE_FILTER_MUTATION_RESCAN_DELAY_MS = 90;
const YOUTUBE_FILTER_COLLAPSE_DELAY_MS = 80;
const YOUTUBE_FILTER_SCROLL_COLLAPSE_DELAY_MS = 650;
const YOUTUBE_FILTER_SCROLL_SETTLE_MS = 280;
const YOUTUBE_FILTER_COLLAPSE_DURATION_MS = 240;
const YOUTUBE_FILTER_NOTICE_AUTO_HIDE_MS = 10_000;
const YOUTUBE_VISIBLE_BACKFILL_TARGET = 24;
const YOUTUBE_BACKFILL_THROTTLE_MS = 1200;
const YOUTUBE_SEARCH_AUTO_REVEAL_MIN_FILTERED = 8;
const YOUTUBE_SHORTS_ADVANCE_THROTTLE_MS = 800;
// How long to wait before re-advancing the SAME short. Long enough to let an
// in-flight navigation settle (so we don't over-skip past the next short), but
// short enough to retry when a click was dropped — e.g. the first scan fires
// during init() before the Shorts player has wired its nav button.
const YOUTUBE_SHORTS_ADVANCE_RETRY_MS = 1000;
const YOUTUBE_FILTER_CARD_HEIGHT_PROPERTY = '--yomu-youtube-filter-card-height';
// Multiple of the list's 4/2/1-column layouts so the compact shelf fills its rows.
const YOUTUBE_CHANNEL_SHELF_COMPACT_LIMIT = 8;
const YOUTUBE_CHANNEL_SHELF_PREVIEW_LIMIT = 8;
const YOUTUBE_ALL_SUBSCRIBED_STORAGE_KEY = 'yomu:youtube-all-subscribed:v1';
const YOUTUBE_CHANNEL_SHELF_PREVIEW_BACKFILL_DELAY_MS = 250;
const YOUTUBE_CHANNEL_SUBSCRIPTION_PROBE_DELAY_MS = 250;
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
    never: HTMLButtonElement;
};

type YouTubeChannelPreview = {
    channelId: string;
    title: string;
    avatarUrl: string;
    subscriberText: string;
    description: string;
    subscribed: boolean | null;
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
    return isYouTubeAppHostname(hostname);
}

function isInsideReaderRoot(node: ParentNode | Node): boolean {
    if (node instanceof Element) return Boolean(node.closest(YOUTUBE_READER_ROOT_SELECTOR));
    if (node instanceof Node) return Boolean(node.parentElement?.closest(YOUTUBE_READER_ROOT_SELECTOR));
    return false;
}

function youtubeShelfText(language: InterfaceLanguage, key: number, values: Record<string, string | number> = {}): string {
    const copy = YOUTUBE_SHELF_COPY[language === 'ja' ? 'ja' : 'en'][key];
    return copy.replace(/\{(\w+)\}/g, (_match, name: string) => String(values[name] ?? ''));
}

export { isProbablyJapaneseYouTubeText };

export function collectYouTubeVideoCards(root: ParentNode = document): HTMLElement[] {
    if (isInsideReaderRoot(root)) return [];
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
        title: (titleText.trim() || nativeYouTubeText(card).trim() || '').trim(),
        videoId: readYouTubeVideoId(card),
    };
}

// Yomu's own annotations live inside the card (the text mirror duplicates the
// title, ruby rt adds kana readings). Language classification and title
// comparisons must read the PAGE's text only — a mirror-doubled title breaks
// oEmbed equality checks, and injected readings would make any card look
// Japanese.
function nativeYouTubeText(element: HTMLElement): string {
    if (!element.querySelector('.jpdb-reader-text-mirror,rt.jpdb-reader-furi,[data-jpdb-reader-root]')) {
        return element.textContent ?? '';
    }
    const clone = element.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.jpdb-reader-text-mirror,rt.jpdb-reader-furi,[data-jpdb-reader-root]').forEach(node => node.remove());
    return clone.textContent ?? '';
}

export class YoutubeImmersionFilter {
    private observer?: MutationObserver;
    private events?: AbortController;
    private timer?: number;
    private metadataRescanTimer?: number;
    private bar?: HTMLElement;
    private noticeAutoHideTimer?: number;
    private noticeAutoHideScope = '';
    private channelShelf?: HTMLElement;
    private revealed = false;
    private dismissedNoticeScope = '';
    // "Hide notice" is a SESSION dismissal: it must never persist — the
    // permanent switch lives in the settings dialog only (2026-07-11 report:
    // one tap on the notice silently disabled it forever).
    private noticeSessionHidden = false;
    // Route scope that was auto-revealed because the user's own search came
    // back all non-Japanese; cleared when the route changes or the user
    // toggles manually.
    private autoRevealedScope = '';
    private noticeRouteKey = '';
    private channelShelfRouteKey = '';
    private channelShelfExpanded = false;
    private channelShelfFilter: YouTubeChannelRecommendationFilter = 'all';
    private subscriptionBusy = false;
    private channelShelfStatusOverride = '';
    private lastBackfillAt = Number.NEGATIVE_INFINITY;
    private lastScrollAt = Number.NEGATIVE_INFINITY;
    private destroyed = true;
    private readonly oembedTitleCache = new Map<string, string | null>();
    private readonly pendingOembedTitles = new Set<string>();
    private readonly channelPreviewCache = new Map<string, YouTubeChannelPreview | null>();
    private readonly channelIdCache = new Map<string, string | null>();
    private readonly pendingChannelPreviews = new Set<string>();
    private channelPreviewBackfillQueue: YouTubeChannelRecommendation[] = [];
    private channelPreviewBackfillTimer?: number;
    private readonly cardTimers = new WeakMap<HTMLElement, number[]>();
    private readonly compactChannelPool = randomStarterYouTubeChannelRecommendations(YOUTUBE_CHANNEL_RECOMMENDATION_COUNT);
    private readonly subscribedChannelHandles = new Set<string>();
    // Channels whose id can no longer be resolved (deleted/moved/renamed). Kept
    // separate so a dead channel never blocks the "all subscribed" state.
    private readonly unresolvableChannelHandles = new Set<string>();
    // Once every channel is subscribed (or unresolvable) we stop re-testing
    // subscription status on each shelf render. Persisted, keyed by the channel
    // list signature so editing the list re-tests against the new set.
    private channelsAllSubscribed = false;
    private channelSubscriptionStateLoaded = false;
    private channelSubscriptionProbeComplete = false;
    private channelSubscriptionProbeQueue: YouTubeChannelRecommendation[] = [];
    private channelSubscriptionProbeTimer?: number;
    private channelShelfRefreshTimer?: number;
    private channelShelfRenderSignature = '';
    private lastShelfBackfillAt = 0;
    private lastAdvancedShortKey = '';
    private lastShortAdvanceAt = Number.NEGATIVE_INFINITY;

    // Already-subscribed channels never belong in the suggestions; the pool
    // backfills the compact view so subscribing keeps the shelf full.
    private get compactChannelRecommendations(): YouTubeChannelRecommendation[] {
        return this.unsubscribedChannels(this.compactChannelPool).slice(0, YOUTUBE_CHANNEL_SHELF_COMPACT_LIMIT);
    }

    private unsubscribedChannels(channels: YouTubeChannelRecommendation[]): YouTubeChannelRecommendation[] {
        return channels.filter(channel => !this.subscribedChannelHandles.has(channel.handle));
    }

    private loadChannelSubscriptionState(): void {
        if (this.channelSubscriptionStateLoaded) return;
        this.channelSubscriptionStateLoaded = true;
        const stored = gmStorageGetSync<{ signature?: string } | null>(YOUTUBE_ALL_SUBSCRIBED_STORAGE_KEY, null);
        if (stored?.signature === youTubeChannelListSignature()) {
            this.channelsAllSubscribed = true;
            for (const channel of allYouTubeChannelRecommendations()) this.subscribedChannelHandles.add(channel.handle);
        } else if (stored) {
            // The curated list changed since the flag was stored — drop it and re-test.
            gmStorageDeleteSync(YOUTUBE_ALL_SUBSCRIBED_STORAGE_KEY);
        }
    }

    // Persist the "all subscribed" flag once every channel is subscribed or
    // unresolvable (deleted/moved/renamed), so the shelf stops re-testing
    // subscription status on every render. A dead channel never blocks this.
    private markChannelSubscriptionCompleteIfReady(options: { keepShelf?: boolean } = {}): void {
        if (this.channelsAllSubscribed) {
            this.channelSubscriptionProbeComplete = true;
            this.clearChannelSubscriptionProbe();
            if (!options.keepShelf) {
                this.clearChannelShelfRefresh();
                this.removeChannelShelf();
            }
            return;
        }
        const settled = (handle: string): boolean =>
            this.subscribedChannelHandles.has(handle) || this.unresolvableChannelHandles.has(handle);
        if (!allYouTubeChannelRecommendations().every(channel => settled(channel.handle))) return;
        this.channelsAllSubscribed = true;
        this.channelSubscriptionProbeComplete = true;
        this.clearChannelSubscriptionProbe();
        gmStorageSetSync(YOUTUBE_ALL_SUBSCRIBED_STORAGE_KEY, { signature: youTubeChannelListSignature() });
        if (!options.keepShelf) {
            this.clearChannelShelfRefresh();
            this.removeChannelShelf();
        }
    }

    constructor(private readonly options: {
        getSettings: () => ReaderSettings;
        setShowFilterNotice?: (visible: boolean) => void;
        setShowChannelRecommendations?: (visible: boolean) => void;
        parseShelfJapanese?: (root: HTMLElement) => void;
        scheduleAnnotationLayoutRefresh?: () => void;
        isActivePage?: () => boolean;
    }) {}

    init(): void {
        this.destroy();
        this.destroyed = false;
        if (!this.isActivePage() || !document.body || !youtubeImmersionFilterEnabled(this.options.getSettings())) {
            this.destroyed = true;
            return;
        }

        this.loadChannelSubscriptionState();
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
            // is-in-first-column: YouTube re-asserts its row-layout flags on
            // its own layout passes (continuation loads, resizes) without any
            // childList change; without watching it the grid rebalance never
            // re-runs and stale flags misalign re-flowed rows (gap bug).
            attributeFilter: ['href', 'title', 'aria-label', 'is-in-first-column'],
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

    refresh(): void {
        if (!this.isActivePage()) {
            this.destroy();
            return;
        }
        if (!youtubeImmersionFilterEnabled(this.options.getSettings())) {
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
        if (!youtubeImmersionFilterEnabled(settings)) {
            this.clear();
            return;
        }

        // Clean up any elements that are already pending or filtered but should be ignored
        document.querySelectorAll<HTMLElement>(YOUTUBE_FILTERED_SELECTOR).forEach(card => {
            if (shouldIgnoreYouTubeCardElement(card)) {
                this.showCard(card);
            }
        });

        this.restoreCurrentShortsWatchItem();
        this.advancePastFilteredActiveShort();

        this.resetStaleAutoReveal();
        const result = classifyYouTubeFilterCandidates(this.collectFilterCandidates(), {
            revealed: this.revealed,
            // A48: ask the learner's own target, not "is this Japanese?".
            matchesTargetLanguage: youTubeSettingsTargetLanguageDetector(settings),
        });
        // A search whose results are ALL non-Japanese must not become a
        // filtering loop: hiding everything keeps YouTube's continuation
        // loader in view, which loads more results, which we hide again —
        // unbounded DOM growth that saturates the page (and made the puck
        // toggle unresponsive). The user typed that query: reveal the
        // results for THIS route and let the notice explain.
        if (this.shouldAutoRevealSearchResults(result)) {
            this.revealed = true;
            this.autoRevealedScope = this.currentNoticeScope();
            this.schedule(0);
            return;
        }
        result.decisions.forEach(decision => this.applyFilterDecision(decision));
        this.syncFilterableVideoShelves();

        if (settings.youtubeShowFilterNotice && !this.noticeSessionHidden && shouldShowFilterNoticeForRoute()) {
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
        const postText = youTubeCommunityPostText(card);
        if (postText !== null) {
            // Posts classify on their own content text; the card textContent
            // fallback would see Japanese UI chrome (時間前, 続きを読む) and
            // keep every post visible. Text-less posts (image/poll only)
            // surface an empty title and are skipped, not hidden.
            return visibleYouTubeFilterCandidate({ card, title: postText, videoId: '' }, postText);
        }
        const info = readYouTubeCardInfo(card);
        return visibleYouTubeFilterCandidate(info, this.resolveTitleForFiltering(info));
    }

    private applyFilterDecision(decision: YouTubeFilterDecision): void {
        if (isCurrentYouTubeShortsWatchCard(decision.candidate.card)) {
            // The active reel must stay visible. Stepping the player forward is
            // owned by advancePastFilteredActiveShort(), which classifies the
            // active short from the URL video id + its original title — the
            // per-card title/videoId here can lag a reel behind the URL or be
            // auto-translated, which would wrongly skip a Japanese short or keep
            // an English one.
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
        this.syncEmptiedRichSections();
        syncUnrenderedYouTubeShelfSlots();
        this.backfillSparseShelves();
        rebalanceYouTubeGridRows();
    }

    // UT-26 remainder: after filtering, a shelf can be left with one or two
    // visible items because YouTube only hydrates carousel slots when the
    // shelf is PAGED. When a visible shelf runs sparse, page it forward
    // (its next arrow hydrates the following slots) so the filter has more
    // candidates to keep. Capped per shelf and throttled so a genuinely
    // non-Japanese shelf cannot be paged forever or fight the user.
    private backfillSparseShelves(): void {
        const now = performance.now();
        if (now - this.lastShelfBackfillAt < YOUTUBE_SHELF_BACKFILL_THROTTLE_MS) return;
        for (const shelf of collectFilterableVideoShelves()) {
            // A fully-filtered shelf is collapsed but still pageable — its
            // "show more" can hydrate Japanese items that un-hide it on the
            // next pass. Skipping it here would freeze it empty forever.
            const cards = collectYouTubeVideoCards(shelf);
            if (!cards.length) continue;
            const visible = cards.filter(card => !card.classList.contains(YOUTUBE_FILTERED_CLASS)
                && !card.classList.contains(YOUTUBE_PENDING_CLASS)
                && !card.classList.contains(YOUTUBE_UNRENDERED_SLOT_CLASS)).length;
            // UT-53: fill the shelf's own visible page (elements-per-row)
            // when it advertises one, not just a bare minimum.
            const perRow = Number(shelf.getAttribute('elements-per-row') ?? shelf.querySelector('[items-per-row]')?.getAttribute('items-per-row') ?? '');
            const target = Number.isFinite(perRow) && perRow > 0
                ? Math.min(Math.max(Math.round(perRow), YOUTUBE_SHELF_BACKFILL_MIN_VISIBLE), 8)
                : YOUTUBE_SHELF_BACKFILL_MIN_VISIBLE;
            if (visible >= target) continue;
            const pages = Number(shelf.dataset.yomuShelfBackfillPages ?? '0');
            if (pages >= YOUTUBE_SHELF_BACKFILL_MAX_PAGES) continue;
            // Truncated shelves (Shorts row) hydrate more slots through their
            // "show more" button (first button of the dismissible pair —
            // live-verified to grow the rendered item count); carousel
            // shelves use their next arrow.
            const expand = shelf.hasAttribute('is-truncated')
                ? shelf.querySelector<HTMLButtonElement>('div#dismissible ytd-button-renderer button')
                : null;
            const next = expand
                ?? shelf.querySelector<HTMLButtonElement>('#right-arrow button, button[aria-label="Next"]');
            if (!next || next.disabled) continue;
            shelf.dataset.yomuShelfBackfillPages = String(pages + 1);
            this.lastShelfBackfillAt = now;
            next.click();
            return;
        }
    }

    // A rich section whose entire filterable content is hidden must take its
    // wrapper with it: the empty ytd-rich-section-renderer otherwise keeps its
    // padding/margins as a full-width gap band in the feed.
    private syncEmptiedRichSections(): void {
        document.querySelectorAll<HTMLElement>('ytd-rich-section-renderer').forEach(section => {
            const hidden = section.querySelectorAll(`.${YOUTUBE_FILTERED_CLASS}`).length;
            if (!hidden) return;
            const visibleContent = collectYouTubeVideoCards(section)
                .some(card => !card.classList.contains(YOUTUBE_FILTERED_CLASS));
            const visibleShelf = Array.from(section.querySelectorAll<HTMLElement>(SHELF_SELECTOR))
                .some(shelf => !shelf.classList.contains(YOUTUBE_FILTERED_CLASS));
            if (!visibleContent && !visibleShelf) this.hideCard(section);
            else this.showCard(section);
        });
    }

    private advancePastFilteredShort(shortKey = currentYouTubeShortsVideoId() || location.pathname): void {
        const advanceKey = `${location.pathname}:${shortKey}`;
        const now = performance.now();
        // Same short as our last advance: hold off only until the retry window
        // elapses. Within it, YouTube's navigation is likely still in flight and
        // re-clicking would over-skip; past it, the click was dropped and we
        // retry (otherwise a lost first click parks the player on this short
        // forever).
        if (this.lastAdvancedShortKey === advanceKey) {
            const sinceAdvance = now - this.lastShortAdvanceAt;
            if (sinceAdvance < YOUTUBE_SHORTS_ADVANCE_RETRY_MS) {
                this.schedule(Math.ceil(YOUTUBE_SHORTS_ADVANCE_RETRY_MS - sinceAdvance) + YOUTUBE_FILTER_MUTATION_RESCAN_DELAY_MS);
                return;
            }
        }
        const throttleRemaining = YOUTUBE_SHORTS_ADVANCE_THROTTLE_MS - (now - this.lastShortAdvanceAt);
        if (throttleRemaining > 0) {
            this.schedule(Math.ceil(throttleRemaining) + YOUTUBE_FILTER_MUTATION_RESCAN_DELAY_MS);
            return;
        }
        // Desktop nav button, label-matched buttons, then the m.youtube.com
        // carousel's hidden a11y "next video" button (locale-independent):
        // a plain click() on it advances the JS-driven mweb reel.
        const next = document.querySelector<HTMLButtonElement>(
            'ytd-shorts #navigation-button-down button, [aria-label="次の動画"], [aria-label="Next video"], shorts-carousel .ytShortsCarouselShortsA11yNavButton:not([disabled]):last-child',
        );
        if (!next) return;
        this.lastAdvancedShortKey = advanceKey;
        this.lastShortAdvanceAt = now;
        next.click();
        this.schedule(YOUTUBE_SHORTS_ADVANCE_THROTTLE_MS + YOUTUBE_FILTER_MUTATION_RESCAN_DELAY_MS);
    }

    // Shorts watch player (2026): the active reel lives in a JS carousel —
    // mobile is shorts-page > shorts-carousel, desktop (and iPad's
    // "Request Desktop Website") is ytd-shorts > ytd-reel-video-renderer. The
    // per-card title for the active reel is unreliable: it lags a reel behind
    // the URL, and under a non-English UI locale YouTube auto-translates it into
    // the UI language so an English short looks Japanese. Classify the ACTIVE
    // short from the URL video id + its ORIGINAL (oEmbed/tab) title instead, on
    // both platforms, and step past it when it would have been hidden.
    private advancePastFilteredActiveShort(): void {
        if (!isYouTubeShortsWatchPage()) return;
        const overlay = document.querySelector<HTMLElement>('ytd-shorts, shorts-page, shorts-carousel, shorts-video');
        if (!overlay) return;
        const videoId = currentYouTubeShortsVideoId();
        if (!videoId) return;
        // The local title can be momentarily unavailable (tab title still
        // "YouTube", overlay not yet painted). Keep going on the video id alone:
        // resolveTitleForFiltering still fetches the oEmbed original title and
        // re-scans once it lands, rather than parking on an unclassified short.
        const title = activeShortsTitle();
        const resolvedTitle = this.resolveTitleForFiltering({ card: overlay, title, videoId });
        const candidate: YouTubeFilterCandidate = {
            card: overlay,
            title: resolvedTitle,
            videoId,
            filterText: resolvedTitle,
            alwaysHidden: false,
        };
        const decision = classifyYouTubeFilterCandidates([candidate], {
            revealed: this.revealed,
            matchesTargetLanguage: youTubeSettingsTargetLanguageDetector(this.options.getSettings()),
        }).decisions[0];
        if (decision?.kind === 'hide') this.advancePastFilteredShort(videoId || resolvedTitle || title);
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
        withFeedScrollAnchor(card, () => {
            card.classList.add(YOUTUBE_FILTERED_CLASS);
            card.dataset.yomuYoutubeFiltered = 'true';
        });
        this.options.scheduleAnnotationLayoutRefresh?.();
        if (!card.hasAttribute('aria-hidden')) card.dataset.yomuYoutubeAriaHidden = 'true';
        card.setAttribute('aria-hidden', 'true');
        this.queueFilteredCardCollapse(card, this.filteredCardCollapseDelay());
    }

    private showCard(card: HTMLElement): void {
        const changedLayout = cardHasFilteredLayoutState(card);
        this.clearCardTimers(card);
        this.clearPendingCard(card);
        withFeedScrollAnchor(card, () => {
            card.classList.remove(YOUTUBE_FILTERED_CLASS, YOUTUBE_COLLAPSING_CLASS, YOUTUBE_COLLAPSED_CLASS);
        });
        card.style.removeProperty(YOUTUBE_FILTER_CARD_HEIGHT_PROPERTY);
        if (card.dataset.yomuYoutubeAriaHidden === 'true') {
            card.removeAttribute('aria-hidden');
            delete card.dataset.yomuYoutubeAriaHidden;
        }
        delete card.dataset.yomuYoutubeFiltered;
        if (changedLayout) this.options.scheduleAnnotationLayoutRefresh?.();
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
        if (shouldHidePendingYouTubeCard(card)) {
            card.dataset.yomuYoutubePendingHidden = 'true';
        } else {
            delete card.dataset.yomuYoutubePendingHidden;
        }
    }

    private clearPendingCard(card: HTMLElement): void {
        card.classList.remove(YOUTUBE_PENDING_CLASS);
        delete card.dataset.yomuYoutubePending;
        delete card.dataset.yomuYoutubePendingHidden;
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
        this.options.scheduleAnnotationLayoutRefresh?.();
        this.queueCardTimer(card, () => {
            if (!card.classList.contains(YOUTUBE_FILTERED_CLASS)) return;
            card.classList.add(YOUTUBE_COLLAPSED_CLASS);
            card.classList.remove(YOUTUBE_COLLAPSING_CLASS);
            card.style.removeProperty(YOUTUBE_FILTER_CARD_HEIGHT_PROPERTY);
            this.options.scheduleAnnotationLayoutRefresh?.();
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

        const notice = this.ensureNoticeBar();
        this.updateNoticeSummary(notice.summary, filteredCount, shownCount, settings);
        this.updateNoticeActions(notice, settings);
        this.armNoticeAutoHide(noticeScope);
    }

    // The notice must not squat over the feed forever: after a grace period it
    // dismisses itself for the current scope, and comes back on the next route.
    private armNoticeAutoHide(scope: string): void {
        if (this.noticeAutoHideTimer !== undefined && this.noticeAutoHideScope === scope) return;
        window.clearTimeout(this.noticeAutoHideTimer);
        this.noticeAutoHideScope = scope;
        this.noticeAutoHideTimer = window.setTimeout(() => {
            this.noticeAutoHideTimer = undefined;
            this.dismissedNoticeScope = scope;
            this.removeNotice();
        }, YOUTUBE_FILTER_NOTICE_AUTO_HIDE_MS);
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
        bar.role = 'status';
        bar.ariaLive = 'polite';

        const summary = document.createElement('span');
        summary.dataset.role = 'summary';
        summary.className = 'jpdb-reader-sr-only';
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
        this.autoRevealedScope = '';
        this.schedule(0);
    }

    private shouldAutoRevealSearchResults(result: YouTubeFilterScanDecision): boolean {
        if (this.revealed) return false;
        if (location.pathname !== '/results') return false;
        return result.shownCount === 0 && result.filteredCount >= YOUTUBE_SEARCH_AUTO_REVEAL_MIN_FILTERED;
    }

    // Auto-reveal is scoped to the search route it rescued: navigating away
    // restores normal filtering. A manual toggle (autoRevealedScope cleared)
    // is never touched.
    private resetStaleAutoReveal(): void {
        if (!this.autoRevealedScope) return;
        if (this.currentNoticeScope().split(':')[0] === this.autoRevealedScope.split(':')[0]) return;
        this.autoRevealedScope = '';
        this.revealed = false;
    }

    private dismissFilterNotice(): void {
        this.noticeSessionHidden = true;
        this.dismissedNoticeScope = this.currentNoticeScope();
        this.removeNotice();
    }

    private updateNoticeSummary(summary: HTMLElement, filteredCount: number, shownCount: number, settings: ReaderSettings): void {
        const summaryText = this.noticeSummaryText(filteredCount, settings);
        const values = { count: String(shownCount), language: targetLanguageDisplayName(settings) };  // {language} = the target, not Japanese (A48)
        const visibleText = shownCount ? formatYoutubeText(uiText(settings.interfaceLanguage, 'youtubeFilterVisible'), values) : '';
        const bar = summary.closest<HTMLElement>('.jpdb-youtube-filter-bar');
        summary.textContent = summaryText;
        summary.title = visibleText;
        if (bar) {
            bar.setAttribute('aria-label', visibleText ? `${summaryText}. ${visibleText}` : summaryText);
            bar.title = visibleText;
        }
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
        if (this.channelsAllSubscribed) {
            this.removeChannelShelf();
            return;
        }

        const recommendations = this.currentChannelRecommendations();
        this.hydrateChannelPreviewCandidates(recommendations);
        this.ensureChannelSubscriptionProbe();
        if (!this.unsubscribedChannels(allYouTubeChannelRecommendations()).length) {
            this.removeChannelShelf();
            return;
        }

        const renderableRecommendations = this.renderableChannelRecommendations(recommendations);
        // In compact mode, hide the shelf entirely when every shown channel is
        // already subscribed or when their live subscription checks are still
        // pending. This prevents signed-in users from seeing stale "Subscribe"
        // rows flash before YouTube's current subscription state arrives.
        if (!renderableRecommendations.length) {
            this.removeChannelShelf();
            return;
        }

        this.currentChannelShelfScope();

        const shelf = this.ensureChannelShelf();
        const elements = this.channelShelfElements(shelf);
        this.renderChannelShelf(elements, renderableRecommendations);
        this.placeChannelShelf(shelf);
    }

    private shouldShowChannelShelf(filteredCount: number, settings: ReaderSettings): boolean {
        if (!youtubeChannelRecommendationsEnabled(settings)) return false;
        if (!channelRecommendationsCoverTarget(settings)) return false;
        if (this.revealed) return false;
        if (!shouldShowChannelRecommendationsForRoute()) return false;
        if (isYouTubeHomePage()) return false;
        return filteredCount > 0;
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
        shelf.setAttribute('aria-label', youtubeShelfText(this.options.getSettings().interfaceLanguage, YT_RECOMMENDATIONS));

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
            never: shelf.querySelector<HTMLButtonElement>('[data-yomu-youtube-channel-action="never"]')!,
        };
    }

    private renderChannelShelf(elements: YouTubeChannelShelfElements, recommendations = this.renderableChannelRecommendations(this.currentChannelRecommendations())): void {
        const renderedRecommendations = recommendations.slice(0, this.channelShelfExpanded ? YOUTUBE_CHANNEL_RECOMMENDATION_COUNT : YOUTUBE_CHANNEL_SHELF_COMPACT_LIMIT);
        const signature = this.channelShelfStructuralSignature(recommendations, renderedRecommendations);
        this.updateChannelShelfChrome(elements, recommendations, renderedRecommendations);
        if (signature === this.channelShelfRenderSignature) {
            this.setChannelShelfBusy(this.subscriptionBusy);
            this.syncChannelShelfTheme();
            this.hydrateRenderedChannelPreviews(renderedRecommendations);
            return;
        }
        this.channelShelfRenderSignature = signature;

        this.channelShelf?.classList.toggle('is-expanded', this.channelShelfExpanded);
        this.renderChannelFilters(elements.filters);
        elements.list.replaceChildren(...renderedRecommendations.map(channel => this.renderChannelRow(channel)));
        this.setChannelShelfBusy(this.subscriptionBusy);
        this.syncChannelShelfTheme();
        if (this.channelShelf) this.options.parseShelfJapanese?.(this.channelShelf);
        this.hydrateRenderedChannelPreviews(renderedRecommendations);
    }

    private updateChannelShelfChrome(
        elements: YouTubeChannelShelfElements,
        recommendations: YouTubeChannelRecommendation[],
        renderedRecommendations: YouTubeChannelRecommendation[],
    ): void {
        const language = this.options.getSettings().interfaceLanguage;
        elements.title.textContent = youtubeShelfText(language, YT_TITLE);
        elements.copy.textContent = this.channelShelfExpanded
            ? youtubeShelfText(language, YT_EXPANDED, {
                shown: recommendations.length,
                total: YOUTUBE_CHANNEL_RECOMMENDATION_COUNT,
            })
            : youtubeShelfText(language, YT_COMPACT, { total: YOUTUBE_CHANNEL_RECOMMENDATION_COUNT });
        const remainingChannels = this.unsubscribedChannels(allYouTubeChannelRecommendations()).length;
        elements.subscribeVisible.textContent = youtubeShelfText(language, YT_SUBSCRIBE_VISIBLE, { count: renderedRecommendations.length });
        elements.subscribeVisible.hidden = !renderedRecommendations.length;
        elements.subscribeAll.textContent = remainingChannels
            ? youtubeShelfText(language, YT_SUBSCRIBE_ALL, { count: remainingChannels })
            : youtubeShelfText(language, YT_ALL_SUBSCRIBED, { total: YOUTUBE_CHANNEL_RECOMMENDATION_COUNT });
        elements.never.textContent = uiText(language, 'hide');
        elements.expand.textContent = youtubeShelfText(language, this.channelShelfExpanded ? YT_COLLAPSE : YT_BROWSE_ALL);
        elements.expand.setAttribute('aria-expanded', String(this.channelShelfExpanded));
        if (!this.subscriptionBusy) elements.status.textContent = this.channelShelfStatusOverride;
    }

    private channelShelfStructuralSignature(recommendations: YouTubeChannelRecommendation[], renderedRecommendations: YouTubeChannelRecommendation[]): string {
        return [
            this.channelShelfExpanded ? 'expanded' : 'compact',
            this.channelShelfFilter,
            recommendations.map(channel => channel.handle).join('\u0001'),
            renderedRecommendations.map(channel => channel.handle).join('\u0001'),
        ].join('\u0003');
    }

    // m.youtube.com does not use the desktop html[dark] attribute, so detect
    // the page theme from the rendered background and mirror it on the shelf.
    private syncChannelShelfTheme(): void {
        if (!this.channelShelf) return;
        this.channelShelf.classList.toggle('is-dark', youtubePageUsesDarkTheme());
    }

    private currentChannelRecommendations(): YouTubeChannelRecommendation[] {
        return this.channelShelfExpanded
            ? this.unsubscribedChannels(filterYouTubeChannelRecommendations(this.channelShelfFilter))
            : this.compactChannelRecommendations;
    }

    private renderableChannelRecommendations(channels: YouTubeChannelRecommendation[]): YouTubeChannelRecommendation[] {
        if (!readYouTubeClientConfig()) return channels;
        return channels.filter(channel => this.isKnownUnsubscribedChannel(channel));
    }

    private isKnownUnsubscribedChannel(channel: YouTubeChannelRecommendation): boolean {
        if (this.subscribedChannelHandles.has(channel.handle) || this.unresolvableChannelHandles.has(channel.handle)) return false;
        if (!this.channelPreviewCache.has(channel.handle)) return false;
        return this.channelPreviewCache.get(channel.handle)?.subscribed === false;
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
        description.className = 'jpdb-youtube-channel-description jpdb-reader-parseable';
        description.textContent = youtubeChannelRecommendationDescription(channel);

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
        const language = this.options.getSettings().interfaceLanguage;
        subscribe.textContent = youtubeShelfText(language, YT_SUBSCRIBE);
        subscribe.setAttribute('aria-label', youtubeShelfText(language, YT_SUBSCRIBE_TO, { name: channel.name }));
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
            case 'never':
                this.options.setShowChannelRecommendations?.(false);
                this.clearChannelShelfRefresh();
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
                void this.subscribeToChannels(this.unsubscribedChannels(allYouTubeChannelRecommendations()));
                return;
        }
    }

    private subscribeToChannelHandle(handle: string | undefined): void {
        const channel = allYouTubeChannelRecommendations().find(candidate => candidate.handle === handle);
        if (channel) void this.subscribeToChannels([channel]);
    }

    private currentRenderedChannels(): YouTubeChannelRecommendation[] {
        if (!this.channelShelfExpanded) return this.compactChannelRecommendations;
        return this.unsubscribedChannels(filterYouTubeChannelRecommendations(this.channelShelfFilter));
    }

    private hydrateRenderedChannelPreviews(channels: YouTubeChannelRecommendation[]): void {
        this.hydrateChannelPreviewCandidates(channels);
        if (!this.channelShelfExpanded) {
            this.clearChannelPreviewBackfill();
            return;
        }
        const missing = this.missingChannelPreviewCandidates(channels);
        this.channelPreviewBackfillQueue = missing.slice(YOUTUBE_CHANNEL_SHELF_PREVIEW_LIMIT);
        this.scheduleChannelPreviewBackfill();
    }

    private hydrateChannelPreviewCandidates(channels: YouTubeChannelRecommendation[]): void {
        // Every channel was already confirmed subscribed; don't re-test on each
        // render. The flag is reset when the curated list changes.
        if (this.channelsAllSubscribed) return;
        const missing = this.missingChannelPreviewCandidates(channels);
        void this.hydrateChannelPreviews(missing.slice(0, YOUTUBE_CHANNEL_SHELF_PREVIEW_LIMIT));
    }

    private missingChannelPreviewCandidates(channels: YouTubeChannelRecommendation[]): YouTubeChannelRecommendation[] {
        return channels.filter(channel => !this.channelPreviewCache.has(channel.handle)
            && !this.pendingChannelPreviews.has(channel.handle)
            && !this.subscribedChannelHandles.has(channel.handle)
            && !this.unresolvableChannelHandles.has(channel.handle));
    }

    private ensureChannelSubscriptionProbe(): void {
        if (this.channelsAllSubscribed || this.channelSubscriptionProbeComplete || !readYouTubeClientConfig()) return;
        this.updateChannelSubscriptionProbeState();
        if (this.channelSubscriptionProbeComplete || this.channelSubscriptionProbeTimer !== undefined || this.channelSubscriptionProbeQueue.length) return;
        this.channelSubscriptionProbeQueue = this.missingChannelPreviewCandidates(allYouTubeChannelRecommendations());
        this.scheduleChannelSubscriptionProbeBatch(0);
    }

    private scheduleChannelSubscriptionProbeBatch(delayMs = YOUTUBE_CHANNEL_SUBSCRIPTION_PROBE_DELAY_MS): void {
        if (!this.channelSubscriptionProbeQueue.length) {
            this.updateChannelSubscriptionProbeState();
            return;
        }
        window.clearTimeout(this.channelSubscriptionProbeTimer);
        this.channelSubscriptionProbeTimer = window.setTimeout(() => {
            this.channelSubscriptionProbeTimer = undefined;
            if (this.destroyed || this.channelsAllSubscribed) return;
            const batch = this.channelSubscriptionProbeQueue.splice(0, YOUTUBE_CHANNEL_SHELF_PREVIEW_LIMIT)
                .filter(channel => !this.channelPreviewCache.has(channel.handle) && !this.pendingChannelPreviews.has(channel.handle));
            void this.hydrateChannelPreviews(batch);
            this.scheduleChannelSubscriptionProbeBatch();
        }, delayMs);
    }

    private updateChannelSubscriptionProbeState(): void {
        const settled = (channel: YouTubeChannelRecommendation): boolean =>
            this.subscribedChannelHandles.has(channel.handle)
            || this.unresolvableChannelHandles.has(channel.handle)
            || this.channelPreviewCache.has(channel.handle);
        if (!allYouTubeChannelRecommendations().every(settled)) return;
        this.channelSubscriptionProbeComplete = true;
        this.markChannelSubscriptionCompleteIfReady();
    }

    private scheduleChannelPreviewBackfill(): void {
        if (!this.channelPreviewBackfillQueue.length || this.channelPreviewBackfillTimer !== undefined) return;
        this.channelPreviewBackfillTimer = window.setTimeout(() => {
            this.channelPreviewBackfillTimer = undefined;
            if (this.destroyed || !this.channelShelf?.isConnected || !this.channelShelfExpanded) {
                this.clearChannelPreviewBackfill();
                return;
            }
            const batch = this.channelPreviewBackfillQueue.splice(0, YOUTUBE_CHANNEL_SHELF_PREVIEW_LIMIT)
                .filter(channel => !this.channelPreviewCache.has(channel.handle) && !this.pendingChannelPreviews.has(channel.handle));
            void this.hydrateChannelPreviews(batch);
            this.scheduleChannelPreviewBackfill();
        }, YOUTUBE_CHANNEL_SHELF_PREVIEW_BACKFILL_DELAY_MS);
    }

    private clearChannelPreviewBackfill(): void {
        window.clearTimeout(this.channelPreviewBackfillTimer);
        this.channelPreviewBackfillTimer = undefined;
        this.channelPreviewBackfillQueue = [];
    }

    private async hydrateChannelPreviews(channels: YouTubeChannelRecommendation[]): Promise<void> {
        const config = readYouTubeClientConfig();
        if (!config) return;
        for (const channel of channels) {
            if (this.channelPreviewCache.has(channel.handle) || this.pendingChannelPreviews.has(channel.handle)) continue;
            this.pendingChannelPreviews.add(channel.handle);
            void fetchYouTubeChannelPreview(channel, config, this.channelIdCache)
                .then(preview => {
                    if (this.destroyed) return;
                    this.channelPreviewCache.set(channel.handle, preview);
                    if (preview?.channelId) this.channelIdCache.set(channel.handle, preview.channelId);
                    if (preview?.subscribed) {
                        this.subscribedChannelHandles.add(channel.handle);
                        this.markChannelSubscriptionCompleteIfReady();
                        this.scheduleChannelShelfRefresh(0);
                        return;
                    }
                    if (!preview && this.channelIdCache.has(channel.handle) && this.channelIdCache.get(channel.handle) === null) {
                        this.unresolvableChannelHandles.add(channel.handle);
                        this.markChannelSubscriptionCompleteIfReady();
                    }
                    this.updateRenderedChannelPreview(channel);
                    this.updateChannelSubscriptionProbeState();
                    this.scheduleChannelShelfRefresh(0);
                })
                .catch(() => {
                    if (this.destroyed) return;
                    this.channelPreviewCache.set(channel.handle, null);
                    this.updateChannelSubscriptionProbeState();
                    this.scheduleChannelShelfRefresh(0);
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
        if (this.channelShelf) this.options.parseShelfJapanese?.(this.channelShelf);
    }

    private async subscribeToChannels(channels: YouTubeChannelRecommendation[]): Promise<void> {
        if (this.subscriptionBusy) return;
        const elements = this.channelShelfElements(this.ensureChannelShelf());
        if (!channels.length) {
            // Never leave the button looking dead: say why nothing happened.
            this.setChannelShelfStatus(elements, youtubeShelfText(this.options.getSettings().interfaceLanguage, YT_ALREADY_SUBSCRIBED));
            return;
        }
        const config = readYouTubeClientConfig();
        if (!config) {
            this.setChannelShelfStatus(elements, 'YouTube session data is not available on this page yet.');
            return;
        }
        if (!youTubeSapisidCookie()) {
            // Without the signed-in session cookie the subscribe write cannot
            // reach the user's account; be honest instead of faking success.
            this.setChannelShelfStatus(elements, 'Sign in to YouTube to subscribe to channels.');
            return;
        }

        this.channelShelfStatusOverride = '';
        this.clearChannelPreviewBackfill();
        this.clearChannelSubscriptionProbe();
        this.subscriptionBusy = true;
        this.setChannelShelfBusy(true);
        let subscribed = 0;
        let failed = 0;
        for (let index = 0; index < channels.length; index += 1) {
            const channel = channels[index]!;
            elements.status.textContent = `Subscribing ${index + 1}/${channels.length}: ${channel.name}`;
            try {
                const channelId = await resolveYouTubeChannelId(channel, config, this.channelIdCache);
                if (!channelId) {
                    // No id resolves for this handle — the channel was deleted,
                    // moved, or renamed. Mark it so it never blocks the
                    // "all subscribed" flag, and move on without erroring out.
                    this.unresolvableChannelHandles.add(channel.handle);
                    throw new Error('Missing YouTube channel id.');
                }
                await subscribeYouTubeChannel(channelId, config);
                subscribed += 1;
                this.markChannelRowSubscribed(channel);
            } catch {
                failed += 1;
            }
        }
        this.markChannelSubscriptionCompleteIfReady({ keepShelf: true });
        this.subscriptionBusy = false;
        this.setChannelShelfBusy(false);
        const language = this.options.getSettings().interfaceLanguage;
        this.setChannelShelfStatus(elements, failed
            ? youtubeShelfText(language, YT_PARTIAL_STATUS, { subscribed, failed })
            : youtubeShelfText(language, subscribed === 1 ? YT_STATUS_ONE : YT_STATUS_MANY, { count: subscribed }));
        if (subscribed) this.scheduleChannelShelfRefresh();
    }

    private setChannelShelfStatus(elements: YouTubeChannelShelfElements, status: string): void {
        this.channelShelfStatusOverride = status;
        elements.status.textContent = status;
    }

    // Show the confirmation in place first (button flips to "Subscribed", the
    // live status announces it), then let the refresh swap the row for the
    // next unsubscribed suggestion.
    private markChannelRowSubscribed(channel: YouTubeChannelRecommendation): void {
        this.subscribedChannelHandles.add(channel.handle);
        const row = Array.from(this.channelShelf?.querySelectorAll<HTMLElement>('[data-yomu-channel-handle]') ?? [])
            .find(candidate => candidate.dataset.yomuChannelHandle === channel.handle);
        const button = row?.querySelector<HTMLButtonElement>('[data-yomu-youtube-channel-action="subscribe-one"]');
        row?.classList.add('is-subscribed');
        if (!button) return;
        button.disabled = true;
        const language = this.options.getSettings().interfaceLanguage;
        button.textContent = youtubeShelfText(language, YT_SUBSCRIBED);
        button.setAttribute('aria-label', youtubeShelfText(language, YT_SUBSCRIBED_TO, { name: channel.name }));
    }

    private scheduleChannelShelfRefresh(delayMs = 1800): void {
        window.clearTimeout(this.channelShelfRefreshTimer);
        this.channelShelfRefreshTimer = window.setTimeout(() => {
            this.channelShelfRefreshTimer = undefined;
            if (this.channelsAllSubscribed) {
                this.removeChannelShelf();
                return;
            }
            if (this.channelShelf?.isConnected) {
                const recommendations = this.renderableChannelRecommendations(this.currentChannelRecommendations());
                if (recommendations.length) this.renderChannelShelf(this.channelShelfElements(this.channelShelf), recommendations);
                else this.schedule(0);
                return;
            }
            this.schedule(0);
        }, delayMs);
    }

    private clearChannelShelfRefresh(): void {
        window.clearTimeout(this.channelShelfRefreshTimer);
        this.channelShelfRefreshTimer = undefined;
    }

    private clearChannelSubscriptionProbe(): void {
        window.clearTimeout(this.channelSubscriptionProbeTimer);
        this.channelSubscriptionProbeTimer = undefined;
        this.channelSubscriptionProbeQueue = [];
    }

    private setChannelShelfBusy(busy: boolean): void {
        const allSubscribed = !this.unsubscribedChannels(allYouTubeChannelRecommendations()).length;
        this.channelShelf?.querySelectorAll<HTMLButtonElement>('[data-yomu-youtube-channel-action^="subscribe"]').forEach(button => {
            button.disabled = busy
                || (allSubscribed && button.dataset.yomuYoutubeChannelAction === 'subscribe-all');
        });
        this.channelShelf?.setAttribute('aria-busy', String(busy));
    }

    private removeChannelShelf(): void {
        this.clearChannelShelfRefresh();
        this.channelShelf?.remove();
        this.channelShelf = undefined;
        this.channelShelfRenderSignature = '';
        this.channelShelfStatusOverride = '';
        this.clearChannelPreviewBackfill();
    }

    private currentChannelShelfScope(): string {
        const routeKey = this.currentRouteKey();
        if (this.channelShelfRouteKey !== routeKey) {
            this.channelShelfRouteKey = routeKey;
            this.removeChannelShelf();
        }
        return routeKey;
    }

    private clear(): void {
        window.clearTimeout(this.timer);
        window.clearTimeout(this.metadataRescanTimer);
        this.clearChannelShelfRefresh();
        this.clearChannelSubscriptionProbe();
        this.clearChannelPreviewBackfill();
        this.timer = undefined;
        this.metadataRescanTimer = undefined;
        this.channelSubscriptionProbeComplete = false;
        this.revealed = false;
        this.clearFilteredCards();
        this.removeNotice();
        this.removeChannelShelf();
        this.dismissedNoticeScope = '';
        this.noticeRouteKey = '';
        this.channelShelfRouteKey = '';
        this.channelShelfExpanded = false;
        this.channelShelfFilter = 'all';
        this.subscriptionBusy = false;
        this.channelShelfStatusOverride = '';
        this.lastBackfillAt = Number.NEGATIVE_INFINITY;
        this.lastScrollAt = Number.NEGATIVE_INFINITY;
        this.lastAdvancedShortKey = '';
        this.lastShortAdvanceAt = Number.NEGATIVE_INFINITY;
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
                if (!this.destroyed && youtubeImmersionFilterEnabled(this.options.getSettings())) this.scheduleMetadataRescan();
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

    private removeNotice(): void {
        window.clearTimeout(this.noticeAutoHideTimer);
        this.noticeAutoHideTimer = undefined;
        this.noticeAutoHideScope = '';
        this.bar?.remove();
        this.bar = undefined;
    }

    private clearFilteredCards(): void {
        document
            .querySelectorAll<HTMLElement>(YOUTUBE_FILTERED_SELECTOR)
            .forEach(card => this.showCard(card));
        document
            .querySelectorAll<HTMLElement>(`.${YOUTUBE_FIRST_IN_ROW_CLASS}`)
            .forEach(card => card.classList.remove(YOUTUBE_FIRST_IN_ROW_CLASS));
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

function cardHasFilteredLayoutState(card: HTMLElement): boolean {
    return [YOUTUBE_FILTERED_CLASS, YOUTUBE_COLLAPSING_CLASS, YOUTUBE_COLLAPSED_CLASS]
        .some(className => card.classList.contains(className));
}

export function youtubeImmersionFilterEnabled(settings: ReaderSettings): boolean {
    return jpOnlyOn(
        settings,
        settings.youtubeImmersionEnabled,
        settings.youtubeImmersionEnabledChosen,
    );
}

function youtubeChannelRecommendationsEnabled(settings: ReaderSettings): boolean {
    return jpOnlyOn(
        settings,
        settings.youtubeShowChannelRecommendations,
        settings.youtubeShowChannelRecommendationsChosen,
    );
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
        const value = readYouTubeConfigStringFromScripts(key);
        if (value) data[key] = value;
    }
    const context = readYouTubeConfigScriptObject('INNERTUBE_CONTEXT');
    if (context) data.INNERTUBE_CONTEXT = context;
    return Object.keys(data).length ? { data_: data } : undefined;
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
        subscribed: youTubeBrowseDataShowsSubscribed(data),
    };
}

function youtubePageUsesDarkTheme(): boolean {
    if (document.documentElement.hasAttribute('dark')) return true;
    const background = readPageBackgroundColor();
    if (!background) return false;
    return relativeBackgroundLuminance(background) < 0.4;
}

function readPageBackgroundColor(): [number, number, number] | null {
    for (const element of [document.body, document.documentElement]) {
        if (!element) continue;
        const match = getComputedStyle(element).backgroundColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)/);
        if (!match) continue;
        if (match[4] !== undefined && Number.parseFloat(match[4]) === 0) continue;
        return [Number(match[1]), Number(match[2]), Number(match[3])];
    }
    return null;
}

function relativeBackgroundLuminance([red, green, blue]: [number, number, number]): number {
    return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255;
}

function youTubeBrowseDataShowsSubscribed(data: unknown): boolean | null {
    // Only the channel header speaks for THIS channel; the full browse payload
    // can contain subscribeButtonRenderer entries for unrelated shelves, which
    // would mark every suggestion as subscribed and empty the shelf (breaking
    // "Subscribe all"). Missing header/state is unknown, not unsubscribed: an
    // anonymous browse response can still include metadata for channels the
    // signed-in user already follows.
    const root = recordValue(data);
    const header = root?.header;
    if (!header) return null;
    return findNestedYouTubeSubscriptionStatus(header, root);
}

function findNestedYouTubeSubscriptionStatus(value: unknown, data: Record<string, unknown>): boolean | null {
    if (!isNestedYouTubeValue(value)) return null;
    const direct = readYouTubeSubscriptionStatus(value, data);
    if (direct !== null) return direct;
    for (const child of nestedYouTubeChildren(value)) {
        const found = findNestedYouTubeSubscriptionStatus(child, data);
        if (found !== null) return found;
    }
    return null;
}

function readYouTubeSubscriptionStatus(value: unknown, data: Record<string, unknown>): boolean | null {
    const legacy = legacyYouTubeSubscribeButtonSubscriptionStatus(value);
    if (legacy !== null) return legacy;
    return youTubeSubscribeButtonViewModelSubscriptionStatus(value, data);
}

function legacyYouTubeSubscribeButtonSubscriptionStatus(value: unknown): boolean | null {
    const renderer = recordValue(recordValue(value)?.subscribeButtonRenderer);
    return typeof renderer?.subscribed === 'boolean' ? renderer.subscribed : null;
}

function youTubeSubscribeButtonViewModelSubscriptionStatus(value: unknown, data: Record<string, unknown>): boolean | null {
    const model = recordValue(recordValue(value)?.subscribeButtonViewModel);
    if (!model) return null;
    const stateKey = youTubeSubscribeButtonStateKey(model);
    if (!stateKey) return null;
    return findYouTubeSubscriptionState(data, stateKey) ?? null;
}

function youTubeSubscribeButtonStateKey(model: Record<string, unknown>): string {
    return firstStringValue(
        model.stateEntityStoreKey,
        recordValue(recordValue(model.subscribeButtonContent)?.subscribeState)?.key,
        recordValue(recordValue(model.unsubscribeButtonContent)?.subscribeState)?.key,
    );
}

function findYouTubeSubscriptionState(value: unknown, stateKey: string): boolean | undefined {
    if (!isNestedYouTubeValue(value)) return undefined;
    const direct = readYouTubeSubscriptionState(value, stateKey);
    if (direct !== undefined) return direct;
    for (const child of nestedYouTubeChildren(value)) {
        const found = findYouTubeSubscriptionState(child, stateKey);
        if (found !== undefined) return found;
    }
    return undefined;
}

function readYouTubeSubscriptionState(value: unknown, stateKey: string): boolean | undefined {
    const entity = recordValue(recordValue(value)?.subscriptionStateEntity);
    if (!entity || stringValue(entity.key) !== stateKey || typeof entity.subscribed !== 'boolean') return undefined;
    return entity.subscribed;
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
    const headers = { ...youtubeInnerTubeHeaders(config), ...await youTubeAuthorizationHeaders() };
    const response = await fetch(`${location.origin}/youtubei/v1/${path}?key=${encodeURIComponent(config.apiKey)}&prettyPrint=false`, {
        method: 'POST',
        credentials: 'same-origin',
        headers,
        body: JSON.stringify({ context: config.context, ...body }),
    });
    if (!response.ok) throw new Error(`YouTube request failed: ${response.status}`);
    const json = await response.json() as unknown;
    return recordValue(json) ?? {};
}

// InnerTube write endpoints (subscription/subscribe) apply to the anonymous
// visitor session unless the request carries the signed-in SAPISIDHASH
// authorization — YouTube still answers 200, so the shelf would report
// "Subscribed" while the real account never changes.
let cachedYouTubeAuthorization: { key: string; headers: Promise<Record<string, string>> } | undefined;

async function youTubeAuthorizationHeaders(): Promise<Record<string, string>> {
    const sapisid = youTubeSapisidCookie();
    const subtle = globalThis.crypto?.subtle;
    if (!sapisid || !subtle) return {};
    const timestamp = Math.floor(Date.now() / 1000);
    const key = `${timestamp} ${sapisid} ${location.origin}`;
    if (cachedYouTubeAuthorization?.key !== key) {
        cachedYouTubeAuthorization = { key, headers: computeYouTubeAuthorizationHeaders(subtle, timestamp, key) };
    }
    return cachedYouTubeAuthorization.headers;
}

async function computeYouTubeAuthorizationHeaders(
    subtle: SubtleCrypto,
    timestamp: number,
    payload: string,
): Promise<Record<string, string>> {
    try {
        const digest = await subtle.digest('SHA-1', new TextEncoder().encode(payload));
        const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
        return {
            Authorization: `SAPISIDHASH ${timestamp}_${hash}`,
            'X-Origin': location.origin,
            'X-Goog-AuthUser': readYouTubeConfigString(readYouTubeConfigSource(), 'SESSION_INDEX') || '0',
        };
    } catch {
        return {};
    }
}

function youTubeSapisidCookie(): string {
    for (const name of ['SAPISID', '__Secure-3PAPISID', '__Secure-1PAPISID']) {
        const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${escapeRegExp(name)}=([^;\\s]+)`, 'u'));
        if (match?.[1]) return match[1];
    }
    return '';
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
        nativeYouTubeText(title),
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

// iOS Safari has no CSS scroll anchoring, so collapsing a card that sits at
// or above the viewport shifts everything the user is reading. Keep whatever
// element is currently in view stationary by measuring its viewport offset
// across the layout mutation and compensating the scroll position.
function withFeedScrollAnchor(mutated: HTMLElement, mutate: () => void): void {
    const anchor = feedScrollAnchorElement(mutated);
    const before = anchor?.getBoundingClientRect().top;
    const scroller = anchor ? feedScrollerFor(anchor) : null;
    mutate();
    if (!anchor || before === undefined || !anchor.isConnected || !scroller) return;
    const delta = anchor.getBoundingClientRect().top - before;
    if (Math.abs(delta) > 0.5) scroller(delta);
}

// UT-39: m.youtube.com (and some desktop states) scroll inside a container,
// not the window — anchor against whichever scroller actually moved, or the
// compensation never fires and filtering shifts the feed under the finger.
function feedScrollerFor(anchor: HTMLElement): ((delta: number) => void) | null {
    let current = anchor.parentElement;
    while (current && current !== document.body && current !== document.documentElement) {
        let style: CSSStyleDeclaration;
        try { style = getComputedStyle(current); } catch { return null; }
        if ((style.overflowY === 'auto' || style.overflowY === 'scroll') && current.scrollHeight > current.clientHeight + 1) {
            const scroller = current;
            return delta => { scroller.scrollTop += delta; };
        }
        current = current.parentElement;
    }
    return delta => window.scrollBy(0, delta);
}

function feedHasScrolled(mutated: HTMLElement): boolean {
    if (window.scrollY > 0) return true;
    let current = mutated.parentElement;
    while (current && current !== document.body && current !== document.documentElement) {
        if (current.scrollTop > 0) return true;
        current = current.parentElement;
    }
    return false;
}

function feedScrollAnchorElement(mutated: HTMLElement): HTMLElement | null {
    if (!feedHasScrolled(mutated) || typeof document.elementFromPoint !== 'function') return null;
    for (const ratio of [0.35, 0.55, 0.8]) {
        const probe = document.elementFromPoint(
            Math.floor(window.innerWidth / 2),
            Math.floor(window.innerHeight * ratio),
        );
        if (!(probe instanceof HTMLElement) || !probe.isConnected) continue;
        // The mutated card itself (or its ancestors) cannot anchor: its rect
        // is what the mutation changes.
        if (probe === mutated || mutated.contains(probe) || probe.contains(mutated)) continue;
        return probe;
    }
    return null;
}

function collectYouTubeFilterItems(root: ParentNode = document): HTMLElement[] {
    if (isInsideReaderRoot(root)) return [];
    const items = new Set<HTMLElement>(collectYouTubeVideoCards(root));
    root.querySelectorAll<HTMLElement>(`${VIDEO_CARD_SELECTOR},${NON_VIDEO_CONTAINER_SELECTOR}`).forEach(element => {
        const normalized = normalizeYouTubeFilterItem(element);
        if (normalized) items.add(normalized);
    });
    collectYouTubeCommunityPosts(root).forEach(item => items.add(item));
    return [...items].filter(item => item.isConnected);
}

// Feed community posts are filterable; a channel's own posts page is a
// deliberate destination (filtering there blanks the page the user chose).
function collectYouTubeCommunityPosts(root: ParentNode = document): HTMLElement[] {
    if (isYouTubeChannelPostsPage()) return [];
    return Array.from(root.querySelectorAll<HTMLElement>(COMMUNITY_POST_SELECTOR))
        .map(post => post.closest<HTMLElement>('ytd-rich-item-renderer,ytm-rich-item-renderer')
            ?? post.closest<HTMLElement>('ytd-backstage-post-thread-renderer,ytm-backstage-post-thread-renderer,ytd-post-renderer,ytm-post-renderer')
            ?? post)
        .filter(item => item.isConnected);
}

function isYouTubeChannelPostsPage(): boolean {
    const path = location.pathname;
    return /\/(?:posts|community)\/?$/u.test(path) || path.startsWith('/post/');
}

function youTubeCommunityPostText(card: HTMLElement): string | null {
    const post = card.matches(COMMUNITY_POST_SELECTOR) ? card : card.querySelector<HTMLElement>(COMMUNITY_POST_SELECTOR);
    if (!post) return null;
    const textEl = post.querySelector<HTMLElement>(COMMUNITY_POST_TEXT_SELECTOR);
    if (!textEl) return '';
    const clone = textEl.cloneNode(true) as HTMLElement;
    // "Read more" buttons (続きを読む on mweb) live inside the text container
    // and would register as Japanese content.
    clone.querySelectorAll('button').forEach(button => button.remove());
    return (clone.textContent ?? '').replace(/\s+/g, ' ').trim();
}

function collectFilterableVideoShelves(root: ParentNode = document): HTMLElement[] {
    return Array.from(root.querySelectorAll<HTMLElement>(FILTERABLE_VIDEO_SHELF_SELECTOR))
        .filter(isFilterableVideoShelf);
}

// YouTube computes per-item row flags (is-in-first-column / is-first-in-column
// plus first-row margins) for the FULL feed and never recomputes them when
// items leave the flow, so offscreen-filtering leaves stale flags: rows start
// mid-grid, margins misalign, and holes appear. The NihongoTube fix: strip
// YouTube's flags and re-mark the first VISIBLE item of each row with our own
// margin-compensation class, resetting the row counter at visible sections.
// UT-26: shelf carousels render their items lazily on PAGING, not on
// visibility — when filtering collapses the rendered neighbours, the
// still-unrendered slots slide into the visible page as blank full-height
// boxes (the "missing video gaps"). Keep them out of the flow until YouTube
// hydrates them; the childList observer re-runs this sweep when they do.
export function syncUnrenderedYouTubeShelfSlots(root: ParentNode = document): void {
    root.querySelectorAll<HTMLElement>(YOUTUBE_UNRENDERED_SHELF_SLOT_SELECTOR).forEach(slot => {
        if (slot.classList.contains(YOUTUBE_FILTERED_CLASS) || slot.classList.contains(YOUTUBE_PENDING_CLASS)) {
            slot.classList.remove(YOUTUBE_UNRENDERED_SLOT_CLASS);
            return;
        }
        const rendered = Boolean(slot.querySelector(YOUTUBE_RENDERED_SLOT_SELECTOR));
        slot.classList.toggle(YOUTUBE_UNRENDERED_SLOT_CLASS, !rendered);
    });
}

export function rebalanceYouTubeGridRows(root: ParentNode = document): void {
    root.querySelectorAll<HTMLElement>('ytd-rich-grid-renderer').forEach(grid => {
        const contents = grid.querySelector<HTMLElement>('div#contents');
        if (!contents) return;
        const sample = contents.querySelector<HTMLElement>('ytd-rich-item-renderer');
        const itemsPerRow = Number(sample?.getAttribute('items-per-row') ?? grid.getAttribute('elements-per-row') ?? '');
        if (!Number.isFinite(itemsPerRow) || itemsPerRow <= 0) return;
        let column = 0;
        const markGridChild = (child: Element): void => {
            if (!(child instanceof HTMLElement)) return;
            const tag = child.tagName.toLowerCase();
            if (tag === 'ytd-rich-section-renderer') {
                if (!child.classList.contains(YOUTUBE_FILTERED_CLASS)) column = 0;
                return;
            }
            if (tag !== 'ytd-rich-item-renderer') return;
            if (child.classList.contains(YOUTUBE_FILTERED_CLASS) || child.classList.contains(YOUTUBE_PENDING_CLASS)) {
                child.classList.remove(YOUTUBE_FIRST_IN_ROW_CLASS);
                return;
            }
            child.removeAttribute('is-in-first-column');
            child.removeAttribute('is-first-in-column');
            child.classList.toggle(YOUTUBE_FIRST_IN_ROW_CLASS, column % itemsPerRow === 0);
            column += 1;
        };
        for (const child of Array.from(contents.children)) {
            // Row wrappers are flattened into one flow by the display:contents
            // rule, so visual rows span DOM rows after filtering: keep ONE
            // column counter across every row instead of restarting per row.
            if (child.tagName.toLowerCase() === 'ytd-rich-grid-row') {
                const rowContents = child.querySelector(':scope > div#contents');
                for (const rowChild of Array.from((rowContents ?? child).children)) markGridChild(rowChild);
                continue;
            }
            markGridChild(child);
        }
    });
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

// Ad cards (in-feed ad slots and the lockup ad variant, live 2026-07-11)
// carry no <h3> title; the generic a[href*="/watch"] title fallback lands on
// their CTA label (視聴する under a Japanese UI locale), which classified
// every ad — English included — as Japanese and kept it visible. Ads are not
// immersion content in any language: always hidden while the filter is on.
const YOUTUBE_AD_CARD_SELECTOR = 'ytd-ad-slot-renderer,ytd-in-feed-ad-layout-renderer,ytd-display-ad-renderer,ytd-promoted-sparkles-web-renderer,ytm-promoted-video-renderer,[class*="AdDetailsLineViewModel"]';

function isYouTubeAdCard(card: HTMLElement): boolean {
    return Boolean(card.closest('ytd-ad-slot-renderer')) || Boolean(card.querySelector(YOUTUBE_AD_CARD_SELECTOR));
}

function isYouTubeAlwaysHiddenItem(card: HTMLElement): boolean {
    if (isYouTubeAdCard(card)) return true;
    if (card.querySelector(CHANNEL_LISTING_CONTENT_SELECTOR)) return false;
    return card.matches(NON_VIDEO_CONTAINER_SELECTOR) || isYouTubePlaylistLikeCard(card);
}

function normalizeYouTubeNonVideoContainer(element: HTMLElement): HTMLElement | null {
    if (isFilterableVideoShelf(element)) return null;
    // Channel listings (/feed/channels wraps every subscribed channel in one
    // ytd-shelf-renderer) are management surfaces, not feed noise: hiding the
    // "non-video container" there blanks the whole page as one item.
    if (element.querySelector(CHANNEL_LISTING_CONTENT_SELECTOR)) return null;
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
    if (!hasYouTubeVideoLink(element) && !element.matches(SHORTS_CARD_SELECTOR)) return false;
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
    const selfVideoId = card.getAttribute('video-id') || card.getAttribute('data-video-id');
    if (selfVideoId) return selfVideoId;
    const descendantVideoId = card.querySelector('[video-id]')?.getAttribute('video-id');
    if (descendantVideoId) return descendantVideoId;
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


function isCurrentYouTubeShortsWatchCard(card: HTMLElement): boolean {
    if (!isYouTubeShortsWatchPage()) return false;
    const item = card.closest<HTMLElement>(SHORTS_WATCH_ITEM_SELECTOR) ?? card;
    const currentVideoId = currentYouTubeShortsVideoId();
    const itemVideoId = readYouTubeVideoId(item);
    if (currentVideoId && itemVideoId) return itemVideoId === currentVideoId;
    // Protect the active reel by several independent signals so the player is
    // never blanked: YouTube's own active marker and, when the item has no
    // comparable URL id, the reel covering the viewport centre. URL identity
    // wins first so restoring a previously filtered current reel cannot make
    // the next English reel look "current" just because it snapped under the
    // viewport centre while the real current item was collapsed.
    if (isActiveYouTubeShortsReel(item)) return true;
    return false;
}

function isActiveYouTubeShortsReel(item: HTMLElement): boolean {
    if (item.hasAttribute('is-active') || item.getAttribute('aria-hidden') === 'false') return true;
    const rect = item.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return false;
    const viewportCenter = window.innerHeight / 2;
    return rect.top <= viewportCenter && rect.bottom >= viewportCenter;
}

function activeShortsTitle(): string {
    // The browser tab title carries the ORIGINAL (untranslated) video title;
    // the on-screen overlay (yt-shorts-video-title-view-model) is auto-translated
    // into the UI language for non-English locales, which would make an English
    // short look Japanese to the language filter. Prefer the tab title; the
    // overlay is only a fallback before navigation settles. The oEmbed original
    // title (keyed by video id in resolveTitleForFiltering) remains the final
    // authority either way.
    const tabTitle = document.title.replace(/\s*-\s*YouTube\s*$/i, '').trim();
    if (tabTitle && tabTitle.toLowerCase() !== 'youtube') return tabTitle;
    return document.querySelector('yt-shorts-video-title-view-model')?.textContent?.trim() ?? '';
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
    // Let YouTube's own intersection observer load continuations when the user
    // scrolls them into view. Older builds used scrollIntoView() here as an
    // eager backfill nudge, but on mobile it could jump the home feed to the
    // Shorts/continuation area, and on desktop it could leave YouTube stuck on
    // skeleton placeholders while we repeatedly poked and restored scroll.
    // Return true only to throttle this no-op path while the loader is already
    // close enough that native YouTube should see it naturally.
    const rect = continuation.getBoundingClientRect();
    return rect.bottom >= 0 && rect.top <= window.innerHeight * 1.25;
}


function shouldHidePendingYouTubeCard(card: HTMLElement): boolean {
    if (typeof window === 'undefined') return false;
    const rect = card.getBoundingClientRect();
    if (rect.width <= 0 && rect.height <= 0) return false;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    if (viewportHeight <= 0) return false;
    const preloadMargin = Math.max(360, viewportHeight * 0.75);
    return rect.bottom < -preloadMargin || rect.top > viewportHeight + preloadMargin;
}

function shouldShowFilterNoticeForRoute(): boolean {
    return !isYouTubeWatchPage() && !isYouTubeShortsWatchPage();
}

function isYouTubePlaylistLikeCard(card: HTMLElement): boolean {
    if (card.matches(NON_VIDEO_CONTAINER_SELECTOR)) return true;
    // UT-38: lockup-style mix/playlist stacks (ミックスリスト …) carry a
    // collection (stacked) thumbnail and link to watch?v=…&list=RD…, so the
    // old href rules saw an ordinary video link and the Japanese title kept
    // them visible.
    if (card.querySelector('yt-collection-thumbnail-view-model, ytd-playlist-thumbnail')) return true;
    const links = Array.from(card.querySelectorAll<HTMLAnchorElement>('a[href]'));
    const playlistLinks = links.filter(link => {
        const href = link.getAttribute('href') ?? '';
        return href.includes('/playlist?')
            || href.includes('/watch_videos?')
            || /[?&]start_radio=/.test(href)
            || /[?&]list=RD/.test(href)
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
        const raw = managedSessionStorage.getItem(storedOEmbedTitleKey(videoId));
        if (!raw) return undefined;
        const parsed = JSON.parse(raw) as Partial<StoredOEmbedTitle>;
        if (!Number.isFinite(parsed.cachedAt) || Date.now() - Number(parsed.cachedAt) > OEMBED_SESSION_CACHE_TTL_MS) {
            managedSessionStorage.removeItem(storedOEmbedTitleKey(videoId));
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
        managedSessionStorage.setItem(storedOEmbedTitleKey(videoId), JSON.stringify(stored));
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
    const changedNodes = [...Array.from(mutation.addedNodes), ...Array.from(mutation.removedNodes)];
    const nodes = mutation.type === 'childList' && changedNodes.length
        ? changedNodes
        : [mutation.target, ...changedNodes];
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
    if (!element || isInsideReaderRoot(element)) return null;
    return element;
}

function isYouTubeCardOrFeedElement(element: Element): boolean {
    if (element.matches(VIDEO_CARD_SELECTOR)) return true;
    if (element.matches(NON_VIDEO_CONTAINER_SELECTOR)) return true;
    if (element.matches(YOUTUBE_FEED_CONTAINER_SELECTOR)) return true;
    return Boolean(element.closest(VIDEO_CARD_SELECTOR));
}

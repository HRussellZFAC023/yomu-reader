import { afterEach, describe, expect, it, vi } from 'vitest';
import { testEnSettings } from './helpers/settings-fixture';

// These tests assert English UI copy; pin the interface language since the
// shipped default is now 'ja'.
const DEFAULT_SETTINGS = testEnSettings();
import {
    allYouTubeChannelRecommendations,
    YOUTUBE_CHANNEL_RECOMMENDATION_COUNT,
    youtubeChannelRecommendationDescription,
    youTubeChannelListSignature,
} from '../../src/reader/subtitles/youtube-channel-recommendations';
import { gmStorageGetSync, gmStorageSetSync } from '../../src/reader/app/storage';
import {
    classifyYouTubeFilterCandidates,
    youTubeTargetLanguageDetector,
} from '../../src/reader/subtitles/youtube-filter-scan';
import {
    YoutubeImmersionFilter,
    collectYouTubeVideoCards,
    isProbablyJapaneseYouTubeText,
    rebalanceYouTubeGridRows,
    syncUnrenderedYouTubeShelfSlots,
} from '../../src/reader/subtitles/youtube';
import type { ReaderSettings } from '../../src/reader/app/types';

function renderYouTubeCards(): void {
    document.body.innerHTML = `
        <main>
            <ytd-rich-item-renderer data-case="jp">
                <a id="video-title" href="/watch?v=jp" aria-label="日本語で花の名前を覚える">花の名前</a>
            </ytd-rich-item-renderer>
            <ytd-rich-item-renderer data-case="english">
                <a id="video-title" href="/watch?v=en">10 habits for studying</a>
            </ytd-rich-item-renderer>
            <ytd-rich-item-renderer data-case="channel-only">
                <a id="video-title" href="/watch?v=channel">study with me</a>
                <span id="channel-name">日本語チャンネル</span>
            </ytd-rich-item-renderer>
            <ytd-rich-item-renderer data-case="translated-english">
                <a id="video-title" href="/watch?v=translated">37,000行のスロップ</a>
            </ytd-rich-item-renderer>
            <yt-lockup-view-model data-case="modern-lockup">
                <a class="ytLockupViewModelContentImage" href="/watch?v=modern">25:39</a>
                <div class="ytLockupMetadataViewModelMetadata">
                    <h3 class="ytLockupMetadataViewModelHeadingReset" title="東京カフェで朝ごはん">東京カフェで朝ごはん</h3>
                    <a class="ytLockupMetadataViewModelTitle" href="/watch?v=modern">東京カフェで朝ごはん</a>
                    <span>Japanese channel</span>
                </div>
            </yt-lockup-view-model>
        </main>
    `;
}

function card(caseName: string): HTMLElement {
    return document.querySelector<HTMLElement>(`[data-case="${caseName}"]`)!;
}

function readCardTitle(card: HTMLElement): string {
    return card.querySelector<HTMLElement>('#video-title, h3, .ytLockupMetadataViewModelTitle')?.textContent?.trim() ?? '';
}

function stubOEmbedTitles(titles: Record<string, string>): void {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
        const url = new URL(String(input));
        const watchUrl = new URL(url.searchParams.get('url') ?? 'https://www.youtube.com/watch');
        const videoId = watchUrl.searchParams.get('v') ?? '';
        return {
            ok: true,
            json: async () => ({ title: titles[videoId] ?? '' }),
        };
    }));
}

function stubYouTubeChannelPreviewFetch(subscribedHandles: Set<string>): void {
    const channels = allYouTubeChannelRecommendations();
    const idByHandle = new Map(channels.map((channel, index) => [channel.handle, `UC${String(index).padStart(22, '0')}`]));
    const handleById = new Map([...idByHandle].map(([handle, id]) => [id, handle]));

    vi.stubGlobal('ytcfg', {
        get: (key: string) => ({
            INNERTUBE_API_KEY: 'test-key',
            INNERTUBE_CONTEXT: { client: { clientName: 'WEB', clientVersion: 'test-version' } },
            INNERTUBE_CLIENT_NAME: '1',
            INNERTUBE_CLIENT_VERSION: 'test-version',
            VISITOR_DATA: 'visitor',
        } as Record<string, unknown>)[key],
    });
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const url = input instanceof Request ? input.url : String(input);
        if (url.includes('/oembed')) {
            const watchUrl = new URL(new URL(url).searchParams.get('url') ?? 'https://www.youtube.com/watch');
            const videoId = watchUrl.searchParams.get('v') ?? '';
            return jsonFetchResponse({ title: videoId === 'jp' || videoId === 'modern' ? '東京カフェで朝ごはん' : 'Desk setup tour' });
        }
        if (url.includes('/youtubei/v1/navigation/resolve_url')) {
            const body = JSON.parse(String(init?.body ?? '{}')) as { url?: string };
            const handle = decodeURIComponent(new URL(body.url ?? 'https://www.youtube.com/@missing').pathname.slice(1));
            return jsonFetchResponse({ endpoint: { browseEndpoint: { browseId: idByHandle.get(handle) ?? 'UC0000000000000000000000' } } });
        }
        if (url.includes('/youtubei/v1/browse')) {
            const body = JSON.parse(String(init?.body ?? '{}')) as { browseId?: string };
            const handle = handleById.get(body.browseId ?? '') ?? '@missing';
            return jsonFetchResponse(channelPreviewBrowseData(handle, body.browseId ?? '', subscribedHandles.has(handle)));
        }
        return jsonFetchResponse({}, 404);
    }));
}

function jsonFetchResponse(value: unknown, status = 200): Response {
    return {
        ok: status >= 200 && status < 300,
        status,
        json: async () => value,
    } as Response;
}

function channelPreviewBrowseData(handle: string, channelId: string, subscribed: boolean): Record<string, unknown> {
    const channel = allYouTubeChannelRecommendations().find(candidate => candidate.handle === handle);
    return {
        metadata: {
            channelMetadataRenderer: {
                title: channel?.name ?? handle,
                avatar: { thumbnails: [{ url: `https://yt.example/${encodeURIComponent(handle)}.jpg`, width: 88 }] },
            },
        },
        ...channelSubscriptionStateData(channelId, subscribed),
    };
}

function channelSubscriptionStateData(channelId: string, subscribed: boolean): Record<string, unknown> {
    const stateKey = `subscription-state:${channelId}`;
    return {
        header: {
            pageHeaderRenderer: {
                content: {
                    pageHeaderViewModel: {
                        actions: {
                            flexibleActionsViewModel: {
                                actionsRows: [{
                                    actions: [{
                                        subscribeButtonViewModel: {
                                            stateEntityStoreKey: stateKey,
                                            subscribeButtonContent: { subscribeState: { key: stateKey, subscribed: false } },
                                            // This branch is present in current YouTube responses even when the account
                                            // is not subscribed; only the matching subscriptionStateEntity is current.
                                            unsubscribeButtonContent: { subscribeState: { key: stateKey, subscribed: true } },
                                        },
                                    }],
                                }],
                            },
                        },
                    },
                },
            },
        },
        frameworkUpdates: {
            entityBatchUpdate: {
                mutations: [{ payload: { subscriptionStateEntity: { key: stateKey, subscribed } } }],
            },
        },
    };
}

const CHANNEL_SHELF_TEST_TIMEOUT_MS = 15_000;

function deferred<T>(): { promise: Promise<T>; resolve: (value: T) => void; reject: (reason?: unknown) => void } {
    let resolve!: (value: T) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((settle, fail) => {
        resolve = settle;
        reject = fail;
    });
    return { promise, resolve, reject };
}

type FilterWait = 'none' | 'initial-scan' | 'timer-tick' | 'flush-work';

type StubbedLocation = Pick<Location, 'href' | 'origin' | 'hostname' | 'pathname' | 'search'>;
const YOUTUBE_RESULTS_LOCATION: StubbedLocation = {
    href: 'https://www.youtube.com/results?search_query=nihongo',
    origin: 'https://www.youtube.com',
    hostname: 'www.youtube.com',
    pathname: '/results',
    search: '?search_query=nihongo',
};

interface StartYoutubeFilterOptions {
    html?: string;
    location?: StubbedLocation;
    oEmbedTitles?: Record<string, string>;
    settings?: ReaderSettings;
    filterOptions?: Partial<ConstructorParameters<typeof YoutubeImmersionFilter>[0]>;
    wait?: FilterWait;
}

function youtubeFilterSettings(overrides: Partial<ReaderSettings> = {}): ReaderSettings {
    return {
        ...DEFAULT_SETTINGS,
        youtubeImmersionEnabled: true,
        youtubeShowFilterNotice: true,
        ...overrides,
    };
}

function createYoutubeFilter(
    getSettings: () => ReaderSettings,
    options: Partial<ConstructorParameters<typeof YoutubeImmersionFilter>[0]> = {},
): YoutubeImmersionFilter {
    return new YoutubeImmersionFilter({
        getSettings,
        isActivePage: () => true,
        ...options,
    });
}

async function startYoutubeFilter({
    html,
    location,
    oEmbedTitles,
    settings = youtubeFilterSettings(),
    filterOptions,
    wait = 'initial-scan',
}: StartYoutubeFilterOptions = {}): Promise<{ filter: YoutubeImmersionFilter; settings: ReaderSettings }> {
    vi.useFakeTimers();
    if (oEmbedTitles) {
        stubOEmbedTitles(oEmbedTitles);
    }
    if (location) {
        vi.stubGlobal('location', location);
    }
    if (html !== undefined) {
        document.body.innerHTML = html;
    }

    const filter = createYoutubeFilter(() => settings, {
        setShowFilterNotice: visible => {
            settings.youtubeShowFilterNotice = visible;
        },
        ...filterOptions,
    });
    filter.init();

    if (wait === 'initial-scan') {
        await runInitialFilterScan();
    } else if (wait === 'timer-tick') {
        await vi.advanceTimersByTimeAsync(0);
    } else if (wait === 'flush-work') {
        await flushPendingFilterWork();
    }

    return { filter, settings };
}

async function runInitialFilterScan(): Promise<void> {
    await vi.advanceTimersByTimeAsync(300);
    await flushPendingFilterWork();
}

async function flushPendingFilterWork(): Promise<void> {
    // Drain until the fake-timer queue is stable rather than a fixed number of
    // cycles: scan work re-schedules follow-up timers, and a fixed loop can
    // under-drain when a slow scheduler chains more continuations than expected,
    // leaving a test asserting against half-settled state (a load-only flake).
    // The hard cap guarantees termination even if a timer perpetually re-arms.
    const MAX_CYCLES = 40;
    for (let i = 0; i < MAX_CYCLES; i += 1) {
        await settlePromises();
        const pendingBefore = vi.getTimerCount();
        await vi.advanceTimersByTimeAsync(25);
        await settlePromises();
        if (pendingBefore === 0 && vi.getTimerCount() === 0) return;
    }
}

async function settlePromises(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
}

async function waitForChannelSubscriptionResult(
    bodies: unknown[],
    expectedCount = YOUTUBE_CHANNEL_RECOMMENDATION_COUNT,
): Promise<void> {
    for (let i = 0; i < expectedCount * 8; i += 1) {
        await settlePromises();
        await vi.advanceTimersByTimeAsync(25);
        const status = document.querySelector<HTMLElement>('[data-role="channel-status"]')?.textContent ?? '';
        if (bodies.length >= expectedCount && status.startsWith('Subscribed to ')) return;
    }
}

async function waitForChannelShelfCondition(
    predicate: (shelf: HTMLElement | null) => boolean,
    attempts = 160,
): Promise<void> {
    for (let i = 0; i < attempts; i += 1) {
        await settlePromises();
        await vi.advanceTimersByTimeAsync(50);
        await settlePromises();
        const shelf = document.querySelector<HTMLElement>('.jpdb-youtube-channel-shelf');
        if (predicate(shelf)) return;
    }
}

function channelShelfRowHandles(root: ParentNode | null = document): string[] {
    return Array.from(root?.querySelectorAll<HTMLElement>('.jpdb-youtube-channel-row') ?? [])
        .map(row => row.dataset.yomuChannelHandle ?? '')
        .filter(Boolean);
}

describe('YouTube immersion filter', () => {
    afterEach(() => {
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.unstubAllGlobals();
        sessionStorage.clear();
        localStorage.clear();
        document.body.replaceChildren();
        document.title = '';
    });

    it('reads video card titles without treating Japanese channel names as Japanese videos', () => {
        renderYouTubeCards();

        const cards = collectYouTubeVideoCards(document);

        expect(cards).toHaveLength(5);
        expect(isProbablyJapaneseYouTubeText(readCardTitle(cards[0]))).toBe(true);
        expect(isProbablyJapaneseYouTubeText(readCardTitle(cards[1]))).toBe(false);
        expect(isProbablyJapaneseYouTubeText(readCardTitle(cards[2]))).toBe(false);
        expect(isProbablyJapaneseYouTubeText(readCardTitle(cards[3]))).toBe(true);
        expect(readCardTitle(cards[4])).toBe('東京カフェで朝ごはん');
        expect(isProbablyJapaneseYouTubeText(readCardTitle(cards[4]))).toBe(true);
        expect(isProbablyJapaneseYouTubeText('日本語')).toBe(true);
        expect(isProbablyJapaneseYouTubeText('東京散歩')).toBe(true);
        expect(isProbablyJapaneseYouTubeText('睡眠音楽♪')).toBe(true);
        expect(isProbablyJapaneseYouTubeText('作業用BGM')).toBe(true);
        expect(isProbablyJapaneseYouTubeText('Complete Beginner Japanese Comprehensible Input')).toBe(true);
        expect(isProbablyJapaneseYouTubeText('Japanese Listening Practice With A Story #1')).toBe(true);
        expect(isProbablyJapaneseYouTubeText('Japanese Daily Conversation at a Combini')).toBe(true);
        expect(isProbablyJapaneseYouTubeText('Common Japanese words you are using wrong')).toBe(true);
        expect(isProbablyJapaneseYouTubeText('Nihongo podcast for N5/N4')).toBe(true);
        expect(isProbablyJapaneseYouTubeText('fypシ゚')).toBe(false);
    });

    it('classifies filter candidates and counts without touching card DOM', () => {
        const cards = ['jp', 'english', 'playlist', 'missing-title', 'missing-filter-text']
            .map(name => {
                const element = document.createElement('div');
                element.dataset.case = name;
                return element;
            });

        const result = classifyYouTubeFilterCandidates([
            { card: cards[0], title: '花の名前', filterText: '花の名前', videoId: 'jp', alwaysHidden: false },
            { card: cards[1], title: 'Desk setup', filterText: 'Desk setup', videoId: 'en', alwaysHidden: false },
            { card: cards[2], title: '', filterText: '', videoId: 'playlist', alwaysHidden: true },
            { card: cards[3], title: '', filterText: '', videoId: 'missing', alwaysHidden: false },
            { card: cards[4], title: '東京カフェ', filterText: '', videoId: 'pending', alwaysHidden: false },
        ], { revealed: false });

        expect(result.decisions.map(decision => [decision.kind, decision.reason])).toEqual([
            ['show', 'japanese'],
            ['hide', 'non-japanese'],
            ['hide', 'always-hidden'],
            ['skip', 'missing-title'],
            ['hide', 'missing-filter-text'],
        ]);
        expect(result.filteredCount).toBe(2);
        expect(result.shownCount).toBe(1);
        expect([...result.visibleVideoIds]).toEqual(['jp']);
        expect(cards.some(element => element.classList.contains('jpdb-youtube-filtered'))).toBe(false);
    });

    it('still counts revealed hidden videos while only visible real videos count toward backfill uniqueness', () => {
        const english = document.createElement('div');
        const playlist = document.createElement('div');

        const result = classifyYouTubeFilterCandidates([
            { card: english, title: 'Desk setup', filterText: 'Desk setup', videoId: 'en', alwaysHidden: false },
            { card: playlist, title: '', filterText: '', videoId: 'playlist', alwaysHidden: true },
        ], { revealed: true });

        expect(result.decisions.map(decision => [decision.kind, decision.reason])).toEqual([
            ['show', 'revealed'],
            ['show', 'always-hidden-revealed'],
        ]);
        expect(result.filteredCount).toBe(2);
        expect(result.shownCount).toBe(2);
        expect([...result.visibleVideoIds]).toEqual(['en']);
    });

    it('collects outer video cards while skipping playlist and mix tiles', () => {
        document.body.innerHTML = `
            <main>
                <ytd-rich-item-renderer data-case="outer-video">
                    <ytd-rich-grid-media>
                        <a id="video-title" href="/watch?v=grid">東京散歩</a>
                    </ytd-rich-grid-media>
                </ytd-rich-item-renderer>
                <ytd-playlist-renderer data-case="playlist">
                    <a id="video-title" href="/playlist?list=PL123">日本語の再生リスト</a>
                </ytd-playlist-renderer>
                <yt-lockup-view-model data-case="mix-lockup">
                    <a class="ytLockupViewModelContentImage" href="/watch?v=mix&list=RDmix">Mix</a>
                    <span class="badge-shape-wiz__text">Mix</span>
                    <h3 class="ytLockupMetadataViewModelHeadingReset">作業用BGM</h3>
                </yt-lockup-view-model>
            </main>
        `;

        const cards = collectYouTubeVideoCards(document);

        expect(cards).toEqual([card('outer-video')]);
    });

    it('collects and filters mobile video-with-context media items', async () => {
        const { filter } = await startYoutubeFilter({
            oEmbedTitles: {
                'mweb-en': 'Desk setup tour',
                'mweb-jp': '東京散歩',
                'mweb-original-jp': '朝のルーティン',
            },
            html: `
            <main>
                <ytm-video-with-context-renderer data-case="mobile-english">
                    <ytm-media-item>
                        <a class="media-item-thumbnail-container" href="/watch?v=mweb-en&pp=abc">12:34</a>
                        <div class="media-channel"><a href="/@nihongo" aria-label="Go to channel 日本語チャンネル"></a></div>
                        <h3 class="media-item-headline">
                            <a href="/watch?v=mweb-en&pp=abc" aria-label="Desk setup tour by 日本語チャンネル">Desk setup tour</a>
                        </h3>
                    </ytm-media-item>
                </ytm-video-with-context-renderer>
                <ytm-video-with-context-renderer data-case="mobile-jp">
                    <ytm-media-item>
                        <a class="media-item-thumbnail-container" href="/watch?v=mweb-jp">8:00</a>
                        <h3 class="media-item-headline"><a href="/watch?v=mweb-jp">東京散歩</a></h3>
                    </ytm-media-item>
                </ytm-video-with-context-renderer>
                <ytm-video-with-context-renderer data-case="mobile-original-jp">
                    <ytm-media-item>
                        <a class="media-item-thumbnail-container" href="/watch?v=mweb-original-jp">6:00</a>
                        <h3 class="media-item-headline"><a href="/watch?v=mweb-original-jp">Morning routine</a></h3>
                    </ytm-media-item>
                </ytm-video-with-context-renderer>
            </main>
        `,
        });

        expect(collectYouTubeVideoCards(document).map(element => element.dataset.case)).toEqual(['mobile-english', 'mobile-jp', 'mobile-original-jp']);
        expect(card('mobile-english').classList.contains('jpdb-youtube-filtered')).toBe(true);
        expect(card('mobile-jp').classList.contains('jpdb-youtube-filtered')).toBe(false);
        expect(card('mobile-original-jp').classList.contains('jpdb-youtube-filtered')).toBe(false);

        filter.destroy();
    });

    it('filters mobile shorts lockup cards outside the Shorts watch feed', async () => {
        const { filter } = await startYoutubeFilter({
            oEmbedTitles: { 'short-en': 'Desk setup' },
            html: `
            <main>
                <ytm-shorts-lockup-view-model data-case="mobile-short">
                    <a class="shortsLockupViewModelHostEndpoint reel-item-endpoint" href="/shorts/short-en">
                        <h3 class="shortsLockupViewModelHostMetadataTitle" aria-label="Desk setup, 10K views, Example Channel, 1 day ago - play Short">
                            <span>Desk setup</span>
                        </h3>
                    </a>
                </ytm-shorts-lockup-view-model>
            </main>
        `,
        });

        expect(collectYouTubeVideoCards(document)).toEqual([card('mobile-short')]);
        expect(card('mobile-short').classList.contains('jpdb-youtube-filtered')).toBe(true);

        filter.destroy();
    });

    it('filters individual Shorts cards inside rich shelves instead of hiding the whole shelf', async () => {
        const { filter } = await startYoutubeFilter({
            oEmbedTitles: {
                'shelf-jp': '東京駅で迷子になる',
                'shelf-en': 'Gym routine Short',
            },
            html: `
            <main>
                <ytd-rich-shelf-renderer data-case="shorts-shelf">
                    <ytd-reel-item-renderer data-case="shelf-jp">
                        <a id="video-title" href="/shorts/shelf-jp">東京駅で迷子になる</a>
                    </ytd-reel-item-renderer>
                    <ytd-reel-item-renderer data-case="shelf-en">
                        <a id="video-title" href="/shorts/shelf-en">Gym routine Short</a>
                    </ytd-reel-item-renderer>
                </ytd-rich-shelf-renderer>
            </main>
        `,
        });

        expect(collectYouTubeVideoCards(document).map(element => element.dataset.case)).toEqual(['shelf-jp', 'shelf-en']);
        expect(card('shorts-shelf').classList.contains('jpdb-youtube-filtered')).toBe(false);
        expect(card('shelf-jp').classList.contains('jpdb-youtube-filtered')).toBe(false);
        expect(card('shelf-en').classList.contains('jpdb-youtube-filtered')).toBe(true);

        filter.destroy();
    });

    it('keeps English-titled Japanese learning results visible', async () => {
        const { filter } = await startYoutubeFilter({
            oEmbedTitles: {
                'ci-video': 'Toast - Japanese Comprehensible Input (Complete Beginner)',
                'ci-short': 'Comprehensible Japanese #learnjapanese #nihongo',
                'desk': 'Minimal desk setup tour',
            },
            html: `
            <main>
                <ytd-video-renderer data-case="ci-video">
                    <a id="video-title" href="/watch?v=ci-video">Toast - Japanese Comprehensible Input (Complete Beginner)</a>
                    <a href="/@cijapanese">Comprehensible Japanese</a>
                </ytd-video-renderer>
                <grid-shelf-view-model data-case="shorts-shelf">
                    <h2>Shorts</h2>
                    <ytm-shorts-lockup-view-model data-case="ci-short">
                        <a class="shortsLockupViewModelHostEndpoint" href="/shorts/ci-short">
                            <h3 class="shortsLockupViewModelHostMetadataTitle">Comprehensible Japanese #learnjapanese #nihongo</h3>
                        </a>
                    </ytm-shorts-lockup-view-model>
                    <ytm-shorts-lockup-view-model data-case="desk">
                        <a class="shortsLockupViewModelHostEndpoint" href="/shorts/desk">
                            <h3 class="shortsLockupViewModelHostMetadataTitle">Minimal desk setup tour</h3>
                        </a>
                    </ytm-shorts-lockup-view-model>
                </grid-shelf-view-model>
            </main>
        `,
        });

        expect(card('ci-video').classList.contains('jpdb-youtube-filtered')).toBe(false);
        expect(card('ci-short').classList.contains('jpdb-youtube-filtered')).toBe(false);
        expect(card('desk').classList.contains('jpdb-youtube-filtered')).toBe(true);
        expect(card('shorts-shelf').classList.contains('jpdb-youtube-filtered')).toBe(false);

        filter.destroy();
    });

    it('hides an empty modern Shorts shelf after all child shorts are filtered', async () => {
        const { filter } = await startYoutubeFilter({
            oEmbedTitles: {
                'short-en-1': 'Gym routine Short',
                'short-en-2': 'Desk setup Short',
            },
            html: `
            <main>
                <ytd-reel-shelf-renderer data-case="shorts-shelf">
                    <h2>Shorts</h2>
                    <ytd-reel-item-renderer data-case="short-en-1">
                        <a id="video-title" href="/shorts/short-en-1">Gym routine Short</a>
                    </ytd-reel-item-renderer>
                    <ytd-reel-item-renderer data-case="short-en-2">
                        <a id="video-title" href="/shorts/short-en-2">Desk setup Short</a>
                    </ytd-reel-item-renderer>
                </ytd-reel-shelf-renderer>
            </main>
        `,
        });

        expect(card('short-en-1').classList.contains('jpdb-youtube-filtered')).toBe(true);
        expect(card('short-en-2').classList.contains('jpdb-youtube-filtered')).toBe(true);
        expect(card('shorts-shelf').classList.contains('jpdb-youtube-filtered')).toBe(true);
        expect(card('shorts-shelf').getAttribute('aria-hidden')).toBe('true');

        filter.destroy();
    });

    it('hides the modern grid shelf header when every lockup inside it is filtered', async () => {
        const { filter } = await startYoutubeFilter({
            oEmbedTitles: {
                'grid-short-en-1': 'The fastest way to organize your desk',
                'grid-short-en-2': 'Language learning mistakes',
            },
            html: `
            <main>
                <grid-shelf-view-model data-case="grid-shorts-shelf">
                    <yt-section-header-view-model>
                        <h2>Shorts</h2>
                    </yt-section-header-view-model>
                    <ytm-shorts-lockup-view-model data-case="grid-short-en-1">
                        <a class="shortsLockupViewModelHostEndpoint" href="/shorts/grid-short-en-1">
                            <h3 class="shortsLockupViewModelHostMetadataTitle">The fastest way to organize your desk</h3>
                        </a>
                    </ytm-shorts-lockup-view-model>
                    <ytm-shorts-lockup-view-model data-case="grid-short-en-2">
                        <a class="shortsLockupViewModelHostEndpoint" href="/shorts/grid-short-en-2">
                            <h3 class="shortsLockupViewModelHostMetadataTitle">Language learning mistakes</h3>
                        </a>
                    </ytm-shorts-lockup-view-model>
                </grid-shelf-view-model>
            </main>
        `,
        });

        expect(card('grid-short-en-1').classList.contains('jpdb-youtube-filtered')).toBe(true);
        expect(card('grid-short-en-2').classList.contains('jpdb-youtube-filtered')).toBe(true);
        expect(card('grid-shorts-shelf').classList.contains('jpdb-youtube-filtered')).toBe(true);
        expect(card('grid-shorts-shelf').getAttribute('aria-hidden')).toBe('true');

        filter.destroy();
    });

    it('hides the outer rich-grid slot for nested modern lockup cards', async () => {
        const { filter } = await startYoutubeFilter({
            oEmbedTitles: { modern: '10 habits for studying' },
            html: `
            <main>
                <ytd-rich-grid-row>
                    <div id="contents">
                        <ytd-rich-item-renderer data-case="outer-modern">
                            <yt-lockup-view-model data-case="inner-modern">
                                <a class="ytLockupViewModelContentImage" href="/watch?v=modern">25:39</a>
                                <div class="ytLockupMetadataViewModelMetadata">
                                    <h3 class="ytLockupMetadataViewModelHeadingReset">10 habits for studying</h3>
                                    <a class="ytLockupMetadataViewModelTitle" href="/watch?v=modern">10 habits for studying</a>
                                </div>
                            </yt-lockup-view-model>
                        </ytd-rich-item-renderer>
                    </div>
                </ytd-rich-grid-row>
            </main>
        `,
        });

        expect(collectYouTubeVideoCards(document)).toEqual([card('outer-modern')]);
        expect(card('outer-modern').classList.contains('jpdb-youtube-filtered')).toBe(true);
        expect(card('inner-modern').classList.contains('jpdb-youtube-filtered')).toBe(false);
        expect(document.querySelector('.jpdb-youtube-filter-bar')?.textContent).toContain('hid 1');

        filter.destroy();
    });

    it('does not auto-scroll YouTube continuations when filtering leaves too few visible videos', async () => {
        document.body.innerHTML = `
            <main>
                <ytd-rich-item-renderer data-case="jp">
                    <a id="video-title" href="/watch?v=jp">日本語で花の名前を覚える</a>
                </ytd-rich-item-renderer>
                <ytd-rich-item-renderer data-case="english-1">
                    <a id="video-title" href="/watch?v=en1">10 habits for studying</a>
                </ytd-rich-item-renderer>
                <ytd-rich-item-renderer data-case="english-2">
                    <a id="video-title" href="/watch?v=en2">The best desk setup</a>
                </ytd-rich-item-renderer>
                <ytd-continuation-item-renderer data-case="continuation"></ytd-continuation-item-renderer>
            </main>
        `;
        const continuation = card('continuation') as HTMLElement & { scrollIntoView: (options?: ScrollIntoViewOptions) => void };
        const scrollIntoView = vi.fn();
        continuation.scrollIntoView = scrollIntoView;
        // Place the loader more than one viewport down so the nudge has to
        // scroll (within a viewport it now loads without moving the page).
        Object.defineProperty(continuation, 'getBoundingClientRect', {
            configurable: true,
            value: () => new DOMRect(0, window.innerHeight * 1.5, 400, 80),
        });
        const { filter } = await startYoutubeFilter({
            oEmbedTitles: { jp: '日本語で花の名前を覚える' },
        });

        expect(card('english-1').classList.contains('jpdb-youtube-filtered')).toBe(true);
        expect(card('english-2').classList.contains('jpdb-youtube-filtered')).toBe(true);
        expect(scrollIntoView).not.toHaveBeenCalled();

        filter.destroy();
    });

    it('does not auto-scroll visible mobile YouTube continuations after filtering', async () => {
        document.body.innerHTML = `
            <main>
                <ytm-video-with-context-renderer data-case="mobile-jp">
                    <a class="media-item-headline" href="/watch?v=jp">日本語で花の名前を覚える</a>
                </ytm-video-with-context-renderer>
                <ytm-video-with-context-renderer data-case="mobile-english">
                    <a class="media-item-headline" href="/watch?v=en">The best desk setup</a>
                </ytm-video-with-context-renderer>
                <ytm-continuation-item-renderer data-case="continuation"></ytm-continuation-item-renderer>
            </main>
        `;
        const continuation = card('continuation') as HTMLElement & { scrollIntoView: (options?: ScrollIntoViewOptions) => void };
        const scrollIntoView = vi.fn();
        continuation.scrollIntoView = scrollIntoView;
        Object.defineProperty(continuation, 'getBoundingClientRect', {
            configurable: true,
            value: () => new DOMRect(0, window.innerHeight - 80, 390, 80),
        });
        const { filter } = await startYoutubeFilter({
            oEmbedTitles: { jp: '日本語で花の名前を覚える' },
        });

        expect(card('mobile-english').classList.contains('jpdb-youtube-filtered')).toBe(true);
        expect(scrollIntoView).not.toHaveBeenCalled();

        filter.destroy();
    });

    it('marks newly appended visible videos pending without blanking them before the delayed filter scan', async () => {
        const { filter } = await startYoutubeFilter({
            html: '<main></main>',
            oEmbedTitles: {},
            wait: 'none',
        });

        document.querySelector('main')!.insertAdjacentHTML('beforeend', `
            <ytd-rich-item-renderer data-case="late-english">
                <a id="video-title" href="/watch?v=late-en">Desk setup tour</a>
            </ytd-rich-item-renderer>
        `);
        await settlePromises();

        expect(card('late-english').classList.contains('jpdb-youtube-filter-pending')).toBe(true);
        expect(card('late-english').dataset.yomuYoutubePendingHidden).toBeUndefined();
        expect(card('late-english').classList.contains('jpdb-youtube-filtered')).toBe(false);

        await vi.advanceTimersByTimeAsync(90);
        await settlePromises();

        expect(card('late-english').classList.contains('jpdb-youtube-filter-pending')).toBe(false);
        expect(card('late-english').classList.contains('jpdb-youtube-filtered')).toBe(true);
        expect(card('late-english').classList.contains('jpdb-youtube-filter-collapsed')).toBe(false);

        await vi.advanceTimersByTimeAsync(320);

        expect(card('late-english').classList.contains('jpdb-youtube-filter-collapsed')).toBe(true);

        filter.destroy();
    });

    it('may hide newly appended pending videos that are far outside the viewport', async () => {
        const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function mockRect(this: HTMLElement) {
            if (this.dataset.case === 'late-offscreen') {
                return { left: 0, right: 320, top: 3000, bottom: 3240, width: 320, height: 240, x: 0, y: 3000, toJSON: () => ({}) } as DOMRect;
            }
            return { left: 0, right: 320, top: 0, bottom: 240, width: 320, height: 240, x: 0, y: 0, toJSON: () => ({}) } as DOMRect;
        });
        const { filter } = await startYoutubeFilter({
            html: '<main></main>',
            oEmbedTitles: {},
            wait: 'none',
        });

        try {
            document.querySelector('main')!.insertAdjacentHTML('beforeend', `
                <ytd-rich-item-renderer data-case="late-offscreen">
                    <a id="video-title" href="/watch?v=late-offscreen">Desk setup tour</a>
                </ytd-rich-item-renderer>
            `);
            await settlePromises();

            expect(card('late-offscreen').classList.contains('jpdb-youtube-filter-pending')).toBe(true);
            expect(card('late-offscreen').dataset.yomuYoutubePendingHidden).toBe('true');
        } finally {
            filter.destroy();
            rectSpy.mockRestore();
        }
    });

    it('keeps filtered videos as spacers while scrolling is still active', async () => {
        const { filter } = await startYoutubeFilter({
            html: '<main></main>',
            oEmbedTitles: {},
            wait: 'none',
        });

        window.dispatchEvent(new Event('scroll'));
        document.querySelector('main')!.insertAdjacentHTML('beforeend', `
            <ytd-rich-item-renderer data-case="scroll-english">
                <a id="video-title" href="/watch?v=scroll-en">Desk setup tour</a>
            </ytd-rich-item-renderer>
        `);
        await settlePromises();
        await vi.advanceTimersByTimeAsync(90);
        await settlePromises();

        expect(card('scroll-english').classList.contains('jpdb-youtube-filtered')).toBe(true);

        await vi.advanceTimersByTimeAsync(600);

        expect(card('scroll-english').classList.contains('jpdb-youtube-filter-collapsed')).toBe(false);

        await vi.advanceTimersByTimeAsync(320);

        expect(card('scroll-english').classList.contains('jpdb-youtube-filter-collapsed')).toBe(true);

        filter.destroy();
    });

    it('hides playlist and mix tiles instead of leaving them in the filtered feed', async () => {
        const { filter } = await startYoutubeFilter({
            oEmbedTitles: { 'playlist-jp': '東京を散歩する' },
            html: `
            <main>
                <ytd-rich-item-renderer data-case="jp">
                    <a id="video-title" href="/watch?v=playlist-jp">東京を散歩する</a>
                </ytd-rich-item-renderer>
                <ytd-playlist-renderer data-case="playlist">
                    <a id="video-title" href="/playlist?list=PL123">日本語の再生リスト</a>
                </ytd-playlist-renderer>
                <yt-lockup-view-model data-case="mix-lockup">
                    <a class="ytLockupViewModelContentImage" href="/watch?v=mix&list=RDmix">Mix</a>
                    <span class="badge-shape-wiz__text">Mix</span>
                    <h3 class="ytLockupMetadataViewModelHeadingReset">作業用BGM</h3>
                </yt-lockup-view-model>
            </main>
        `,
        });

        expect(card('jp').classList.contains('jpdb-youtube-filtered')).toBe(false);
        expect(card('playlist').classList.contains('jpdb-youtube-filtered')).toBe(true);
        expect(card('mix-lockup').classList.contains('jpdb-youtube-filtered')).toBe(true);
        expect(document.querySelector('.jpdb-youtube-filter-bar')?.textContent).toContain('hid 2');

        filter.destroy();
    });

    it('keeps normal videos visible when their title aria-label contains mix', async () => {
        const { filter } = await startYoutubeFilter({
            oEmbedTitles: { music: '東京で Lo-fi mix を聴く' },
            html: `
            <main>
                <ytd-rich-item-renderer data-case="music">
                    <a id="video-title" href="/watch?v=music" aria-label="東京で Lo-fi mix を聴く">東京で Lo-fi mix を聴く</a>
                </ytd-rich-item-renderer>
            </main>
        `,
        });

        expect(collectYouTubeVideoCards(document)).toEqual([card('music')]);
        expect(card('music').classList.contains('jpdb-youtube-filtered')).toBe(false);
        expect(document.querySelector('.jpdb-youtube-filter-bar')).toBeNull();

        filter.destroy();
    });

    it('keeps Japanese-looking translated titles visible while original title lookup is pending', async () => {
        const translated = deferred<{ ok: boolean; json: () => Promise<{ title: string }> }>();
        const fetchMock = vi.fn(async (input: string | URL | Request) => {
            const url = new URL(String(input));
            const watchUrl = new URL(url.searchParams.get('url') ?? 'https://www.youtube.com/watch');
            const videoId = watchUrl.searchParams.get('v') ?? '';
            if (videoId === 'translated') return translated.promise;
            const titles: Record<string, string> = {
                jp: '日本語で花の名前を覚える',
                en: '10 habits for studying',
                channel: 'study with me',
                modern: '東京カフェで朝ごはん',
            };
            return {
                ok: true,
                json: async () => ({ title: titles[videoId] ?? '' }),
            };
        });
        vi.stubGlobal('fetch', fetchMock);
        renderYouTubeCards();
        const { filter } = await startYoutubeFilter({ wait: 'none' });

        await flushPendingFilterWork();

        expect(card('english').classList.contains('jpdb-youtube-filtered')).toBe(true);
        expect(card('channel-only').classList.contains('jpdb-youtube-filtered')).toBe(true);
        expect(card('translated-english').classList.contains('jpdb-youtube-filtered')).toBe(false);
        expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(5);

        translated.resolve({
            ok: true,
            json: async () => ({ title: '37,000 Lines of Slop' }),
        });
        await flushPendingFilterWork();

        expect(card('translated-english').classList.contains('jpdb-youtube-filtered')).toBe(true);

        filter.destroy();
    });

    it('hides non-Japanese-looking cards using original YouTube titles and supports reveal controls', async () => {
        renderYouTubeCards();
        const scheduleAnnotationLayoutRefresh = vi.fn();
        const { filter, settings } = await startYoutubeFilter({
            oEmbedTitles: {
                jp: '日本語で花の名前を覚える',
                en: '10 habits for studying',
                channel: 'study with me',
                translated: '37,000 Lines of Slop',
                modern: '東京カフェで朝ごはん',
            },
            filterOptions: { scheduleAnnotationLayoutRefresh },
        });

        expect(card('jp').classList.contains('jpdb-youtube-filtered')).toBe(false);
        expect(card('english').classList.contains('jpdb-youtube-filtered')).toBe(true);
        expect(card('channel-only').classList.contains('jpdb-youtube-filtered')).toBe(true);
        expect(card('translated-english').classList.contains('jpdb-youtube-filtered')).toBe(true);
        expect(card('modern-lockup').classList.contains('jpdb-youtube-filtered')).toBe(false);
        const bar = document.querySelector<HTMLElement>('.jpdb-youtube-filter-bar')!;
        expect(bar.getAttribute('aria-label')).toContain('hid 3');
        expect(bar.querySelector<HTMLElement>('[data-role="summary"]')?.classList.contains('jpdb-reader-sr-only')).toBe(true);
        expect(Array.from(bar.querySelectorAll('button')).map(button => button.textContent)).toEqual([
            'Show hidden videos',
            'Hide notice',
        ]);
        const refreshesAfterInitialFilter = scheduleAnnotationLayoutRefresh.mock.calls.length;
        expect(refreshesAfterInitialFilter).toBeGreaterThan(0);

        document.querySelector<HTMLButtonElement>('[data-action="toggle-hidden"]')!.click();
        await vi.advanceTimersByTimeAsync(0);

        expect(card('english').classList.contains('jpdb-youtube-filtered')).toBe(false);
        expect(scheduleAnnotationLayoutRefresh.mock.calls.length).toBeGreaterThan(refreshesAfterInitialFilter);
        expect(document.querySelector<HTMLElement>('.jpdb-youtube-filter-bar')?.getAttribute('aria-label')).toContain('shows 3');
        expect(document.querySelector('.jpdb-youtube-filter-bar [data-action="toggle-hidden"]')?.textContent).toBe('Hide hidden videos');

        document.querySelector<HTMLButtonElement>('[data-action="toggle-hidden"]')!.click();
        await vi.advanceTimersByTimeAsync(0);

        expect(card('english').classList.contains('jpdb-youtube-filtered')).toBe(true);

        document.querySelector<HTMLButtonElement>('[data-action="hide-notice"]')!.click();
        await vi.advanceTimersByTimeAsync(0);

        expect(settings.youtubeImmersionEnabled).toBe(true);
        // 2026-07-11: "Hide notice" is a session dismissal — it must never
        // silently persist the notice off (the settings dialog owns that).
        expect(settings.youtubeShowFilterNotice).toBe(true);
        expect(card('english').classList.contains('jpdb-youtube-filtered')).toBe(true);
        expect(document.querySelector('.jpdb-youtube-filter-bar')).toBeNull();

        filter.destroy();
    });

    it('renders channel suggestions as an inline YouTube-style shelf instead of a popup card panel', async () => {
        expect(YOUTUBE_CHANNEL_RECOMMENDATION_COUNT).toBe(99);
        renderYouTubeCards();
        const { filter } = await startYoutubeFilter({
            location: YOUTUBE_RESULTS_LOCATION,
            oEmbedTitles: {
                jp: '日本語で花の名前を覚える',
                en: '10 habits for studying',
                channel: 'study with me',
                translated: '37,000 Lines of Slop',
                modern: '東京カフェで朝ごはん',
            },
        });

        const shelf = document.querySelector<HTMLElement>('.jpdb-youtube-channel-shelf')!;
        expect(shelf).not.toBeNull();
        expect(shelf.parentElement?.tagName.toLowerCase()).toBe('main');
        expect(shelf.textContent).toContain('Start your Japanese YouTube feed');
        expect(shelf.textContent).toContain(`${YOUTUBE_CHANNEL_RECOMMENDATION_COUNT} curated channels`);
        expect(shelf.querySelectorAll('.jpdb-youtube-channel-row')).toHaveLength(8);
        expect(document.querySelector('.jpdb-youtube-channel-guide')).toBeNull();
        expect(shelf.querySelector<HTMLElement>('[aria-live="polite"]')?.textContent).toBe('');
        expect(shelf.textContent).not.toContain('Previews load from YouTube on this page.');
        expect(shelf.textContent).not.toContain('Dismiss');
        expect(shelf.textContent).toContain('Hide');

        shelf.querySelector<HTMLButtonElement>('[data-yomu-youtube-channel-action="expand"]')!.click();
        await vi.advanceTimersByTimeAsync(0);
        await settlePromises();

        const expanded = document.querySelector<HTMLElement>('.jpdb-youtube-channel-shelf')!;
        expect(expanded.classList.contains('is-expanded')).toBe(true);
        expect(expanded.querySelectorAll('.jpdb-youtube-channel-row')).toHaveLength(YOUTUBE_CHANNEL_RECOMMENDATION_COUNT);
        expect(expanded.textContent).toContain('にほんごのじかん');

        expanded.querySelector<HTMLButtonElement>('[data-yomu-youtube-channel-action="filter"][data-filter="kids"]')!.click();
        await vi.advanceTimersByTimeAsync(0);
        await settlePromises();

        const filtered = document.querySelector<HTMLElement>('.jpdb-youtube-channel-shelf')!;
        expect(filtered.textContent).toContain('しまじろうチャンネル');
        expect(filtered.querySelector<HTMLButtonElement>('[data-filter="kids"]')?.getAttribute('aria-pressed')).toBe('true');

        filter.destroy();
    });

    it('localizes channel suggestion shelf chrome in Japanese', async () => {
        expect(YOUTUBE_CHANNEL_RECOMMENDATION_COUNT).toBe(99);
        renderYouTubeCards();
        const { filter } = await startYoutubeFilter({
            location: YOUTUBE_RESULTS_LOCATION,
            settings: youtubeFilterSettings({ interfaceLanguage: 'ja' }),
            oEmbedTitles: {
                jp: '日本語で花の名前を覚える',
                en: '10 habits for studying',
                channel: 'study with me',
                translated: '37,000 Lines of Slop',
                modern: '東京カフェで朝ごはん',
            },
        });

        const shelf = document.querySelector<HTMLElement>('.jpdb-youtube-channel-shelf')!;
        expect(shelf.textContent).toContain('日本語YouTubeを始める');
        expect(shelf.textContent).toContain(`厳選${YOUTUBE_CHANNEL_RECOMMENDATION_COUNT}件`);
        expect(shelf.textContent).toContain('表示中を登録(8)');
        expect(shelf.textContent).toContain(`全${YOUTUBE_CHANNEL_RECOMMENDATION_COUNT}件登録`);
        expect(shelf.querySelector<HTMLButtonElement>('[data-yomu-youtube-channel-action="subscribe-one"]')?.textContent).toBe('登録');
        expect(shelf.getAttribute('aria-label')).toBe('日本語チャンネル');

        filter.destroy();
    });

    it('does not show the channel suggestion shelf on the YouTube home feed', async () => {
        renderYouTubeCards();
        const { filter } = await startYoutubeFilter({
            location: {
                href: 'https://www.youtube.com/',
                origin: 'https://www.youtube.com',
                hostname: 'www.youtube.com',
                pathname: '/',
                search: '',
            },
            oEmbedTitles: {
                jp: '日本語で花の名前を覚える',
                en: '10 habits for studying',
                channel: 'study with me',
                translated: '37,000 Lines of Slop',
                modern: '東京カフェで朝ごはん',
            },
        });

        expect(document.querySelector('.jpdb-youtube-channel-shelf')).toBeNull();
        expect(document.body.textContent).not.toContain('Subscribe visible');

        filter.destroy();
    });

    it('keeps channel shelf rows stable on a no-op refresh', async () => {
        renderYouTubeCards();
        const { filter } = await startYoutubeFilter({
            location: YOUTUBE_RESULTS_LOCATION,
            oEmbedTitles: {
                jp: '日本語で花の名前を覚える',
                en: '10 habits for studying',
                channel: 'study with me',
                translated: '37,000 Lines of Slop',
                modern: '東京カフェで朝ごはん',
            },
        });

        const shelf = document.querySelector<HTMLElement>('.jpdb-youtube-channel-shelf')!;
        const list = shelf.querySelector<HTMLElement>('[data-role="channel-list"]')!;
        const firstRow = list.querySelector<HTMLElement>('.jpdb-youtube-channel-row')!;
        const secondRow = list.querySelectorAll<HTMLElement>('.jpdb-youtube-channel-row')[1]!;
        const actions = shelf.querySelector<HTMLElement>('.jpdb-youtube-channel-shelf-actions')!;
        const subscribeVisible = shelf.querySelector<HTMLButtonElement>('[data-yomu-youtube-channel-action="subscribe-visible"]')!;
        filter.refresh();
        await vi.advanceTimersByTimeAsync(0);
        await settlePromises();

        expect(document.querySelector<HTMLElement>('.jpdb-youtube-channel-shelf')).toBe(shelf);
        expect(shelf.querySelector<HTMLElement>('[data-role="channel-list"]')).toBe(list);
        expect(list.querySelector<HTMLElement>('.jpdb-youtube-channel-row')).toBe(firstRow);
        expect(shelf.querySelector<HTMLElement>('.jpdb-youtube-channel-shelf-actions')).toBe(actions);
        expect(shelf.querySelector<HTMLButtonElement>('[data-yomu-youtube-channel-action="subscribe-visible"]')).toBe(subscribeVisible);

        const firstHandle = firstRow.dataset.yomuChannelHandle!;
        const firstChannel = allYouTubeChannelRecommendations().find(channel => channel.handle === firstHandle)!;
        const internals = filter as unknown as {
            channelPreviewCache: Map<string, unknown>;
            updateRenderedChannelPreview(channel: unknown): void;
        };
        internals.channelPreviewCache.set(firstHandle, {
            channelId: 'UC12345678901234567890',
            title: 'Hydrated Stable Row',
            avatarUrl: 'https://yt.example/stable-row.jpg',
            subscriberText: '123K subscribers',
            description: 'Hydrated YouTube preview text',
            subscribed: false,
        });
        internals.updateRenderedChannelPreview(firstChannel);
        filter.refresh();
        await vi.advanceTimersByTimeAsync(0);
        await settlePromises();

        const hydratedFirstRow = list.querySelector<HTMLElement>('.jpdb-youtube-channel-row')!;
        expect(document.querySelector<HTMLElement>('.jpdb-youtube-channel-shelf')).toBe(shelf);
        expect(shelf.querySelector<HTMLElement>('[data-role="channel-list"]')).toBe(list);
        expect(shelf.querySelector<HTMLElement>('.jpdb-youtube-channel-shelf-actions')).toBe(actions);
        expect(shelf.querySelector<HTMLButtonElement>('[data-yomu-youtube-channel-action="subscribe-visible"]')).toBe(subscribeVisible);
        expect(hydratedFirstRow).not.toBe(firstRow);
        expect(hydratedFirstRow.textContent).toContain('Hydrated Stable Row');
        expect(list.querySelectorAll<HTMLElement>('.jpdb-youtube-channel-row')[1]).toBe(secondRow);

        filter.destroy();
    });

    it('does not render channel suggestion rows from failed preview checks', async () => {
        vi.stubGlobal('ytcfg', {
            get: (key: string) => ({
                INNERTUBE_API_KEY: 'test-key',
                INNERTUBE_CONTEXT: { client: { clientName: 'WEB', clientVersion: 'test-version' } },
                INNERTUBE_CLIENT_NAME: '1',
                INNERTUBE_CLIENT_VERSION: 'test-version',
                VISITOR_DATA: 'visitor',
            } as Record<string, unknown>)[key],
        });
        vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
            const url = input instanceof Request ? input.url : String(input);
            if (url.includes('/oembed')) {
                const watchUrl = new URL(new URL(url).searchParams.get('url') ?? 'https://www.youtube.com/watch');
                const videoId = watchUrl.searchParams.get('v') ?? '';
                return jsonFetchResponse({ title: videoId === 'jp' || videoId === 'modern' ? '東京カフェで朝ごはん' : 'Desk setup tour' });
            }
            if (url.includes('/youtubei/v1/navigation/resolve_url')) {
                return jsonFetchResponse({ endpoint: { browseEndpoint: { browseId: 'UC12345678901234567890' } } });
            }
            return jsonFetchResponse({}, 503);
        }));
        renderYouTubeCards();
        const { filter } = await startYoutubeFilter({ location: YOUTUBE_RESULTS_LOCATION, wait: 'flush-work' });
        await waitForChannelShelfCondition(() => !document.querySelector('.jpdb-youtube-channel-shelf'));

        expect(document.querySelector('.jpdb-youtube-channel-shelf')).toBeNull();
        expect(document.body.textContent).not.toContain('Subscribe visible');

        filter.destroy();
    }, CHANNEL_SHELF_TEST_TIMEOUT_MS);

    it('keeps channel suggestion descriptions shortened after preview hydration', async () => {
        const longPreviewDescription = 'Actual YouTube channel bio with several lines of profile copy that should never replace the compact recommendation summary.';
        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/',
            origin: 'https://www.youtube.com',
            hostname: 'www.youtube.com',
            pathname: '/',
            search: '',
        });
        vi.stubGlobal('ytcfg', {
            get: (key: string) => ({
                INNERTUBE_API_KEY: 'test-key',
                INNERTUBE_CONTEXT: { client: { clientName: 'WEB', clientVersion: 'test-version' } },
                INNERTUBE_CLIENT_NAME: '1',
                INNERTUBE_CLIENT_VERSION: 'test-version',
                VISITOR_DATA: 'visitor',
            } as Record<string, unknown>)[key],
        });
        vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
            const url = input instanceof Request ? input.url : String(input);
            if (url.includes('/oembed')) {
                const watchUrl = new URL(new URL(url).searchParams.get('url') ?? 'https://www.youtube.com/watch');
                const videoId = watchUrl.searchParams.get('v') ?? '';
                return {
                    ok: true,
                    json: async () => ({ title: videoId === 'jp' || videoId === 'modern' ? '東京カフェで朝ごはん' : 'Desk setup tour' }),
                };
            }
            if (url.includes('/youtubei/v1/navigation/resolve_url')) {
                return {
                    ok: true,
                    json: async () => ({ endpoint: { browseEndpoint: { browseId: 'UC12345678901234567890' } } }),
                };
            }
            if (url.includes('/youtubei/v1/browse')) {
                return {
                    ok: true,
                    json: async () => ({
                        metadata: {
                            channelMetadataRenderer: {
                                title: 'Hydrated Preview Channel',
                                description: longPreviewDescription,
                                avatar: { thumbnails: [{ url: 'https://yt.example/avatar.jpg', width: 88 }] },
                            },
                        },
                        ...channelSubscriptionStateData('UC12345678901234567890', false),
                    }),
                };
            }
            return { ok: false, json: async () => ({}) };
        }));

        renderYouTubeCards();
        const { filter } = await startYoutubeFilter({ location: YOUTUBE_RESULTS_LOCATION, wait: 'flush-work' });
        for (let i = 0; i < 30 && !document.querySelector('.jpdb-youtube-channel-name')?.textContent?.includes('Hydrated Preview Channel'); i += 1) {
            await flushPendingFilterWork();
        }

        const row = Array.from(document.querySelectorAll<HTMLElement>('.jpdb-youtube-channel-row'))
            .find(candidate => candidate.querySelector('.jpdb-youtube-channel-name')?.textContent?.trim() === 'Hydrated Preview Channel');
        expect(row).not.toBeUndefined();
        const channel = allYouTubeChannelRecommendations().find(candidate => candidate.handle === row!.dataset.yomuChannelHandle);
        expect(channel).not.toBeUndefined();
        const description = row!.querySelector<HTMLElement>('.jpdb-youtube-channel-description')?.textContent?.trim();

        expect(description).toBe(youtubeChannelRecommendationDescription(channel!));
        expect(description).not.toBe(longPreviewDescription);
        expect(description).toMatch(/videos around N[1-5]/u);

        filter.destroy();
    });

    it('removes channels already subscribed in YouTube current subscribeButtonViewModel payloads', async () => {
        stubYouTubeChannelPreviewFetch(new Set(['@SuitTravel']));
        vi.stubGlobal('location', YOUTUBE_RESULTS_LOCATION);
        renderYouTubeCards();
        const { filter } = await startYoutubeFilter({ wait: 'flush-work' });
        await waitForChannelShelfCondition(shelf => Boolean(shelf?.querySelector('.jpdb-youtube-channel-row')));

        document.querySelector<HTMLButtonElement>('[data-yomu-youtube-channel-action="expand"]')!.click();
        await waitForChannelShelfCondition(shelf => {
            const handles = channelShelfRowHandles(shelf);
            return handles.length >= 99 && handles.includes('@oi_ken') && !handles.includes('@SuitTravel');
        });

        const handles = channelShelfRowHandles();
        expect(handles).not.toContain('@SuitTravel');
        expect(handles).toContain('@oi_ken');
        expect(document.querySelector<HTMLElement>('.jpdb-youtube-channel-shelf')?.textContent)
            .toContain(`${YOUTUBE_CHANNEL_RECOMMENDATION_COUNT - 1} shown from ${YOUTUBE_CHANNEL_RECOMMENDATION_COUNT} curated channels.`);

        filter.destroy();
    }, CHANNEL_SHELF_TEST_TIMEOUT_MS);

    it('keeps removing subscribed channels past the first expanded preview batch', async () => {
        const subscribedHandle = '@meicari';
        stubYouTubeChannelPreviewFetch(new Set([subscribedHandle]));
        vi.stubGlobal('location', YOUTUBE_RESULTS_LOCATION);
        renderYouTubeCards();
        const { filter } = await startYoutubeFilter({ wait: 'flush-work' });
        await waitForChannelShelfCondition(shelf => Boolean(shelf?.querySelector('.jpdb-youtube-channel-row')));

        document.querySelector<HTMLButtonElement>('[data-yomu-youtube-channel-action="expand"]')!.click();
        await waitForChannelShelfCondition(shelf => {
            const handles = channelShelfRowHandles(shelf);
            return handles.length >= 99 && !handles.includes(subscribedHandle);
        });

        for (let i = 0; i < 40 && document.querySelector<HTMLElement>(`[data-yomu-channel-handle="${subscribedHandle}"]`); i += 1) {
            await vi.advanceTimersByTimeAsync(250);
            await flushPendingFilterWork();
        }

        const handles = channelShelfRowHandles();
        expect(handles).not.toContain(subscribedHandle);
        expect(document.querySelector<HTMLElement>('.jpdb-youtube-channel-shelf')?.textContent)
            .toContain(`${YOUTUBE_CHANNEL_RECOMMENDATION_COUNT - 1} shown from ${YOUTUBE_CHANNEL_RECOMMENDATION_COUNT} curated channels.`);

        filter.destroy();
    }, CHANNEL_SHELF_TEST_TIMEOUT_MS);

    it('keeps the channel shelf hidden when live previews show all curated channels are already subscribed', async () => {
        stubYouTubeChannelPreviewFetch(new Set(allYouTubeChannelRecommendations().map(channel => channel.handle)));
        vi.stubGlobal('location', YOUTUBE_RESULTS_LOCATION);
        renderYouTubeCards();
        const { filter } = await startYoutubeFilter({ wait: 'flush-work' });

        const allSubscribedFlag = (): string | undefined =>
            gmStorageGetSync<{ signature?: string } | null>('yomu:youtube-all-subscribed:v1', null)?.signature;
        await waitForChannelShelfCondition(() =>
            allSubscribedFlag() === youTubeChannelListSignature()
            && !document.querySelector('.jpdb-youtube-channel-shelf')
            && !document.querySelector('.jpdb-youtube-channel-shelf-list'), 320);

        expect(allSubscribedFlag()).toBe(youTubeChannelListSignature());
        expect(document.querySelector('.jpdb-youtube-channel-shelf')).toBeNull();
        expect(document.querySelector('.jpdb-youtube-channel-shelf-list')).toBeNull();
        expect(document.body.textContent).not.toContain('Subscribe visible');
        expect(document.body.textContent).not.toContain('Previews load from YouTube on this page.');

        filter.destroy();
    }, CHANNEL_SHELF_TEST_TIMEOUT_MS);

    it('does not render subscribe rows from preview metadata without current subscription state', async () => {
        const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
            const url = input instanceof Request ? input.url : String(input);
            if (url.includes('/oembed')) {
                const watchUrl = new URL(new URL(url).searchParams.get('url') ?? 'https://www.youtube.com/watch');
                const videoId = watchUrl.searchParams.get('v') ?? '';
                return jsonFetchResponse({ title: videoId === 'jp' || videoId === 'modern' ? '東京カフェで朝ごはん' : 'Desk setup tour' });
            }
            if (url.includes('/youtubei/v1/navigation/resolve_url')) {
                return jsonFetchResponse({ endpoint: { browseEndpoint: { browseId: 'UC12345678901234567890' } } });
            }
            if (url.includes('/youtubei/v1/browse')) {
                const body = JSON.parse(String(init?.body ?? '{}')) as { browseId?: string };
                return jsonFetchResponse({
                    metadata: {
                        channelMetadataRenderer: {
                            title: 'Preview without state',
                            description: 'Metadata alone does not identify subscription state.',
                            avatar: { thumbnails: [{ url: `https://yt.example/${body.browseId ?? 'missing'}.jpg`, width: 88 }] },
                        },
                    },
                });
            }
            return jsonFetchResponse({}, 404);
        });
        vi.stubGlobal('ytcfg', {
            get: (key: string) => ({
                INNERTUBE_API_KEY: 'test-key',
                INNERTUBE_CONTEXT: { client: { clientName: 'WEB', clientVersion: 'test-version' } },
                INNERTUBE_CLIENT_NAME: '1',
                INNERTUBE_CLIENT_VERSION: 'test-version',
                VISITOR_DATA: 'visitor',
            } as Record<string, unknown>)[key],
        });
        vi.stubGlobal('fetch', fetchMock);
        vi.stubGlobal('location', YOUTUBE_RESULTS_LOCATION);
        renderYouTubeCards();
        const { filter } = await startYoutubeFilter({ wait: 'flush-work' });
        await waitForChannelShelfCondition(() =>
            fetchMock.mock.calls.some(call => String(call[0]).includes('/youtubei/v1/browse'))
            && !document.querySelector('.jpdb-youtube-channel-shelf'), 80);

        expect(fetchMock.mock.calls.some(call => String(call[0]).includes('/youtubei/v1/browse'))).toBe(true);
        expect(document.querySelector('.jpdb-youtube-channel-shelf')).toBeNull();
        expect(document.body.textContent).not.toContain('Subscribe visible');

        filter.destroy();
    }, CHANNEL_SHELF_TEST_TIMEOUT_MS);

    it('hides the channel shelf when every curated channel is already subscribed', async () => {
        renderYouTubeCards();
        const { filter } = await startYoutubeFilter({
            oEmbedTitles: {
                jp: '日本語で花の名前を覚える',
                en: '10 habits for studying',
                channel: 'study with me',
                translated: '37,000 Lines of Slop',
                modern: '東京カフェで朝ごはん',
            },
        });

        // Simulate every curated channel being subscribed already.
        const handles = allYouTubeChannelRecommendations().map(channel => channel.handle);
        const subscribed = (filter as unknown as { subscribedChannelHandles: Set<string> }).subscribedChannelHandles;
        handles.forEach(handle => subscribed.add(handle));
        filter.refresh();
        await waitForChannelShelfCondition(() => !document.querySelector('.jpdb-youtube-channel-shelf'));

        expect(document.querySelector('.jpdb-youtube-channel-shelf')).toBeNull();

        filter.destroy();
    }, CHANNEL_SHELF_TEST_TIMEOUT_MS);

    it('lets users hide channel suggestions permanently', async () => {
        const settings = youtubeFilterSettings();
        renderYouTubeCards();
        const { filter } = await startYoutubeFilter({
            location: YOUTUBE_RESULTS_LOCATION,
            settings,
            filterOptions: {
                setShowChannelRecommendations: visible => {
                    settings.youtubeShowChannelRecommendations = visible;
                },
            },
            oEmbedTitles: {
                jp: '日本語で花の名前を覚える',
                en: '10 habits for studying',
                channel: 'study with me',
                translated: '37,000 Lines of Slop',
                modern: '東京カフェで朝ごはん',
            },
        });

        expect(document.querySelector('.jpdb-youtube-channel-shelf')).not.toBeNull();
        expect(document.querySelector('.jpdb-youtube-channel-shelf')?.textContent).not.toContain('Dismiss');

        document.querySelector<HTMLButtonElement>('[data-yomu-youtube-channel-action="never"]')!.click();
        // Wait for the invariant, not a proxy for it. The shelf disappearing and
        // the preference being written are two separate steps, so waiting only on
        // the DOM left the assertion below racing the save.
        await waitForChannelShelfCondition(() => !document.querySelector('.jpdb-youtube-channel-shelf')
            && settings.youtubeShowChannelRecommendations === false);

        expect(settings.youtubeShowChannelRecommendations).toBe(false);
        expect(document.querySelector('.jpdb-youtube-channel-shelf')).toBeNull();

        filter.refresh();
        await waitForChannelShelfCondition(() => !document.querySelector('.jpdb-youtube-channel-shelf'));

        expect(document.querySelector('.jpdb-youtube-channel-shelf')).toBeNull();

        filter.destroy();
    }, CHANNEL_SHELF_TEST_TIMEOUT_MS);

    it('subscribes to all recommended channels through the current YouTube page session', async () => {
        const subscriptionBodies: unknown[] = [];
        const subscriptionHeaders: Array<Record<string, string>> = [];
        document.cookie = 'SAPISID=test-sapisid';
        vi.stubGlobal('location', YOUTUBE_RESULTS_LOCATION);
        vi.stubGlobal('ytcfg', {
            get: (key: string) => ({
                INNERTUBE_API_KEY: 'test-key',
                INNERTUBE_CONTEXT: { client: { clientName: 'WEB', clientVersion: 'test-version' } },
                INNERTUBE_CLIENT_NAME: '1',
                INNERTUBE_CLIENT_VERSION: 'test-version',
                VISITOR_DATA: 'visitor',
            } as Record<string, unknown>)[key],
        });
        vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
            const url = input instanceof Request ? input.url : String(input);
            if (url.includes('/oembed')) {
                const watchUrl = new URL(new URL(url).searchParams.get('url') ?? 'https://www.youtube.com/watch');
                const videoId = watchUrl.searchParams.get('v') ?? '';
                return {
                    ok: true,
                    json: async () => ({ title: videoId === 'jp' || videoId === 'modern' ? '東京カフェで朝ごはん' : 'Desk setup tour' }),
                };
            }
            if (url.includes('/youtubei/v1/navigation/resolve_url')) {
                return {
                    ok: true,
                    json: async () => ({ endpoint: { browseEndpoint: { browseId: 'UC12345678901234567890' } } }),
                };
            }
            if (url.includes('/youtubei/v1/browse')) {
                return {
                    ok: true,
                    json: async () => ({
                        metadata: {
                            channelMetadataRenderer: {
                                title: 'Preview channel',
                                description: 'Real YouTube preview',
                                avatar: { thumbnails: [{ url: 'https://yt.example/avatar.jpg', width: 88 }] },
                            },
                        },
                        ...channelSubscriptionStateData('UC12345678901234567890', false),
                    }),
                };
            }
            if (url.includes('/youtubei/v1/subscription/subscribe')) {
                subscriptionBodies.push(JSON.parse(String(init?.body ?? '{}')));
                subscriptionHeaders.push({ ...(init?.headers as Record<string, string>) });
                return { ok: true, json: async () => ({}) };
            }
            return { ok: false, json: async () => ({}) };
        }));
        renderYouTubeCards();
        const { filter } = await startYoutubeFilter({ wait: 'flush-work' });

        try {
            document.querySelector<HTMLButtonElement>('[data-yomu-youtube-channel-action="subscribe-all"]')!.click();
            await flushPendingFilterWork();
            // The SAPISIDHASH digest adds real-async hops, so poll until the
            // run completes instead of assuming a fixed number of microtask turns.
            await waitForChannelSubscriptionResult(subscriptionBodies);
            await settlePromises();

            expect(subscriptionBodies).toHaveLength(YOUTUBE_CHANNEL_RECOMMENDATION_COUNT);
            expect(subscriptionBodies[0]).toMatchObject({
                channelIds: ['UC12345678901234567890'],
                context: { client: { clientName: 'WEB', clientVersion: 'test-version' } },
            });
            expect(document.querySelector<HTMLElement>('[data-role="channel-status"]')?.textContent).toBe(`Subscribed to ${YOUTUBE_CHANNEL_RECOMMENDATION_COUNT} channels.`);
            // The subscribe write must carry the signed-in SAPISIDHASH
            // authorization; without it YouTube applies the call to the anonymous
            // visitor session and the account is never actually subscribed.
            expect(subscriptionHeaders[0]?.Authorization).toMatch(/^SAPISIDHASH \d+_[0-9a-f]{40}$/);
            expect(subscriptionHeaders[0]?.['X-Origin']).toBe('https://www.youtube.com');
            expect(subscriptionHeaders[0]?.['X-Goog-AuthUser']).toBe('0');
        } finally {
            document.cookie = 'SAPISID=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
            filter.destroy();
        }
    }, CHANNEL_SHELF_TEST_TIMEOUT_MS);

    it('filters non-Japanese community posts in the feed by their post text', async () => {
        document.body.innerHTML = `
            <main>
                <ytd-rich-item-renderer data-case="post-en">
                    <ytd-post-renderer><yt-formatted-string id="content-text">Mexico have beaten South Africa 2-0 to win the opening game.</yt-formatted-string></ytd-post-renderer>
                </ytd-rich-item-renderer>
                <ytd-rich-item-renderer data-case="post-ja">
                    <ytd-post-renderer><yt-formatted-string id="content-text">新しい動画を公開しました！見てね</yt-formatted-string></ytd-post-renderer>
                </ytd-rich-item-renderer>
                <ytm-backstage-post-thread-renderer data-case="post-mweb-en">
                    <ytm-backstage-post-renderer>
                        <div class="ytmBackstagePostRendererHostContentText">A backlash is growing in Japan over the use of popular anime <button>...続きを読む</button></div>
                    </ytm-backstage-post-renderer>
                </ytm-backstage-post-thread-renderer>
                <ytd-rich-item-renderer data-case="post-imageonly">
                    <ytd-post-renderer></ytd-post-renderer>
                </ytd-rich-item-renderer>
            </main>
        `;
        const { filter } = await startYoutubeFilter({ oEmbedTitles: {} });

        expect(card('post-en').classList.contains('jpdb-youtube-filtered')).toBe(true);
        expect(card('post-ja').classList.contains('jpdb-youtube-filtered')).toBe(false);
        // The mweb "read more" button text (続きを読む) must not count as
        // Japanese post content.
        expect(card('post-mweb-en').classList.contains('jpdb-youtube-filtered')).toBe(true);
        // Image/poll-only posts have no text to judge: leave them visible.
        expect(card('post-imageonly').classList.contains('jpdb-youtube-filtered')).toBe(false);

        filter.destroy();
    });

    it('leaves a channel own posts page unfiltered', async () => {
        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/@BBCNews/posts',
            origin: 'https://www.youtube.com',
            hostname: 'www.youtube.com',
            pathname: '/@BBCNews/posts',
            search: '',
        });
        document.body.innerHTML = `
            <main>
                <ytd-backstage-post-thread-renderer data-case="own-page-post">
                    <ytd-backstage-post-renderer><yt-formatted-string id="content-text">An English-only update post.</yt-formatted-string></ytd-backstage-post-renderer>
                </ytd-backstage-post-thread-renderer>
            </main>
        `;
        const { filter } = await startYoutubeFilter({ oEmbedTitles: {} });

        expect(card('own-page-post').classList.contains('jpdb-youtube-filtered')).toBe(false);

        filter.destroy();
    });

    it('compensates the scroll position when a card above the viewport collapses (iOS has no scroll anchoring)', async () => {
        renderYouTubeCards();
        const englishCard = card('english');
        const anchorCard = card('jp');
        // Anchor element sits lower on screen while the english card above it
        // collapses: its viewport top moves from 400 to 100.
        anchorCard.getBoundingClientRect = () => ({
            top: englishCard.classList.contains('jpdb-youtube-filtered') ? 100 : 400,
            bottom: 0, left: 0, right: 0, width: 320, height: 180, x: 0, y: 0, toJSON: () => ({}),
        } as DOMRect);
        const scrollBy = vi.fn();
        vi.stubGlobal('scrollY', 600);
        vi.stubGlobal('scrollBy', scrollBy);
        document.elementFromPoint = vi.fn(() => anchorCard);

        const { filter } = await startYoutubeFilter({
            oEmbedTitles: {
                jp: '日本語で花の名前を覚える',
                en: '10 habits for studying',
                channel: 'study with me',
                translated: '37,000 Lines of Slop',
                modern: '東京カフェで朝ごはん',
            },
        });

        expect(englishCard.classList.contains('jpdb-youtube-filtered')).toBe(true);
        expect(scrollBy).toHaveBeenCalledWith(0, -300);

        filter.destroy();
    });

    it('refuses to fake a subscription when no signed-in YouTube session cookie exists', async () => {
        document.cookie = 'SAPISID=; expires=Thu, 01 Jan 1970 00:00:00 GMT';
        vi.stubGlobal('location', YOUTUBE_RESULTS_LOCATION);
        stubYouTubeChannelPreviewFetch(new Set());
        const fetchMock = fetch as unknown as ReturnType<typeof vi.fn>;
        renderYouTubeCards();
        const { filter } = await startYoutubeFilter({ wait: 'flush-work' });
        await waitForChannelShelfCondition(shelf => Boolean(shelf?.querySelector('.jpdb-youtube-channel-row')));

        document.querySelector<HTMLButtonElement>('[data-yomu-youtube-channel-action="subscribe-all"]')!.click();
        await flushPendingFilterWork();
        await settlePromises();

        expect(document.querySelector<HTMLElement>('[data-role="channel-status"]')?.textContent)
            .toBe('Sign in to YouTube to subscribe to channels.');
        expect(fetchMock.mock.calls.map(call => String(call[0])).filter(url => url.includes('subscription/subscribe'))).toHaveLength(0);

        filter.destroy();
    });

    it('adds the JSON oEmbed format and caches failed title lookups', async () => {
        const fetchMock = vi.fn(async (_input: string | URL | Request) => ({
            ok: false,
            json: async () => ({}),
        }));
        vi.stubGlobal('fetch', fetchMock);
        const { filter } = await startYoutubeFilter({
            html: `
            <main>
                <ytd-rich-item-renderer data-case="jp">
                    <a id="video-title" href="/watch?v=jp">花の名前</a>
                </ytd-rich-item-renderer>
            </main>
        `,
        });

        expect(String(fetchMock.mock.calls[0][0])).toContain('format=json');
        expect(fetchMock).toHaveBeenCalledTimes(1);

        filter.refresh();
        await flushPendingFilterWork();

        expect(fetchMock).toHaveBeenCalledTimes(1);

        filter.destroy();
    });

    it('auto-hides the hidden-video notice after a grace period', async () => {
        renderYouTubeCards();
        const { filter } = await startYoutubeFilter({
            oEmbedTitles: {
                jp: '日本語で花の名前を覚える',
                en: '10 habits for studying',
                channel: 'study with me',
                translated: '37,000 Lines of Slop',
                modern: '東京カフェで朝ごはん',
            },
        });

        expect(document.querySelector('.jpdb-youtube-filter-bar')).not.toBeNull();

        await vi.advanceTimersByTimeAsync(10_500);

        expect(document.querySelector('.jpdb-youtube-filter-bar')).toBeNull();
        expect(card('english').classList.contains('jpdb-youtube-filtered')).toBe(true);

        // Auto-hide is per route scope: further filtering on the same route
        // must not resurrect the bar.
        filter.refresh();
        await flushPendingFilterWork();
        expect(document.querySelector('.jpdb-youtube-filter-bar')).toBeNull();

        filter.destroy();
    });

    it('keeps the hidden-video notice visible through the grace period', async () => {
        renderYouTubeCards();
        const { filter } = await startYoutubeFilter({
            oEmbedTitles: {
                jp: '日本語で花の名前を覚える',
                en: '10 habits for studying',
                channel: 'study with me',
                translated: '37,000 Lines of Slop',
                modern: '東京カフェで朝ごはん',
            },
        });

        expect(document.querySelector('.jpdb-youtube-filter-bar')).not.toBeNull();

        await vi.advanceTimersByTimeAsync(4200);

        expect(document.querySelector('.jpdb-youtube-filter-bar')).not.toBeNull();
        expect(card('english').classList.contains('jpdb-youtube-filtered')).toBe(true);

        filter.destroy();
    });

    it('dismisses the hidden-video notice for the session without persisting it off', async () => {
        renderYouTubeCards();
        const { filter, settings } = await startYoutubeFilter({
            oEmbedTitles: {
                jp: '日本語で花の名前を覚える',
                en: '10 habits for studying',
                channel: 'study with me',
                translated: '37,000 Lines of Slop',
                modern: '東京カフェで朝ごはん',
            },
        });

        document.querySelector<HTMLButtonElement>('[data-action="hide-notice"]')!.click();
        await vi.advanceTimersByTimeAsync(0);

        expect(document.querySelector('.jpdb-youtube-filter-bar')).toBeNull();
        // Session dismissal only: the persisted setting stays on.
        expect(settings.youtubeShowFilterNotice).toBe(true);
        expect(card('english').classList.contains('jpdb-youtube-filtered')).toBe(true);

        // The dismissal survives refreshes within the same session…
        filter.refresh();
        await flushPendingFilterWork();
        expect(document.querySelector('.jpdb-youtube-filter-bar')).toBeNull();
        filter.destroy();

        // …but a fresh session (new filter instance) shows the notice again.
        const fresh = createYoutubeFilter(() => settings);
        fresh.refresh();
        await flushPendingFilterWork();
        expect(document.querySelector('.jpdb-youtube-filter-bar')).not.toBeNull();
        fresh.destroy();
    });

    it('does not keep reopening the notice as more cards are filtered on the same route', async () => {
        const { filter } = await startYoutubeFilter({
            oEmbedTitles: {},
            html: `
            <main>
                <ytd-rich-item-renderer data-case="english">
                    <a id="video-title" href="/watch?v=en">10 habits for studying</a>
                </ytd-rich-item-renderer>
            </main>
        `,
        });

        expect(document.querySelector('.jpdb-youtube-filter-bar')).not.toBeNull();

        document.querySelector<HTMLButtonElement>('[data-action="hide-notice"]')!.click();
        await vi.advanceTimersByTimeAsync(0);

        expect(document.querySelector('.jpdb-youtube-filter-bar')).toBeNull();

        document.querySelector('main')!.insertAdjacentHTML('beforeend', `
            <ytd-rich-item-renderer data-case="english-2">
                <a id="video-title" href="/watch?v=en2">more study tips</a>
            </ytd-rich-item-renderer>
        `);
        expect(collectYouTubeVideoCards(document).map(element => element.dataset.case)).toContain('english-2');
        filter.refresh();
        await vi.advanceTimersByTimeAsync(0);
        await flushPendingFilterWork();

        expect(card('english-2').classList.contains('jpdb-youtube-filtered')).toBe(true);
        expect(document.querySelector('.jpdb-youtube-filter-bar')).toBeNull();

        filter.destroy();
    });

    it('filters non-current Shorts watch items while leaving the snap item visible', async () => {
        document.body.innerHTML = `
            <ytd-shorts>
                <ytd-reel-video-renderer data-case="shorts-feed" class="jpdb-youtube-filtered" data-yomu-youtube-filtered="true">
                    <a id="video-title" href="/shorts/abc123">English short</a>
                </ytd-reel-video-renderer>
                <ytd-reel-video-renderer data-case="shorts-next-en">
                    <a id="video-title" href="/shorts/en-next">Desk setup Short</a>
                </ytd-reel-video-renderer>
                <ytd-reel-video-renderer data-case="shorts-next-jp">
                    <a id="video-title" href="/shorts/jp-next">東京駅で迷子になる</a>
                </ytd-reel-video-renderer>
            </ytd-shorts>
        `;
        Object.defineProperty(card('shorts-feed'), 'getBoundingClientRect', {
            configurable: true,
            value: () => new DOMRect(0, -window.innerHeight, 390, window.innerHeight),
        });
        Object.defineProperty(card('shorts-next-en'), 'getBoundingClientRect', {
            configurable: true,
            value: () => new DOMRect(0, 0, 390, window.innerHeight),
        });
        Object.defineProperty(card('shorts-next-jp'), 'getBoundingClientRect', {
            configurable: true,
            value: () => new DOMRect(0, window.innerHeight, 390, window.innerHeight),
        });

        const { filter } = await startYoutubeFilter({
            location: {
                href: 'https://www.youtube.com/shorts/abc123',
                origin: 'https://www.youtube.com',
                hostname: 'www.youtube.com',
                pathname: '/shorts/abc123',
                search: '',
            },
            wait: 'flush-work',
        });

        // The current reel (matching the /shorts/<id> URL) stays visible even
        // though its title is English; the next English short is filtered so
        // scrolling skips it, and the next Japanese short is kept.
        expect(card('shorts-feed').classList.contains('jpdb-youtube-filtered')).toBe(false);
        expect(card('shorts-next-en').classList.contains('jpdb-youtube-filtered')).toBe(true);
        expect(card('shorts-next-jp').classList.contains('jpdb-youtube-filtered')).toBe(false);
        expect(collectYouTubeVideoCards(document).map(element => element.dataset.case)).toEqual([
            'shorts-feed',
            'shorts-next-en',
            'shorts-next-jp',
        ]);
        expect(document.querySelector('.jpdb-youtube-filter-bar')).toBeNull();

        filter.destroy();
    });

    it('filters mobile Shorts watch lockups after the current item', async () => {
        const { filter } = await startYoutubeFilter({
            location: {
                href: 'https://m.youtube.com/shorts/mobileShort',
                origin: 'https://m.youtube.com',
                hostname: 'm.youtube.com',
                pathname: '/shorts/mobileShort',
                search: '',
            },
            html: `
            <ytm-shorts-lockup-view-model data-case="mobile-shorts-feed" class="jpdb-youtube-filtered" data-yomu-youtube-filtered="true">
                <a class="shortsLockupViewModelHostEndpoint reel-item-endpoint" href="/shorts/mobileShort">
                    <h3 class="shortsLockupViewModelHostMetadataTitle">English short</h3>
                </a>
            </ytm-shorts-lockup-view-model>
            <ytm-shorts-lockup-view-model data-case="mobile-shorts-next-en">
                <a class="shortsLockupViewModelHostEndpoint reel-item-endpoint" href="/shorts/mobileNext">
                    <h3 class="shortsLockupViewModelHostMetadataTitle">Desk setup Short</h3>
                </a>
            </ytm-shorts-lockup-view-model>
            <ytm-shorts-lockup-view-model data-case="mobile-shorts-next-jp">
                <a class="shortsLockupViewModelHostEndpoint reel-item-endpoint" href="/shorts/mobileJp">
                    <h3 class="shortsLockupViewModelHostMetadataTitle">大阪で食べ歩き</h3>
                </a>
            </ytm-shorts-lockup-view-model>
        `,
            wait: 'flush-work',
        });

        expect(card('mobile-shorts-feed').classList.contains('jpdb-youtube-filtered')).toBe(false);
        expect(card('mobile-shorts-next-en').classList.contains('jpdb-youtube-filtered')).toBe(true);
        expect(card('mobile-shorts-next-jp').classList.contains('jpdb-youtube-filtered')).toBe(false);
        expect(collectYouTubeVideoCards(document).map(element => element.dataset.case)).toEqual([
            'mobile-shorts-feed',
            'mobile-shorts-next-en',
            'mobile-shorts-next-jp',
        ]);
        expect(document.querySelector('.jpdb-youtube-filter-bar')).toBeNull();

        filter.destroy();
    });

    it('advances the m.youtube.com carousel reel past a non-Japanese active short via the hidden a11y next button', async () => {
        const mwebReelHtml = (title: string) => `
            <shorts-page>
                <shorts-carousel class="ytShortsCarouselHost">
                    <div class="hidden-a11y-nav ytShortsCarouselShortsA11yNav">
                        <button class="ytShortsCarouselShortsA11yNavButton" disabled aria-label="前の動画"></button>
                        <button class="ytShortsCarouselShortsA11yNavButton" aria-label="次の動画"></button>
                    </div>
                    <div id="carousel-scrollable-wrapper"><shorts-video></shorts-video></div>
                </shorts-carousel>
                <ytm-reel-player-overlay-renderer>
                    <yt-shorts-video-title-view-model>${title}</yt-shorts-video-title-view-model>
                </ytm-reel-player-overlay-renderer>
            </shorts-page>`;
        const mwebShortsLocation = (videoId: string) => ({
            href: `https://m.youtube.com/shorts/${videoId}`,
            origin: 'https://m.youtube.com',
            hostname: 'm.youtube.com',
            pathname: `/shorts/${videoId}`,
            search: '',
        });
        const nextButton = () => document.querySelector<HTMLButtonElement>('.ytShortsCarouselShortsA11yNavButton:not([disabled])')!;
        const runMwebReel = async (videoId: string, title: string): Promise<{ clicks: number; filter: YoutubeImmersionFilter }> => {
            vi.useFakeTimers();
            stubOEmbedTitles({ [videoId]: title });
            vi.stubGlobal('location', mwebShortsLocation(videoId));
            document.body.innerHTML = mwebReelHtml(title);
            let clicks = 0;
            nextButton().addEventListener('click', () => { clicks += 1; });
            const filter = createYoutubeFilter(() => youtubeFilterSettings());
            filter.init();
            await flushPendingFilterWork();
            return { clicks, filter };
        };

        // English active short: the reel advances via the a11y next button.
        const english = await runMwebReel('mwebActive', 'Crazy gym fail compilation');
        expect(english.clicks).toBeGreaterThan(0);
        // The mweb player itself must never be offscreen-hidden.
        expect(document.querySelector('shorts-page')!.classList.contains('jpdb-youtube-filtered')).toBe(false);
        english.filter.destroy();
        document.body.replaceChildren();

        // Japanese active short: no advance.
        const japanese = await runMwebReel('mwebJp', '大阪で食べ歩きラーメン');
        expect(japanese.clicks).toBe(0);
        japanese.filter.destroy();
    });

    it('keeps advancing mobile Shorts through adjacent non-Japanese reels until a Japanese short is active', async () => {
        vi.useFakeTimers();
        let now = 1000;
        const performanceNow = vi.spyOn(performance, 'now').mockImplementation(() => now);
        const chain = [
            { videoId: 'firstEnglish', title: 'Desk setup Short' },
            { videoId: 'secondEnglish', title: 'Gym routine Short' },
            { videoId: 'japaneseShort', title: '大阪で食べ歩きラーメン' },
        ];
        const locationState = {
            href: 'https://m.youtube.com/shorts/firstEnglish',
            origin: 'https://m.youtube.com',
            hostname: 'm.youtube.com',
            pathname: '/shorts/firstEnglish',
            search: '',
        };
        stubOEmbedTitles(Object.fromEntries(chain.map(item => [item.videoId, item.title])));
        vi.stubGlobal('location', locationState);
        document.body.innerHTML = `
            <shorts-page>
                <shorts-carousel class="ytShortsCarouselHost">
                    <div class="hidden-a11y-nav ytShortsCarouselShortsA11yNav">
                        <button class="ytShortsCarouselShortsA11yNavButton" disabled aria-label="前の動画"></button>
                        <button class="ytShortsCarouselShortsA11yNavButton" aria-label="次の動画"></button>
                    </div>
                    <div id="carousel-scrollable-wrapper"><shorts-video></shorts-video></div>
                </shorts-carousel>
                <ytm-reel-player-overlay-renderer>
                    <yt-shorts-video-title-view-model>${chain[0].title}</yt-shorts-video-title-view-model>
                </ytm-reel-player-overlay-renderer>
            </shorts-page>`;

        let activeIndex = 0;
        let clicks = 0;
        document.querySelector<HTMLButtonElement>('.ytShortsCarouselShortsA11yNavButton:not([disabled])')!
            .addEventListener('click', () => {
                clicks += 1;
                activeIndex = Math.min(activeIndex + 1, chain.length - 1);
                const active = chain[activeIndex]!;
                locationState.href = `https://m.youtube.com/shorts/${active.videoId}`;
                locationState.pathname = `/shorts/${active.videoId}`;
                document.querySelector('yt-shorts-video-title-view-model')!.textContent = active.title;
                window.dispatchEvent(new Event('yt-navigate-finish'));
            });
        const filter = createYoutubeFilter(() => youtubeFilterSettings());

        try {
            filter.init();
            for (let i = 0; i < 10 && clicks < 1; i += 1) {
                await settlePromises();
                await vi.advanceTimersByTimeAsync(i === 0 ? 0 : 25);
            }

            expect(clicks).toBe(1);
            expect(locationState.pathname).toBe('/shorts/secondEnglish');

            now += 1000;
            await vi.advanceTimersByTimeAsync(1000);
            await flushPendingFilterWork();

            expect(clicks).toBe(2);
            expect(locationState.pathname).toBe('/shorts/japaneseShort');

            now += 1200;
            await vi.advanceTimersByTimeAsync(1200);
            await flushPendingFilterWork();

            expect(clicks).toBe(2);
        } finally {
            performanceNow.mockRestore();
            filter.destroy();
        }
    });

    // iPad's "Request Desktop Website" (the default for youtube.com) serves the
    // desktop ytd-shorts player, not m.youtube.com. The active reel must skip
    // non-Japanese shorts there exactly like the mobile carousel does.
    const desktopShortsLocation = (videoId: string) => ({
        href: `https://www.youtube.com/shorts/${videoId}`,
        origin: 'https://www.youtube.com',
        hostname: 'www.youtube.com',
        pathname: `/shorts/${videoId}`,
        search: '',
    });
    const desktopShortsHtml = (videoId: string, overlayTitle: string) => `
        <ytd-shorts>
            <ytd-reel-video-renderer data-case="active">
                <a id="video-title" href="/shorts/${videoId}">${overlayTitle}</a>
                <yt-shorts-video-title-view-model>${overlayTitle}</yt-shorts-video-title-view-model>
            </ytd-reel-video-renderer>
            <div id="navigation-button-down"><button aria-label="次の動画"></button></div>
        </ytd-shorts>`;
    // The active short can advance synchronously inside filter.init() (when the
    // tab title is already the original), so the click counter must be wired
    // BEFORE init — exactly like the mobile carousel test.
    const runDesktopShort = async (
        { videoId, tabTitle, overlayTitle, oEmbedTitle }: { videoId: string; tabTitle: string; overlayTitle: string; oEmbedTitle: string },
    ): Promise<{ clicks: number; filter: YoutubeImmersionFilter }> => {
        vi.useFakeTimers();
        stubOEmbedTitles({ [videoId]: oEmbedTitle });
        vi.stubGlobal('location', desktopShortsLocation(videoId));
        document.title = tabTitle;
        document.body.innerHTML = desktopShortsHtml(videoId, overlayTitle);
        let clicks = 0;
        document.querySelector<HTMLButtonElement>('ytd-shorts #navigation-button-down button')!
            .addEventListener('click', () => { clicks += 1; });
        const filter = createYoutubeFilter(() => youtubeFilterSettings());
        filter.init();
        await flushPendingFilterWork();
        return { clicks, filter };
    };

    it('advances the desktop (iPad) ytd-shorts player past a non-Japanese active short', async () => {
        const { clicks, filter } = await runDesktopShort({
            videoId: 'deskEnglish', tabTitle: 'Crazy gym fail compilation - YouTube',
            overlayTitle: 'Crazy gym fail compilation', oEmbedTitle: 'Crazy gym fail compilation',
        });
        expect(clicks).toBeGreaterThan(0);
        // The active reel itself must never be offscreen-hidden.
        expect(card('active').classList.contains('jpdb-youtube-filtered')).toBe(false);
        filter.destroy();
    });

    it('does not advance the desktop ytd-shorts player on a Japanese active short', async () => {
        const { clicks, filter } = await runDesktopShort({
            videoId: 'deskJp', tabTitle: '大阪で食べ歩きラーメン - YouTube',
            overlayTitle: '大阪で食べ歩きラーメン', oEmbedTitle: '大阪で食べ歩きラーメン',
        });
        expect(clicks).toBe(0);
        filter.destroy();
    });

    it('advances a desktop short whose on-screen title was auto-translated to the UI locale', async () => {
        // The locale bug: an English video shows a Japanese-translated overlay
        // title. The oEmbed ORIGINAL title (English) is the authority, so the
        // short is still recognised as non-Japanese and skipped.
        const { clicks, filter } = await runDesktopShort({
            videoId: 'deskTranslated', tabTitle: 'YouTube', // tab title not settled — force reliance on oEmbed
            overlayTitle: '音は聞かないで', oEmbedTitle: "Don't check the sound",
        });
        expect(clicks).toBeGreaterThan(0);
        filter.destroy();
    });

    it('does not strip reader words from the YouTube watch title while filtering', async () => {
        const { filter } = await startYoutubeFilter({
            location: {
                href: 'https://www.youtube.com/watch?v=current',
                origin: 'https://www.youtube.com',
                hostname: 'www.youtube.com',
                pathname: '/watch',
                search: '?v=current',
            },
            html: `
            <ytd-watch-metadata>
                <h1><yt-formatted-string><span class="jpdb-reader-word jpdb-known">古い動画</span>タイトル</yt-formatted-string></h1>
            </ytd-watch-metadata>
        `,
            wait: 'timer-tick',
        });

        expect(document.querySelector('ytd-watch-metadata h1 .jpdb-reader-word')).not.toBeNull();
        expect(document.querySelector('ytd-watch-metadata h1')?.textContent).toBe('古い動画タイトル');

        filter.destroy();
    });

    it('hides watch recommendations without rendering a video-covering notice', async () => {
        const { filter } = await startYoutubeFilter({
            location: {
                href: 'https://www.youtube.com/watch?v=current',
                origin: 'https://www.youtube.com',
                hostname: 'www.youtube.com',
                pathname: '/watch',
                search: '?v=current',
            },
            html: `
            <div id="movie_player"></div>
            <div id="secondary">
                <ytd-compact-video-renderer data-case="watch-english">
                    <a id="video-title" href="/watch?v=en">A long English interview</a>
                </ytd-compact-video-renderer>
            </div>
        `,
            wait: 'flush-work',
        });

        expect(card('watch-english').classList.contains('jpdb-youtube-filtered')).toBe(true);
        expect(document.querySelector('.jpdb-youtube-filter-bar')).toBeNull();

        filter.destroy();
    });

    it('does not observe or clear YouTube cards while the filter is disabled', async () => {
        vi.useFakeTimers();
        stubOEmbedTitles({
            jp: '日本語で花の名前を覚える',
            en: '10 habits for studying',
            channel: 'study with me',
            translated: '37,000 Lines of Slop',
            modern: '東京カフェで朝ごはん',
        });
        const OriginalMutationObserver = MutationObserver;
        const observe = vi.fn();
        const disconnect = vi.fn();
        const MutationObserverMock = vi.fn(() => ({
            observe,
            disconnect,
            takeRecords: () => [],
        } as unknown as MutationObserver));
        vi.stubGlobal('MutationObserver', MutationObserverMock);
        let settings = youtubeFilterSettings({
            youtubeImmersionEnabled: false,
        });
        const filter = createYoutubeFilter(() => settings);

        try {
            filter.init();
            renderYouTubeCards();
            await vi.advanceTimersByTimeAsync(0);

            expect(MutationObserverMock).not.toHaveBeenCalled();
            expect(card('english').classList.contains('jpdb-youtube-filtered')).toBe(false);
            expect(document.querySelector('.jpdb-youtube-filter-bar')).toBeNull();

            settings = { ...settings, youtubeImmersionEnabled: true };
            filter.refresh();
            await flushPendingFilterWork();

            expect(MutationObserverMock).toHaveBeenCalledTimes(1);
            expect(observe).toHaveBeenCalledTimes(1);
            expect(card('english').classList.contains('jpdb-youtube-filtered')).toBe(true);
            expect(card('translated-english').classList.contains('jpdb-youtube-filtered')).toBe(true);

            settings = { ...settings, youtubeImmersionEnabled: false };
            filter.refresh();
            await vi.advanceTimersByTimeAsync(0);

            expect(disconnect).toHaveBeenCalledTimes(1);
            expect(card('english').classList.contains('jpdb-youtube-filtered')).toBe(false);
        } finally {
            filter.destroy();
            vi.stubGlobal('MutationObserver', OriginalMutationObserver);
        }
    });

    it('filters for the learner\'s own target language rather than for Japanese', async () => {
        const settings = youtubeFilterSettings({
            languageProfiles: DEFAULT_SETTINGS.languageProfiles.map(profile =>
                profile.id === DEFAULT_SETTINGS.activeLanguageProfileId
                    ? { ...profile, targetLanguage: 'ru' }
                    : profile),
        });
        const { filter } = await startYoutubeFilter({
            location: YOUTUBE_RESULTS_LOCATION,
            settings,
            html: `
                <main>
                    <ytd-rich-item-renderer data-case="russian">
                        <a id="video-title" href="/watch?v=ru">Русский язык для начинающих</a>
                    </ytd-rich-item-renderer>
                    <ytd-rich-item-renderer data-case="japanese">
                        <a id="video-title" href="/watch?v=ja">日本語の聞き取り練習</a>
                    </ytd-rich-item-renderer>
                </main>
            `,
            oEmbedTitles: {
                ru: 'Русский язык для начинающих',
                ja: '日本語の聞き取り練習',
            },
        });

        expect(card('russian').classList.contains('jpdb-youtube-filtered')).toBe(false);
        expect(document.documentElement.classList.contains('jpdb-youtube-filter-active')).toBe(false);
        expect(document.querySelector('.jpdb-youtube-channel-shelf')).toBeNull();
        expect(settings).toMatchObject({
            youtubeImmersionEnabled: true,
            youtubeImmersionEnabledChosen: false,
            youtubeShowChannelRecommendations: true,
            youtubeShowChannelRecommendationsChosen: false,
        });

        settings.youtubeImmersionEnabledChosen = true;
        settings.youtubeShowChannelRecommendationsChosen = true;
        filter.refresh();
        await runInitialFilterScan();

        // The filter asks the ACTIVE target whether text is its language, so a Russian
        // learner keeps Russian and loses Japanese -- the exact inverse of what shipped
        // before A48, where `non-japanese` hid the learner's own language.
        expect(card('russian').classList.contains('jpdb-youtube-filtered')).toBe(false);
        expect(card('japanese').classList.contains('jpdb-youtube-filtered')).toBe(true);
        expect(document.documentElement.classList.contains('jpdb-youtube-filter-active')).toBe(true);
        // The channel corpus is 100 JLPT-graded Japanese channels, so it stays out of a
        // Russian learner's feed even with recommendations explicitly turned on.
        expect(document.querySelector('.jpdb-youtube-channel-shelf')).toBeNull();

        filter.destroy();
    });

    it('ignores reader roots appended to the YouTube body without scheduling a rescan', () => {
        vi.useFakeTimers();
        renderYouTubeCards();
        const OriginalMutationObserver = MutationObserver;
        let callback: MutationCallback | undefined;
        const MutationObserverMock = vi.fn((observerCallback: MutationCallback) => {
            callback = observerCallback;
            return {
                observe: vi.fn(),
                disconnect: vi.fn(),
                takeRecords: () => [],
            } as unknown as MutationObserver;
        });
        vi.stubGlobal('MutationObserver', MutationObserverMock);
        const filter = createYoutubeFilter(() => youtubeFilterSettings());
        const scheduleSpy = vi.spyOn(filter as unknown as { schedule(delay: number): void }, 'schedule');

        try {
            filter.init();
            expect(callback).toBeDefined();
            scheduleSpy.mockClear();

            const settingsRoot = document.createElement('form');
            settingsRoot.className = 'jpdb-reader-settings';
            settingsRoot.dataset.jpdbReaderRoot = 'true';
            settingsRoot.innerHTML = `
                <a href="/watch?v=settings-link">Settings help link</a>
                <button type="button">保存</button>
                <div>字幕と辞書の設定</div>
            `;
            callback!([{
                type: 'childList',
                target: document.body,
                addedNodes: [settingsRoot] as unknown as NodeList,
                removedNodes: [] as unknown as NodeList,
            } as unknown as MutationRecord], {} as MutationObserver);
            expect(scheduleSpy).not.toHaveBeenCalled();

            const cardRoot = document.createElement('ytd-rich-item-renderer');
            cardRoot.innerHTML = '<a id="video-title" href="/watch?v=new-card">Desk setup tour</a>';
            callback!([{
                type: 'childList',
                target: document.body,
                addedNodes: [cardRoot] as unknown as NodeList,
                removedNodes: [] as unknown as NodeList,
            } as unknown as MutationRecord], {} as MutationObserver);
            expect(scheduleSpy).toHaveBeenCalledWith(90);
        } finally {
            filter.destroy();
            vi.stubGlobal('MutationObserver', OriginalMutationObserver);
        }
    });

    it('re-marks the first visible item of each row after filtering (rowless lockup grid)', () => {
        document.body.innerHTML = `
            <ytd-rich-grid-renderer>
                <div id="contents">
                    <ytd-rich-item-renderer id="v1" items-per-row="3" is-in-first-column=""></ytd-rich-item-renderer>
                    <ytd-rich-item-renderer id="f1" items-per-row="3" class="jpdb-youtube-filtered jpdb-youtube-first-in-row"></ytd-rich-item-renderer>
                    <ytd-rich-item-renderer id="f2" items-per-row="3" is-in-first-column=""></ytd-rich-item-renderer>
                    <ytd-rich-item-renderer id="v2" items-per-row="3"></ytd-rich-item-renderer>
                    <ytd-rich-section-renderer id="section"></ytd-rich-section-renderer>
                    <ytd-rich-item-renderer id="v3" items-per-row="3"></ytd-rich-item-renderer>
                    <ytd-rich-item-renderer id="v4" items-per-row="3" is-first-in-column=""></ytd-rich-item-renderer>
                </div>
            </ytd-rich-grid-renderer>
        `;
        document.getElementById('f2')!.classList.add('jpdb-youtube-filtered');

        rebalanceYouTubeGridRows();

        // v1 starts row 0; filtered f1/f2 leave the flow; v2 sits beside v1.
        expect(document.getElementById('v1')!.classList.contains('jpdb-youtube-first-in-row')).toBe(true);
        expect(document.getElementById('v2')!.classList.contains('jpdb-youtube-first-in-row')).toBe(false);
        // The visible section breaks the row: v3 restarts at column 0.
        expect(document.getElementById('v3')!.classList.contains('jpdb-youtube-first-in-row')).toBe(true);
        expect(document.getElementById('v4')!.classList.contains('jpdb-youtube-first-in-row')).toBe(false);
        // Filtered items never keep the marker; stale YouTube flags are gone.
        expect(document.getElementById('f1')!.classList.contains('jpdb-youtube-first-in-row')).toBe(false);
        expect(document.getElementById('v1')!.hasAttribute('is-in-first-column')).toBe(false);
        expect(document.getElementById('v4')!.hasAttribute('is-first-in-column')).toBe(false);
        // Filtered items keep their stale attribute harmlessly offscreen.
        expect(document.getElementById('f2')!.hasAttribute('is-in-first-column')).toBe(true);
    });

    it('always hides lockup mix/playlist stacks regardless of title language (UT-38)', () => {
        document.body.innerHTML = `
            <ytd-rich-item-renderer id="mix">
                <yt-lockup-view-model>
                    <yt-collection-thumbnail-view-model></yt-collection-thumbnail-view-model>
                    <a href="/watch?v=abc12345678&list=RDabc12345678">ミックスリスト - ポップ・ミュージック</a>
                </yt-lockup-view-model>
            </ytd-rich-item-renderer>
            <ytd-rich-item-renderer id="radio-link">
                <yt-lockup-view-model>
                    <a href="/watch?v=def12345678&list=RDdef12345678">ミックスリスト - アジアの音楽</a>
                </yt-lockup-view-model>
            </ytd-rich-item-renderer>
            <ytd-rich-item-renderer id="video">
                <yt-lockup-view-model>
                    <a href="/watch?v=ghi12345678">日本語の動画</a>
                </yt-lockup-view-model>
            </ytd-rich-item-renderer>
        `;
        const candidates = collectYouTubeVideoCards(document.body);
        expect(candidates.length).toBeGreaterThan(0);
        const filter = new YoutubeImmersionFilter({ getSettings: () => DEFAULT_SETTINGS } as never);
        const candidateFor = (id: string) => (filter as unknown as {
            filterCandidateForCard(card: HTMLElement): { alwaysHidden: boolean };
        }).filterCandidateForCard(document.getElementById(id)!);
        expect(candidateFor('mix').alwaysHidden).toBe(true);
        expect(candidateFor('radio-link').alwaysHidden).toBe(true);
        expect(candidateFor('video').alwaysHidden).toBe(false);
    });

    it('collapses unrendered shelf slots until YouTube hydrates them (UT-26 gaps)', () => {
        document.body.innerHTML = `
            <ytd-rich-shelf-renderer>
                <ytd-rich-item-renderer id="rendered"><ytd-rich-grid-media></ytd-rich-grid-media></ytd-rich-item-renderer>
                <ytd-rich-item-renderer id="blank"><!--css-build:shady--></ytd-rich-item-renderer>
                <ytd-rich-item-renderer id="filtered" class="jpdb-youtube-filtered"></ytd-rich-item-renderer>
            </ytd-rich-shelf-renderer>
            <grid-shelf-view-model>
                <ytd-rich-item-renderer id="modern-blank"><!--css-build:shady--></ytd-rich-item-renderer>
            </grid-shelf-view-model>
            <ytd-rich-item-renderer id="grid-item"></ytd-rich-item-renderer>
        `;

        syncUnrenderedYouTubeShelfSlots();

        expect(document.getElementById('rendered')!.classList.contains('jpdb-youtube-unrendered-slot')).toBe(false);
        expect(document.getElementById('blank')!.classList.contains('jpdb-youtube-unrendered-slot')).toBe(true);
        expect(document.getElementById('modern-blank')!.classList.contains('jpdb-youtube-unrendered-slot')).toBe(true);
        // Filter decisions own filtered slots; grid items outside shelves are untouched.
        expect(document.getElementById('filtered')!.classList.contains('jpdb-youtube-unrendered-slot')).toBe(false);
        expect(document.getElementById('grid-item')!.classList.contains('jpdb-youtube-unrendered-slot')).toBe(false);

        // YouTube hydrates the slot: the next sweep restores it.
        document.getElementById('blank')!.append(document.createElement('yt-lockup-view-model'));
        document.getElementById('modern-blank')!.append(document.createElement('yt-lockup-view-model'));
        syncUnrenderedYouTubeShelfSlots();
        expect(document.getElementById('blank')!.classList.contains('jpdb-youtube-unrendered-slot')).toBe(false);
        expect(document.getElementById('modern-blank')!.classList.contains('jpdb-youtube-unrendered-slot')).toBe(false);
    });

    it('keeps one column counter across legacy ytd-rich-grid-row wrappers (display:contents flattening)', () => {
        document.body.innerHTML = `
            <ytd-rich-grid-renderer>
                <div id="contents">
                    <ytd-rich-grid-row>
                        <div id="contents">
                            <ytd-rich-item-renderer id="v1" items-per-row="3"></ytd-rich-item-renderer>
                            <ytd-rich-item-renderer id="f1" items-per-row="3" class="jpdb-youtube-filtered"></ytd-rich-item-renderer>
                            <ytd-rich-item-renderer id="v2" items-per-row="3"></ytd-rich-item-renderer>
                        </div>
                    </ytd-rich-grid-row>
                    <ytd-rich-grid-row>
                        <div id="contents">
                            <ytd-rich-item-renderer id="v3" items-per-row="3" is-in-first-column=""></ytd-rich-item-renderer>
                            <ytd-rich-item-renderer id="v4" items-per-row="3"></ytd-rich-item-renderer>
                        </div>
                    </ytd-rich-grid-row>
                </div>
            </ytd-rich-grid-renderer>
        `;

        rebalanceYouTubeGridRows();

        // v1+v2 from row 1 and v3 from row 2 share the first VISUAL row (the
        // filtered f1 left the flow and rows are flattened); v4 starts row 2.
        expect(document.getElementById('v1')!.classList.contains('jpdb-youtube-first-in-row')).toBe(true);
        expect(document.getElementById('v2')!.classList.contains('jpdb-youtube-first-in-row')).toBe(false);
        expect(document.getElementById('v3')!.classList.contains('jpdb-youtube-first-in-row')).toBe(false);
        expect(document.getElementById('v3')!.hasAttribute('is-in-first-column')).toBe(false);
        expect(document.getElementById('v4')!.classList.contains('jpdb-youtube-first-in-row')).toBe(true);
    });



    it('treats a fully filtered section as a row break only when hidden', () => {
        document.body.innerHTML = `
            <ytd-rich-grid-renderer>
                <div id="contents">
                    <ytd-rich-item-renderer id="v1" items-per-row="2"></ytd-rich-item-renderer>
                    <ytd-rich-section-renderer id="hidden-section" class="jpdb-youtube-filtered"></ytd-rich-section-renderer>
                    <ytd-rich-item-renderer id="v2" items-per-row="2"></ytd-rich-item-renderer>
                    <ytd-rich-item-renderer id="v3" items-per-row="2"></ytd-rich-item-renderer>
                </div>
            </ytd-rich-grid-renderer>
        `;

        rebalanceYouTubeGridRows();

        // The hidden section leaves the flow, so v2 continues v1's row and v3
        // starts the next one.
        expect(document.getElementById('v1')!.classList.contains('jpdb-youtube-first-in-row')).toBe(true);
        expect(document.getElementById('v2')!.classList.contains('jpdb-youtube-first-in-row')).toBe(false);
        expect(document.getElementById('v3')!.classList.contains('jpdb-youtube-first-in-row')).toBe(true);
    });
});

describe('YouTube channel subscription flag', () => {
    const STORAGE_KEY = 'yomu:youtube-all-subscribed:v1';

    type FlagInternals = {
        subscribedChannelHandles: Set<string>;
        unresolvableChannelHandles: Set<string>;
        channelsAllSubscribed: boolean;
        markChannelSubscriptionCompleteIfReady(): void;
        loadChannelSubscriptionState(): void;
    };

    afterEach(() => {
        // Match the first describe block's full teardown so fake timers or stubbed
        // globals never leak across blocks (or into the next file in a reused fork).
        vi.clearAllTimers();
        vi.useRealTimers();
        vi.unstubAllGlobals();
        sessionStorage.clear();
        localStorage.clear();
        document.body.replaceChildren();
        document.title = '';
    });

    it('signature is stable and encodes the channel count', () => {
        const signature = youTubeChannelListSignature();
        expect(signature).toBe(youTubeChannelListSignature());
        expect(signature.startsWith(`${YOUTUBE_CHANNEL_RECOMMENDATION_COUNT}:`)).toBe(true);
    });

    it('persists the all-subscribed flag and a fresh instance skips re-testing', () => {
        const filter = createYoutubeFilter(() => youtubeFilterSettings());
        const internals = filter as unknown as FlagInternals;
        allYouTubeChannelRecommendations().forEach(channel => internals.subscribedChannelHandles.add(channel.handle));
        internals.markChannelSubscriptionCompleteIfReady();
        expect(internals.channelsAllSubscribed).toBe(true);
        expect(gmStorageGetSync<{ signature?: string } | null>(STORAGE_KEY, null)?.signature).toBe(youTubeChannelListSignature());

        const fresh = createYoutubeFilter(() => youtubeFilterSettings());
        const freshInternals = fresh as unknown as FlagInternals;
        freshInternals.loadChannelSubscriptionState();
        expect(freshInternals.channelsAllSubscribed).toBe(true);
        expect(freshInternals.subscribedChannelHandles.size).toBe(YOUTUBE_CHANNEL_RECOMMENDATION_COUNT);
    });

    it('resets the flag when the stored signature no longer matches the list', () => {
        gmStorageSetSync(STORAGE_KEY, { signature: 'stale-list-signature' });
        const fresh = createYoutubeFilter(() => youtubeFilterSettings());
        (fresh as unknown as FlagInternals).loadChannelSubscriptionState();
        expect((fresh as unknown as FlagInternals).channelsAllSubscribed).toBe(false);
        expect(gmStorageGetSync(STORAGE_KEY, null)).toBeNull();
    });

    it('still completes when a channel is unresolvable (deleted/moved)', () => {
        const filter = createYoutubeFilter(() => youtubeFilterSettings());
        const internals = filter as unknown as FlagInternals;
        const channels = allYouTubeChannelRecommendations();
        channels.slice(1).forEach(channel => internals.subscribedChannelHandles.add(channel.handle));
        internals.unresolvableChannelHandles.add(channels[0]!.handle);
        internals.markChannelSubscriptionCompleteIfReady();
        expect(internals.channelsAllSubscribed).toBe(true);
    });

    it('does not set the flag while channels are still unsubscribed', () => {
        const filter = createYoutubeFilter(() => youtubeFilterSettings());
        const internals = filter as unknown as FlagInternals;
        allYouTubeChannelRecommendations().slice(0, 5).forEach(channel => internals.subscribedChannelHandles.add(channel.handle));
        internals.markChannelSubscriptionCompleteIfReady();
        expect(internals.channelsAllSubscribed).toBe(false);
        expect(gmStorageGetSync(STORAGE_KEY, null)).toBeNull();
    });
});

// 2026-07-11 live repro: in-feed ad slots (and the lockup ad variant) carry no
// <h3>; the generic a[href*="/watch"] title fallback landed on their CTA label
// (視聴する in a Japanese UI), so English ads classified as Japanese and stayed
// visible. Ads are never immersion content — always hidden while filtering.
describe('ad cards are always hidden', () => {
    it('hides an in-feed ad slot regardless of its CTA label language', async () => {
        const { filter } = await startYoutubeFilter({
            html: `
            <main>
                <ytd-rich-item-renderer data-case="ad">
                    <ytd-ad-slot-renderer>
                        <ytd-in-feed-ad-layout-renderer>
                            <a href="/watch?v=advid">視聴する</a>
                            <span>Sponsored product tour</span>
                        </ytd-in-feed-ad-layout-renderer>
                    </ytd-ad-slot-renderer>
                </ytd-rich-item-renderer>
                <ytd-rich-item-renderer data-case="jp">
                    <a id="video-title" href="/watch?v=jp">日本語のタイトル</a>
                </ytd-rich-item-renderer>
            </main>
        `,
        });
        expect(card('ad').classList.contains('jpdb-youtube-filtered')).toBe(true);
        expect(card('jp').classList.contains('jpdb-youtube-filtered')).toBe(false);
        filter.destroy();
    });

    it('hides the h3-less lockup ad card via its ad-details marker', async () => {
        const { filter } = await startYoutubeFilter({
            html: `
            <main>
                <yt-lockup-view-model data-case="lockup-ad">
                    <a href="/watch?v=lockupad">視聴する</a>
                    <span class="ytwAdDetailsLineViewModelHostTextStyleStandardBrowse">Some Brand PLC</span>
                    <span>How to start investing comfortably</span>
                </yt-lockup-view-model>
            </main>
        `,
        });
        expect(card('lockup-ad').classList.contains('jpdb-youtube-filtered')).toBe(true);
        filter.destroy();
    });
});

// A card whose title node the selectors do not recognize falls back to the
// whole-card text — which, under a Japanese UI locale, always contains
// metadata like 7.2万回視聴・4時間前. That chrome must not count as Japanese
// signal (an English shelf video stayed visible through it), while a real
// Japanese title in the same unrecognized markup must keep the card.
describe('whole-card title fallback ignores UI metadata', () => {
    it('hides an English card whose only Japanese text is view-count metadata', async () => {
        const { filter } = await startYoutubeFilter({
            html: `
            <main>
                <ytd-rich-item-renderer data-case="metadata-en">
                    <div>
                        <a class="thumbnail" href="/watch?v=meta-en"><img alt=""></a>
                        <div class="unrecognized-title-shell">The FIFA World Cup Husband Hunt</div>
                        <span>7.2万回視聴・4時間前</span>
                    </div>
                </ytd-rich-item-renderer>
                <ytd-rich-item-renderer data-case="metadata-jp">
                    <div>
                        <a class="thumbnail" href="/watch?v=meta-jp"><img alt=""></a>
                        <div class="unrecognized-title-shell">東京の朝ごはん散歩</div>
                        <span>7.2万回視聴・4時間前</span>
                    </div>
                </ytd-rich-item-renderer>
            </main>
        `,
        });
        expect(card('metadata-en').classList.contains('jpdb-youtube-filtered')).toBe(true);
        expect(card('metadata-jp').classList.contains('jpdb-youtube-filtered')).toBe(false);
        filter.destroy();
    });

    it('does not let Yomu ruby readings make an English card look Japanese', async () => {
        const { filter } = await startYoutubeFilter({
            html: `
            <main>
                <ytd-rich-item-renderer data-case="annotated-en">
                    <div>
                        <a class="thumbnail" href="/watch?v=annotated"><img alt=""></a>
                        <div class="unrecognized-title-shell">Top 10 productivity hacks<span class="jpdb-reader-text-mirror" data-jpdb-reader-text-mirror="true"><ruby>散歩<rt class="jpdb-reader-furi">さんぽ</rt></ruby></span></div>
                    </div>
                </ytd-rich-item-renderer>
            </main>
        `,
        });
        expect(card('annotated-en').classList.contains('jpdb-youtube-filtered')).toBe(true);
        filter.destroy();
    });
});

// 2026-07-11: the notice's "hide" button must be a SESSION dismissal, not a
// silent permanent opt-out — and a search whose results are all non-Japanese
// must auto-reveal instead of spinning a hide/continuation filtering loop.
describe('notice dismissal and search auto-reveal', () => {
    it('hide-notice does not persist the setting off', async () => {
        const { filter, settings } = await startYoutubeFilter({
            html: `
            <main>
                <ytd-rich-item-renderer data-case="en">
                    <a id="video-title" href="/watch?v=en1">English only video</a>
                </ytd-rich-item-renderer>
            </main>
        `,
        });
        const hide = document.querySelector<HTMLButtonElement>('.jpdb-youtube-filter-bar [data-action="hide-notice"]');
        expect(hide).toBeTruthy();
        hide!.click();
        expect(settings.youtubeShowFilterNotice).toBe(true);
        expect(document.querySelector('.jpdb-youtube-filter-bar')).toBeNull();
        filter.destroy();
    });

    it('auto-reveals an all-filtered search results page', async () => {
        const cards = Array.from({ length: 9 }, (_, i) => `
            <ytd-video-renderer data-case="en-${i}">
                <a id="video-title" href="/watch?v=en${i}">English search result ${i}</a>
            </ytd-video-renderer>`).join('');
        const { filter } = await startYoutubeFilter({
            location: {
                href: 'https://www.youtube.com/results?search_query=fifa',
                origin: 'https://www.youtube.com',
                hostname: 'www.youtube.com',
                pathname: '/results',
                search: '?search_query=fifa',
            },
            html: `<main>${cards}</main>`,
        });
        const hidden = document.querySelectorAll('.jpdb-youtube-filtered').length;
        expect(hidden).toBe(0);
        filter.destroy();
    });

    it('keeps filtering a search page that still has Japanese results', async () => {
        const cards = Array.from({ length: 9 }, (_, i) => `
            <ytd-video-renderer data-case="en-${i}">
                <a id="video-title" href="/watch?v=en${i}">English search result ${i}</a>
            </ytd-video-renderer>`).join('');
        const { filter } = await startYoutubeFilter({
            location: {
                href: 'https://www.youtube.com/results?search_query=fifa',
                origin: 'https://www.youtube.com',
                hostname: 'www.youtube.com',
                pathname: '/results',
                search: '?search_query=fifa',
            },
            html: `<main>${cards}<ytd-video-renderer data-case="jp"><a id="video-title" href="/watch?v=jp1">日本語の動画</a></ytd-video-renderer></main>`,
        });
        expect(document.querySelectorAll('.jpdb-youtube-filtered').length).toBe(9);
        expect(card('jp').classList.contains('jpdb-youtube-filtered')).toBe(false);
        filter.destroy();
    });
});

describe('YouTube target-language detection', () => {
    // The Japanese detector deliberately strips Japanese-locale YouTube chrome before
    // deciding, because a card whose ONLY Japanese characters are a view count must
    // still read as non-Japanese (the 2026-07-11 "EN videos should be hidden" report).
    // Swapping in a per-target detector must not lose that.
    it('keeps stripping Japanese YouTube chrome for a Japanese target', () => {
        const detect = youTubeTargetLanguageDetector(true, () => true);
        expect(detect('Best of 2024 · 7.2万回視聴・4時間前')).toBe(false);
        expect(detect('日本語の聞き取り練習')).toBe(true);
    });

    it('asks the active target about its own language, not about Japanese', () => {
        const cyrillic = (text: string) => /[\u0400-\u04ff]/.test(text);
        const detect = youTubeTargetLanguageDetector(false, cyrillic);
        expect(detect('Русский язык для начинающих')).toBe(true);
        expect(detect('日本語の聞き取り練習')).toBe(false);
        expect(detect('Learn Russian in 10 minutes')).toBe(false);
    });

    // A target's own locale chrome is NOT in the Japanese strip list, so a card whose
    // only target-language text is a view count still reads as the target language.
    // The failure direction is under-filtering -- an extra foreign video stays visible --
    // which is why this is recorded rather than treated as a blocker (A48 residual).
    it('records that per-target UI chrome is not yet stripped', () => {
        const cyrillic = (text: string) => /[\u0400-\u04ff]/.test(text);
        const detect = youTubeTargetLanguageDetector(false, cyrillic);
        expect(detect('Best of 2024 · 1,2 млн просмотров')).toBe(true);
    });
});

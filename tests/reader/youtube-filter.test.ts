import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import { YOUTUBE_CHANNEL_RECOMMENDATION_COUNT } from '../../src/reader/youtube-channel-recommendations';
import { classifyYouTubeFilterCandidates } from '../../src/reader/youtube-filter-scan';
import {
    YoutubeImmersionFilter,
    collectYouTubeVideoCards,
    isProbablyJapaneseYouTubeText,
} from '../../src/reader/youtube';
import type { ReaderSettings } from '../../src/reader/types';

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

interface StartYoutubeFilterOptions {
    html?: string;
    location?: StubbedLocation;
    oEmbedTitles?: Record<string, string>;
    settings?: ReaderSettings;
    setShowChannelRecommendations?: (visible: boolean) => void;
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
    setShowChannelRecommendations,
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

    const filter = createYoutubeFilter(() => settings, { setShowChannelRecommendations });
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
    for (let i = 0; i < 10; i += 1) {
        await settlePromises();
        await vi.advanceTimersByTimeAsync(25);
    }
}

async function settlePromises(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
}

describe('YouTube immersion filter', () => {
    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        sessionStorage.clear();
        document.body.replaceChildren();
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

    it('nudges YouTube continuation loading when filtering leaves too few visible videos', async () => {
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
        const { filter } = await startYoutubeFilter({
            oEmbedTitles: { jp: '日本語で花の名前を覚える' },
        });

        expect(card('english-1').classList.contains('jpdb-youtube-filtered')).toBe(true);
        expect(card('english-2').classList.contains('jpdb-youtube-filtered')).toBe(true);
        expect(scrollIntoView).toHaveBeenCalledWith({ block: 'end' });

        filter.destroy();
    });

    it('masks newly appended videos before the delayed filter scan collapses them', async () => {
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
        expect(fetchMock).toHaveBeenCalledTimes(5);

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
        const { filter, settings } = await startYoutubeFilter({
            oEmbedTitles: {
                jp: '日本語で花の名前を覚える',
                en: '10 habits for studying',
                channel: 'study with me',
                translated: '37,000 Lines of Slop',
                modern: '東京カフェで朝ごはん',
            },
        });

        expect(card('jp').classList.contains('jpdb-youtube-filtered')).toBe(false);
        expect(card('english').classList.contains('jpdb-youtube-filtered')).toBe(true);
        expect(card('channel-only').classList.contains('jpdb-youtube-filtered')).toBe(true);
        expect(card('translated-english').classList.contains('jpdb-youtube-filtered')).toBe(true);
        expect(card('modern-lockup').classList.contains('jpdb-youtube-filtered')).toBe(false);
        expect(document.querySelector('.jpdb-youtube-filter-bar')?.textContent).toContain('hid 3');
        expect(document.querySelector('.jpdb-youtube-filter-bar')?.textContent).toContain('Show hidden videos');

        document.querySelector<HTMLButtonElement>('[data-action="toggle-hidden"]')!.click();
        await vi.advanceTimersByTimeAsync(0);

        expect(card('english').classList.contains('jpdb-youtube-filtered')).toBe(false);
        expect(document.querySelector('.jpdb-youtube-filter-bar')?.textContent).toContain('Hide hidden videos');

        document.querySelector<HTMLButtonElement>('[data-action="toggle-hidden"]')!.click();
        await vi.advanceTimersByTimeAsync(0);

        expect(card('english').classList.contains('jpdb-youtube-filtered')).toBe(true);

        document.querySelector<HTMLButtonElement>('[data-action="hide-notice"]')!.click();
        await vi.advanceTimersByTimeAsync(0);

        expect(settings.youtubeImmersionEnabled).toBe(true);
        expect(card('english').classList.contains('jpdb-youtube-filtered')).toBe(true);
        expect(document.querySelector('.jpdb-youtube-filter-bar')).toBeNull();

        filter.destroy();
    });

    it('offers a 100-channel starter guide with subscribe links and expandable filters', async () => {
        expect(YOUTUBE_CHANNEL_RECOMMENDATION_COUNT).toBe(100);

        const { filter } = await startYoutubeFilter({
            oEmbedTitles: {
                en: '10 habits for studying',
            },
            html: `
            <main>
                <ytd-rich-item-renderer data-case="english">
                    <a id="video-title" href="/watch?v=en">10 habits for studying</a>
                </ytd-rich-item-renderer>
            </main>
        `,
        });

        const guide = document.querySelector<HTMLElement>('.jpdb-youtube-channel-guide')!;
        expect(guide).not.toBeNull();
        expect(guide.textContent).toContain('100 curated channels');
        expect(guide.textContent).toContain('Start your Japanese YouTube feed');
        expect(guide.querySelectorAll('.jpdb-youtube-channel-card')).toHaveLength(6);
        expect(guide.querySelector<HTMLAnchorElement>('.jpdb-youtube-channel-subscribe')?.href).toContain('sub_confirmation=1');

        guide.querySelector<HTMLButtonElement>('[data-yomu-youtube-channel-action="expand"]')!.click();
        await vi.advanceTimersByTimeAsync(0);
        await settlePromises();

        const expandedGuide = document.querySelector<HTMLElement>('.jpdb-youtube-channel-guide')!;
        expect(expandedGuide.classList.contains('is-expanded')).toBe(true);
        expect(expandedGuide.querySelectorAll('.jpdb-youtube-channel-card')).toHaveLength(100);
        expect(expandedGuide.textContent).toContain('にほんごのじかん');

        expandedGuide.querySelector<HTMLButtonElement>('[data-yomu-youtube-channel-action="filter"][data-filter="kids"]')!.click();
        await vi.advanceTimersByTimeAsync(0);
        await settlePromises();

        expect(document.querySelector<HTMLElement>('.jpdb-youtube-channel-guide')?.textContent).toContain('しまじろうチャンネル');

        filter.destroy();
    });

    it('lets users dismiss channel suggestions for now or never show them again', async () => {
        const settings = youtubeFilterSettings();
        const { filter } = await startYoutubeFilter({
            settings,
            setShowChannelRecommendations: visible => {
                settings.youtubeShowChannelRecommendations = visible;
            },
            html: `
            <main>
                <ytd-rich-item-renderer data-case="english">
                    <a id="video-title" href="/watch?v=en">10 habits for studying</a>
                </ytd-rich-item-renderer>
            </main>
        `,
        });

        expect(document.querySelector('.jpdb-youtube-channel-guide')).not.toBeNull();

        document.querySelector<HTMLButtonElement>('[data-yomu-youtube-channel-action="close"]')!.click();
        await vi.advanceTimersByTimeAsync(0);
        expect(settings.youtubeShowChannelRecommendations).toBe(true);
        expect(document.querySelector('.jpdb-youtube-channel-guide')).toBeNull();

        filter.refresh();
        await flushPendingFilterWork();
        expect(document.querySelector('.jpdb-youtube-channel-guide')).toBeNull();

        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/results?search_query=nihongo',
            origin: 'https://www.youtube.com',
            hostname: 'www.youtube.com',
            pathname: '/results',
            search: '?search_query=nihongo',
        });
        filter.refresh();
        await flushPendingFilterWork();
        expect(document.querySelector('.jpdb-youtube-channel-guide')).not.toBeNull();

        document.querySelector<HTMLButtonElement>('[data-yomu-youtube-channel-action="never"]')!.click();
        await vi.advanceTimersByTimeAsync(0);
        expect(settings.youtubeShowChannelRecommendations).toBe(false);
        expect(document.querySelector('.jpdb-youtube-channel-guide')).toBeNull();

        filter.refresh();
        await flushPendingFilterWork();
        expect(document.querySelector('.jpdb-youtube-channel-guide')).toBeNull();

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

    it('auto-dismisses the hidden-video notice like a toast', async () => {
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

        expect(document.querySelector('.jpdb-youtube-filter-bar')).toBeNull();
        expect(card('english').classList.contains('jpdb-youtube-filtered')).toBe(true);

        filter.destroy();
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

        await vi.advanceTimersByTimeAsync(4200);

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

    it('leaves the Shorts watch feed visible so snap scrolling can continue', async () => {
        const { filter } = await startYoutubeFilter({
            location: {
                href: 'https://www.youtube.com/shorts/abc123',
                origin: 'https://www.youtube.com',
                hostname: 'www.youtube.com',
                pathname: '/shorts/abc123',
                search: '',
            },
            html: `
            <ytd-shorts>
                <ytd-reel-video-renderer data-case="shorts-feed" class="jpdb-youtube-filtered" data-yomu-youtube-filtered="true">
                    <a id="video-title" href="/shorts/abc123">English short</a>
                </ytd-reel-video-renderer>
            </ytd-shorts>
        `,
            wait: 'timer-tick',
        });

        expect(card('shorts-feed').classList.contains('jpdb-youtube-filtered')).toBe(false);
        expect(collectYouTubeVideoCards(document)).toHaveLength(0);
        expect(document.querySelector('.jpdb-youtube-filter-bar')).toBeNull();

        filter.destroy();
    });

    it('leaves mobile Shorts watch lockups visible so snap scrolling can continue', async () => {
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
        `,
            wait: 'timer-tick',
        });

        expect(card('mobile-shorts-feed').classList.contains('jpdb-youtube-filtered')).toBe(false);
        expect(collectYouTubeVideoCards(document)).toHaveLength(0);
        expect(document.querySelector('.jpdb-youtube-filter-bar')).toBeNull();

        filter.destroy();
    });

    it('unwraps reader words from the YouTube watch title so SPA navigation can replace it cleanly', async () => {
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

        expect(document.querySelector('ytd-watch-metadata h1 .jpdb-reader-word')).toBeNull();
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
});

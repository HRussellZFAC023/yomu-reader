import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS as BASE_DEFAULT_SETTINGS } from '../../src/reader/settings/index';

// These tests assert English UI copy; pin the interface language since the
// shipped default is now 'ja'.
const DEFAULT_SETTINGS: typeof BASE_DEFAULT_SETTINGS = { ...BASE_DEFAULT_SETTINGS, interfaceLanguage: 'en' };
import { YOUTUBE_CHANNEL_RECOMMENDATION_COUNT } from '../../src/reader/subtitles/youtube-channel-recommendations';
import { classifyYouTubeFilterCandidates } from '../../src/reader/subtitles/youtube-filter-scan';
import {
    YoutubeImmersionFilter,
    collectYouTubeVideoCards,
    isProbablyJapaneseYouTubeText,
    rebalanceYouTubeGridRows,
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

    const filter = createYoutubeFilter(() => settings, filterOptions);
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

    it('renders channel suggestions as an inline YouTube-style shelf instead of a popup card panel', async () => {
        expect(YOUTUBE_CHANNEL_RECOMMENDATION_COUNT).toBe(100);
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

        const shelf = document.querySelector<HTMLElement>('.jpdb-youtube-channel-shelf')!;
        expect(shelf).not.toBeNull();
        expect(shelf.parentElement?.tagName.toLowerCase()).toBe('main');
        expect(shelf.textContent).toContain('Start your Japanese YouTube feed');
        expect(shelf.textContent).toContain('100 curated channels');
        expect(shelf.querySelectorAll('.jpdb-youtube-channel-row')).toHaveLength(8);
        expect(document.querySelector('.jpdb-youtube-channel-guide')).toBeNull();
        expect(shelf.querySelector<HTMLElement>('[aria-live="polite"]')?.textContent).toContain('Subscribe here');

        shelf.querySelector<HTMLButtonElement>('[data-yomu-youtube-channel-action="expand"]')!.click();
        await vi.advanceTimersByTimeAsync(0);
        await settlePromises();

        const expanded = document.querySelector<HTMLElement>('.jpdb-youtube-channel-shelf')!;
        expect(expanded.classList.contains('is-expanded')).toBe(true);
        expect(expanded.querySelectorAll('.jpdb-youtube-channel-row')).toHaveLength(100);
        expect(expanded.textContent).toContain('にほんごのじかん');

        expanded.querySelector<HTMLButtonElement>('[data-yomu-youtube-channel-action="filter"][data-filter="kids"]')!.click();
        await vi.advanceTimersByTimeAsync(0);
        await settlePromises();

        const filtered = document.querySelector<HTMLElement>('.jpdb-youtube-channel-shelf')!;
        expect(filtered.textContent).toContain('しまじろうチャンネル');
        expect(filtered.querySelector<HTMLButtonElement>('[data-filter="kids"]')?.getAttribute('aria-pressed')).toBe('true');

        filter.destroy();
    });

    it('lets users dismiss channel suggestions for the route or hide them permanently', async () => {
        const settings = youtubeFilterSettings();
        renderYouTubeCards();
        const { filter } = await startYoutubeFilter({
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

        document.querySelector<HTMLButtonElement>('[data-yomu-youtube-channel-action="dismiss"]')!.click();
        await vi.advanceTimersByTimeAsync(0);

        expect(settings.youtubeShowChannelRecommendations).toBe(true);
        expect(document.querySelector('.jpdb-youtube-channel-shelf')).toBeNull();

        filter.refresh();
        await flushPendingFilterWork();

        expect(document.querySelector('.jpdb-youtube-channel-shelf')).toBeNull();

        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/results?search_query=nihongo',
            origin: 'https://www.youtube.com',
            hostname: 'www.youtube.com',
            pathname: '/results',
            search: '?search_query=nihongo',
        });
        filter.refresh();
        await flushPendingFilterWork();

        expect(document.querySelector('.jpdb-youtube-channel-shelf')).not.toBeNull();

        document.querySelector<HTMLButtonElement>('[data-yomu-youtube-channel-action="never"]')!.click();
        await vi.advanceTimersByTimeAsync(0);

        expect(settings.youtubeShowChannelRecommendations).toBe(false);
        expect(document.querySelector('.jpdb-youtube-channel-shelf')).toBeNull();

        filter.refresh();
        await flushPendingFilterWork();

        expect(document.querySelector('.jpdb-youtube-channel-shelf')).toBeNull();

        filter.destroy();
    });

    it('subscribes to all recommended channels through the current YouTube page session', async () => {
        const subscriptionBodies: unknown[] = [];
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
        vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
            const url = String(input);
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
                    }),
                };
            }
            if (url.includes('/youtubei/v1/subscription/subscribe')) {
                subscriptionBodies.push(JSON.parse(String(init?.body ?? '{}')));
                return { ok: true, json: async () => ({}) };
            }
            return { ok: false, json: async () => ({}) };
        }));
        renderYouTubeCards();
        const { filter } = await startYoutubeFilter({ wait: 'flush-work' });

        document.querySelector<HTMLButtonElement>('[data-yomu-youtube-channel-action="subscribe-all"]')!.click();
        await flushPendingFilterWork();
        for (let i = 0; i < YOUTUBE_CHANNEL_RECOMMENDATION_COUNT; i += 1) {
            await settlePromises();
        }

        expect(subscriptionBodies).toHaveLength(YOUTUBE_CHANNEL_RECOMMENDATION_COUNT);
        expect(subscriptionBodies[0]).toMatchObject({
            channelIds: ['UC12345678901234567890'],
            context: { client: { clientName: 'WEB', clientVersion: 'test-version' } },
        });
        expect(document.querySelector<HTMLElement>('[data-role="channel-status"]')?.textContent).toBe('Subscribed to 100 channels.');

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

    it('filters non-current Shorts watch items while leaving the snap item visible', async () => {
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
                <ytd-reel-video-renderer data-case="shorts-next-en">
                    <a id="video-title" href="/shorts/en-next">Desk setup Short</a>
                </ytd-reel-video-renderer>
                <ytd-reel-video-renderer data-case="shorts-next-jp">
                    <a id="video-title" href="/shorts/jp-next">東京駅で迷子になる</a>
                </ytd-reel-video-renderer>
            </ytd-shorts>
        `,
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

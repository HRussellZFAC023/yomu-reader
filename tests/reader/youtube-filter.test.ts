import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS } from '../../src/reader/settings';
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

    it('hides the outer rich-grid slot for nested modern lockup cards', async () => {
        vi.useFakeTimers();
        stubOEmbedTitles({ modern: '10 habits for studying' });
        document.body.innerHTML = `
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
        `;
        const settings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            youtubeImmersionEnabled: true,
            youtubeShowFilterNotice: true,
        };
        const filter = new YoutubeImmersionFilter({
            getSettings: () => settings,
            isActivePage: () => true,
        });

        filter.init();
        await runInitialFilterScan();

        expect(collectYouTubeVideoCards(document)).toEqual([card('outer-modern')]);
        expect(card('outer-modern').classList.contains('jpdb-youtube-filtered')).toBe(true);
        expect(card('inner-modern').classList.contains('jpdb-youtube-filtered')).toBe(false);
        expect(document.querySelector('.jpdb-youtube-filter-bar')?.textContent).toContain('hid 1');

        filter.destroy();
    });

    it('nudges YouTube continuation loading when filtering leaves too few visible videos', async () => {
        vi.useFakeTimers();
        stubOEmbedTitles({ jp: '日本語で花の名前を覚える' });
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
        const settings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            youtubeImmersionEnabled: true,
            youtubeShowFilterNotice: true,
        };
        const filter = new YoutubeImmersionFilter({
            getSettings: () => settings,
            isActivePage: () => true,
        });

        filter.init();
        await runInitialFilterScan();

        expect(card('english-1').classList.contains('jpdb-youtube-filtered')).toBe(true);
        expect(card('english-2').classList.contains('jpdb-youtube-filtered')).toBe(true);
        expect(scrollIntoView).toHaveBeenCalledWith({ block: 'end' });

        filter.destroy();
    });

    it('hides playlist and mix tiles instead of leaving them in the filtered feed', async () => {
        vi.useFakeTimers();
        stubOEmbedTitles({ 'playlist-jp': '東京を散歩する' });
        document.body.innerHTML = `
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
        `;
        const settings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            youtubeImmersionEnabled: true,
            youtubeShowFilterNotice: true,
        };
        const filter = new YoutubeImmersionFilter({
            getSettings: () => settings,
            isActivePage: () => true,
        });

        filter.init();
        await runInitialFilterScan();

        expect(card('jp').classList.contains('jpdb-youtube-filtered')).toBe(false);
        expect(card('playlist').classList.contains('jpdb-youtube-filtered')).toBe(true);
        expect(card('mix-lockup').classList.contains('jpdb-youtube-filtered')).toBe(true);
        expect(document.querySelector('.jpdb-youtube-filter-bar')?.textContent).toContain('hid 2');

        filter.destroy();
    });

    it('keeps normal videos visible when their title aria-label contains mix', async () => {
        vi.useFakeTimers();
        stubOEmbedTitles({ music: '東京で Lo-fi mix を聴く' });
        document.body.innerHTML = `
            <main>
                <ytd-rich-item-renderer data-case="music">
                    <a id="video-title" href="/watch?v=music" aria-label="東京で Lo-fi mix を聴く">東京で Lo-fi mix を聴く</a>
                </ytd-rich-item-renderer>
            </main>
        `;
        const settings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            youtubeImmersionEnabled: true,
            youtubeShowFilterNotice: true,
        };
        const filter = new YoutubeImmersionFilter({
            getSettings: () => settings,
            isActivePage: () => true,
        });

        filter.init();
        await runInitialFilterScan();

        expect(collectYouTubeVideoCards(document)).toEqual([card('music')]);
        expect(card('music').classList.contains('jpdb-youtube-filtered')).toBe(false);
        expect(document.querySelector('.jpdb-youtube-filter-bar')).toBeNull();

        filter.destroy();
    });

    it('keeps Japanese-looking translated titles visible while original title lookup is pending', async () => {
        vi.useFakeTimers();
        const translated = deferred<{ ok: boolean; json: () => Promise<{ title: string }> }>();
        const fetchMock = vi.fn(async (input: string | URL | Request) => {
            const url = new URL(String(input));
            const watchUrl = new URL(url.searchParams.get('url') ?? 'https://www.youtube.com/watch');
            const videoId = watchUrl.searchParams.get('v') ?? '';
            if (videoId === 'translated') return translated.promise;
            return {
                ok: true,
                json: async () => ({ title: videoId === 'modern' ? '東京カフェで朝ごはん' : '日本語で花の名前を覚える' }),
            };
        });
        vi.stubGlobal('fetch', fetchMock);
        renderYouTubeCards();
        const settings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            youtubeImmersionEnabled: true,
            youtubeShowFilterNotice: true,
        };
        const filter = new YoutubeImmersionFilter({
            getSettings: () => settings,
            isActivePage: () => true,
        });

        filter.init();
        await flushPendingFilterWork();

        expect(card('english').classList.contains('jpdb-youtube-filtered')).toBe(true);
        expect(card('channel-only').classList.contains('jpdb-youtube-filtered')).toBe(true);
        expect(card('translated-english').classList.contains('jpdb-youtube-filtered')).toBe(false);
        expect(fetchMock).toHaveBeenCalledTimes(3);

        translated.resolve({
            ok: true,
            json: async () => ({ title: '37,000 Lines of Slop' }),
        });
        await flushPendingFilterWork();

        expect(card('translated-english').classList.contains('jpdb-youtube-filtered')).toBe(true);

        filter.destroy();
    });

    it('hides non-Japanese-looking cards using original YouTube titles and supports reveal controls', async () => {
        vi.useFakeTimers();
        stubOEmbedTitles({
            jp: '日本語で花の名前を覚える',
            en: '10 habits for studying',
            channel: 'study with me',
            translated: '37,000 Lines of Slop',
            modern: '東京カフェで朝ごはん',
        });
        renderYouTubeCards();
        let settings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            youtubeImmersionEnabled: true,
            youtubeShowFilterNotice: true,
        };
        let filter!: YoutubeImmersionFilter;
        filter = new YoutubeImmersionFilter({
            getSettings: () => settings,
            isActivePage: () => true,
        });

        filter.init();
        await runInitialFilterScan();

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

    it('adds the JSON oEmbed format and caches failed title lookups', async () => {
        vi.useFakeTimers();
        const fetchMock = vi.fn(async (_input: string | URL | Request) => ({
            ok: false,
            json: async () => ({}),
        }));
        vi.stubGlobal('fetch', fetchMock);
        document.body.innerHTML = `
            <main>
                <ytd-rich-item-renderer data-case="jp">
                    <a id="video-title" href="/watch?v=jp">花の名前</a>
                </ytd-rich-item-renderer>
            </main>
        `;
        const settings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            youtubeImmersionEnabled: true,
            youtubeShowFilterNotice: true,
        };
        const filter = new YoutubeImmersionFilter({
            getSettings: () => settings,
            isActivePage: () => true,
        });

        filter.init();
        await runInitialFilterScan();

        expect(String(fetchMock.mock.calls[0][0])).toContain('format=json');
        expect(fetchMock).toHaveBeenCalledTimes(1);

        filter.refresh();
        await flushPendingFilterWork();

        expect(fetchMock).toHaveBeenCalledTimes(1);

        filter.destroy();
    });

    it('auto-dismisses the hidden-video notice like a toast', async () => {
        vi.useFakeTimers();
        stubOEmbedTitles({
            jp: '日本語で花の名前を覚える',
            en: '10 habits for studying',
            channel: 'study with me',
            translated: '37,000 Lines of Slop',
            modern: '東京カフェで朝ごはん',
        });
        renderYouTubeCards();
        const settings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            youtubeImmersionEnabled: true,
            youtubeShowFilterNotice: true,
        };
        const filter = new YoutubeImmersionFilter({
            getSettings: () => settings,
            isActivePage: () => true,
        });

        filter.init();
        await runInitialFilterScan();

        expect(document.querySelector('.jpdb-youtube-filter-bar')).not.toBeNull();

        await vi.advanceTimersByTimeAsync(4200);

        expect(document.querySelector('.jpdb-youtube-filter-bar')).toBeNull();
        expect(card('english').classList.contains('jpdb-youtube-filtered')).toBe(true);

        filter.destroy();
    });

    it('does not keep reopening the notice as more cards are filtered on the same route', async () => {
        vi.useFakeTimers();
        stubOEmbedTitles({});
        document.body.innerHTML = `
            <main>
                <ytd-rich-item-renderer data-case="english">
                    <a id="video-title" href="/watch?v=en">10 habits for studying</a>
                </ytd-rich-item-renderer>
            </main>
        `;
        const settings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            youtubeImmersionEnabled: true,
            youtubeShowFilterNotice: true,
        };
        const filter = new YoutubeImmersionFilter({
            getSettings: () => settings,
            isActivePage: () => true,
        });

        filter.init();
        await runInitialFilterScan();

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
        vi.useFakeTimers();
        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/shorts/abc123',
            origin: 'https://www.youtube.com',
            hostname: 'www.youtube.com',
            pathname: '/shorts/abc123',
            search: '',
        });
        document.body.innerHTML = `
            <ytd-shorts>
                <ytd-reel-video-renderer data-case="shorts-feed" class="jpdb-youtube-filtered" data-yomu-youtube-filtered="true">
                    <a id="video-title" href="/shorts/abc123">English short</a>
                </ytd-reel-video-renderer>
            </ytd-shorts>
        `;
        const settings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            youtubeImmersionEnabled: true,
            youtubeShowFilterNotice: true,
        };
        const filter = new YoutubeImmersionFilter({
            getSettings: () => settings,
            isActivePage: () => true,
        });

        filter.init();
        await vi.advanceTimersByTimeAsync(0);

        expect(card('shorts-feed').classList.contains('jpdb-youtube-filtered')).toBe(false);
        expect(collectYouTubeVideoCards(document)).toHaveLength(0);
        expect(document.querySelector('.jpdb-youtube-filter-bar')).toBeNull();

        filter.destroy();
    });

    it('unwraps reader words from the YouTube watch title so SPA navigation can replace it cleanly', async () => {
        vi.useFakeTimers();
        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/watch?v=current',
            origin: 'https://www.youtube.com',
            hostname: 'www.youtube.com',
            pathname: '/watch',
            search: '?v=current',
        });
        document.body.innerHTML = `
            <ytd-watch-metadata>
                <h1><yt-formatted-string><span class="jpdb-reader-word jpdb-known">古い動画</span>タイトル</yt-formatted-string></h1>
            </ytd-watch-metadata>
        `;
        const settings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            youtubeImmersionEnabled: true,
            youtubeShowFilterNotice: true,
        };
        const filter = new YoutubeImmersionFilter({
            getSettings: () => settings,
            isActivePage: () => true,
        });

        filter.init();
        await vi.advanceTimersByTimeAsync(0);

        expect(document.querySelector('ytd-watch-metadata h1 .jpdb-reader-word')).toBeNull();
        expect(document.querySelector('ytd-watch-metadata h1')?.textContent).toBe('古い動画タイトル');

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
        let settings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            youtubeImmersionEnabled: false,
            youtubeShowFilterNotice: true,
        };
        let filter!: YoutubeImmersionFilter;
        filter = new YoutubeImmersionFilter({
            getSettings: () => settings,
            isActivePage: () => true,
        });

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

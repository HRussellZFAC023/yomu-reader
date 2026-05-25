import { afterEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import {
    YoutubeImmersionFilter,
    collectYouTubeVideoCards,
    isProbablyJapaneseYouTubeText,
    readYouTubeCardText,
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

async function runInitialFilterScan(): Promise<void> {
    await vi.advanceTimersByTimeAsync(300);
    await flushPendingFilterWork();
}

async function flushPendingFilterWork(): Promise<void> {
    for (let i = 0; i < 10; i += 1) {
        await settlePromises();
        await vi.advanceTimersByTimeAsync(1);
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
        document.body.replaceChildren();
    });

    it('reads video card titles without treating Japanese channel names as Japanese videos', () => {
        renderYouTubeCards();

        const cards = collectYouTubeVideoCards(document);

        expect(cards).toHaveLength(5);
        expect(isProbablyJapaneseYouTubeText(readYouTubeCardText(cards[0]))).toBe(true);
        expect(isProbablyJapaneseYouTubeText(readYouTubeCardText(cards[1]))).toBe(false);
        expect(isProbablyJapaneseYouTubeText(readYouTubeCardText(cards[2]))).toBe(false);
        expect(isProbablyJapaneseYouTubeText(readYouTubeCardText(cards[3]))).toBe(true);
        expect(readYouTubeCardText(cards[4])).toBe('東京カフェで朝ごはん');
        expect(isProbablyJapaneseYouTubeText(readYouTubeCardText(cards[4]))).toBe(true);
        expect(isProbablyJapaneseYouTubeText('日本語')).toBe(false);
        expect(isProbablyJapaneseYouTubeText('fypシ゚')).toBe(false);
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

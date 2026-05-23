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

describe('YouTube immersion filter', () => {
    afterEach(() => {
        vi.useRealTimers();
        document.body.replaceChildren();
    });

    it('reads video card titles without treating Japanese channel names as Japanese videos', () => {
        renderYouTubeCards();

        const cards = collectYouTubeVideoCards(document);

        expect(cards).toHaveLength(4);
        expect(isProbablyJapaneseYouTubeText(readYouTubeCardText(cards[0]))).toBe(true);
        expect(isProbablyJapaneseYouTubeText(readYouTubeCardText(cards[1]))).toBe(false);
        expect(isProbablyJapaneseYouTubeText(readYouTubeCardText(cards[2]))).toBe(false);
        expect(readYouTubeCardText(cards[3])).toBe('東京カフェで朝ごはん');
        expect(isProbablyJapaneseYouTubeText(readYouTubeCardText(cards[3]))).toBe(true);
    });

    it('hides non-Japanese-looking cards and supports reveal and turn-off controls', () => {
        vi.useFakeTimers();
        renderYouTubeCards();
        let settings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            youtubeImmersionEnabled: true,
            youtubeShowFilterNotice: true,
        };
        let filter!: YoutubeImmersionFilter;
        filter = new YoutubeImmersionFilter({
            getSettings: () => settings,
            setEnabled: enabled => {
                settings = { ...settings, youtubeImmersionEnabled: enabled };
                filter.refresh();
            },
            isActivePage: () => true,
        });

        filter.init();
        vi.runOnlyPendingTimers();

        expect(card('jp').classList.contains('jpdb-youtube-filtered')).toBe(false);
        expect(card('english').classList.contains('jpdb-youtube-filtered')).toBe(true);
        expect(card('channel-only').classList.contains('jpdb-youtube-filtered')).toBe(true);
        expect(card('modern-lockup').classList.contains('jpdb-youtube-filtered')).toBe(false);
        expect(document.querySelector('.jpdb-youtube-filter-bar')?.textContent).toContain('hid 2');

        document.querySelector<HTMLButtonElement>('[data-action="show-anyway"]')!.click();
        vi.runOnlyPendingTimers();

        expect(card('english').classList.contains('jpdb-youtube-filtered')).toBe(false);
        expect(document.querySelector('.jpdb-youtube-filter-bar')?.textContent).toContain('Filter again');

        document.querySelector<HTMLButtonElement>('[data-action="show-anyway"]')!.click();
        vi.runOnlyPendingTimers();

        expect(card('english').classList.contains('jpdb-youtube-filtered')).toBe(true);

        document.querySelector<HTMLButtonElement>('[data-action="turn-off"]')!.click();
        vi.runOnlyPendingTimers();

        expect(settings.youtubeImmersionEnabled).toBe(false);
        expect(card('english').classList.contains('jpdb-youtube-filtered')).toBe(false);
        expect(document.querySelector('.jpdb-youtube-filter-bar')).toBeNull();

        filter.destroy();
    });

    it('does not observe or clear YouTube cards while the filter is disabled', () => {
        vi.useFakeTimers();
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
            setEnabled: enabled => {
                settings = { ...settings, youtubeImmersionEnabled: enabled };
                filter.refresh();
            },
            isActivePage: () => true,
        });

        try {
            filter.init();
            renderYouTubeCards();
            vi.runOnlyPendingTimers();

            expect(MutationObserverMock).not.toHaveBeenCalled();
            expect(card('english').classList.contains('jpdb-youtube-filtered')).toBe(false);
            expect(document.querySelector('.jpdb-youtube-filter-bar')).toBeNull();

            settings = { ...settings, youtubeImmersionEnabled: true };
            filter.refresh();
            vi.runOnlyPendingTimers();

            expect(MutationObserverMock).toHaveBeenCalledTimes(1);
            expect(observe).toHaveBeenCalledTimes(1);
            expect(card('english').classList.contains('jpdb-youtube-filtered')).toBe(true);

            settings = { ...settings, youtubeImmersionEnabled: false };
            filter.refresh();
            vi.runOnlyPendingTimers();

            expect(disconnect).toHaveBeenCalledTimes(1);
            expect(card('english').classList.contains('jpdb-youtube-filtered')).toBe(false);
        } finally {
            filter.destroy();
            vi.stubGlobal('MutationObserver', OriginalMutationObserver);
        }
    });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    applyTokensToScanTarget,
    makeRoomForRubyInCroppedRows,
    removeNonDestructiveScanMirrors,
    type ScanTextTarget,
} from '../../src/reader/dom';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';

function card(spelling: string, reading: string): JPDBCard {
    return {
        vid: spelling.charCodeAt(0), sid: spelling.charCodeAt(0), rid: 0, spelling, reading,
        frequencyRank: null, partOfSpeech: [], meanings: [], cardState: ['not-in-deck'],
        pitchAccent: [], wordWithReading: null, source: 'fallback',
    };
}

function token(surface: string, start: number, sentence: string, reading: string): JPDBToken {
    return {
        card: card(surface, reading), start, end: start + surface.length, length: surface.length,
        rubies: [{ text: reading, start, end: start + surface.length, length: surface.length }],
        pitchClass: 'heiban', sentence,
    };
}

function mockOverflow(element: HTMLElement, scrollHeight: number, clientHeight: number): void {
    Object.defineProperty(element, 'scrollHeight', { value: scrollHeight, configurable: true });
    Object.defineProperty(element, 'clientHeight', { value: clientHeight, configurable: true });
}

function mockRect(element: HTMLElement, rect: { width: number; height: number }): void {
    Object.defineProperty(element, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({ x: 0, y: 0, left: 0, top: 0, right: rect.width, bottom: rect.height, width: rect.width, height: rect.height, toJSON: () => ({}) }) as DOMRect,
    });
}

const TITLE = '元日本代表のプロなのになぜか余ってたゆきおとチームを組んで勝つ';
const FURI = { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' as const };

afterEach(() => {
    removeNonDestructiveScanMirrors(document);
    document.body.innerHTML = '';
    vi.unstubAllGlobals();
});

// 1.6.115 iPad home-feed blocker: clamped feed lockup titles (line-clamp:2,
// 22px lines, 44px box) were grown by ruby-room to their full unclamped
// mirror height (min-height:160px !important) and the mirror rendered the
// full 5-line text with at-rest ruby — 2.5x tile expansion. A clip-
// constrained row must get NO ruby-room growth and its mirror must stay
// within the host's clamp box.
describe('clamped feed titles never grow (1.6.115 blocker)', () => {
    function stubYouTube(): void {
        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/',
            origin: 'https://www.youtube.com',
            hostname: 'www.youtube.com',
            pathname: '/',
        });
    }

    it('keeps a line-clamped lockup title at its clamp box with visible detached readings', () => {
        stubYouTube();
        document.body.innerHTML = `
            <yt-lockup-view-model>
                <h3 class="ytLockupMetadataViewModelHeadingReset">
                    <a class="ytLockupMetadataViewModelTitle" href="/watch?v=x"
                       style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;max-height:44px;line-height:22px">
                        <span class="ytAttributedStringHost" style="line-height:22px">${TITLE}</span>
                    </a>
                </h3>
            </yt-lockup-view-model>
        `;
        const anchor = document.querySelector<HTMLElement>('a.ytLockupMetadataViewModelTitle')!;
        const host = document.querySelector<HTMLElement>('.ytAttributedStringHost')!;
        mockOverflow(anchor, 44, 44);
        mockRect(anchor, { width: 320, height: 44 });
        const target: ScanTextTarget = { node: host.firstChild as Text, parent: host, text: TITLE, nonDestructive: true };

        applyTokensToScanTarget(target, [token('代表', TITLE.indexOf('代表'), TITLE, 'だいひょう')], FURI);

        const mirror = host.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;
        expect(mirror).toBeTruthy();
        // Native text stays painted, while an additive mirror supplies a
        // visible detached reading without changing line metrics.
        expect(host.style.getPropertyValue('visibility')).not.toBe('hidden');
        expect(host.style.getPropertyValue('display')).toBe('');
        expect(host.dataset.yomuClipHoverHost).toBeUndefined();
        expect(mirror.classList.contains('jpdb-reader-additive-text-mirror')).toBe(true);
        expect(mirror.classList.contains('jpdb-reader-clip-hover-mirror')).toBe(false);
        expect(mirror.style.getPropertyValue('visibility')).toBe('visible');
        expect(mirror.style.maxHeight).toBe('44px');
        expect(mirror.style.overflow).toBe('visible');
        expect(mirror.dataset.yomuDetachedReadings).toBe('true');
        expect(mirror.querySelector('.jpdb-reader-detached-furi')?.textContent).toBe('だいひょう');
        // Host line metrics preserved (a ruby-friendly ~1.78em line-height
        // under the height cap over-clamped 2-line titles to one line).
        expect(mirror.style.lineHeight).toBe('22px');

        // The full unclamped mirror is taller than the box — ruby-room must
        // refuse to grow the clamped title anyway.
        mockOverflow(mirror, 110, 44);
        makeRoomForRubyInCroppedRows(document);
        makeRoomForRubyInCroppedRows(document);
        expect(anchor.style.minHeight).toBe('');
        expect(anchor.style.getPropertyValue('min-height')).toBe('');
        expect(anchor.dataset.yomuRubyRoom).toBeUndefined();
        expect(anchor.getBoundingClientRect().height).toBe(44);
        const h3 = document.querySelector<HTMLElement>('h3')!;
        expect(h3.dataset.yomuRubyRoom).toBeUndefined();
    });

    it('keeps a Shorts shelf title (fixed-height h3) at its box', () => {
        stubYouTube();
        document.body.innerHTML = `
            <ytm-shorts-lockup-view-model>
                <h3 id="shorts-title" style="overflow:hidden;height:40px;line-height:20px">
                    <span id="shorts-host">${TITLE}</span>
                </h3>
            </ytm-shorts-lockup-view-model>
        `;
        const h3 = document.querySelector<HTMLElement>('#shorts-title')!;
        const host = document.querySelector<HTMLElement>('#shorts-host')!;
        mockOverflow(h3, 40, 40);
        mockRect(h3, { width: 180, height: 40 });
        const target: ScanTextTarget = { node: host.firstChild as Text, parent: host, text: TITLE, nonDestructive: true };

        applyTokensToScanTarget(target, [token('代表', TITLE.indexOf('代表'), TITLE, 'だいひょう')], FURI);

        const mirror = host.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;
        expect(mirror).toBeTruthy();
        expect(mirror.style.maxHeight).toBe('40px');
        expect(mirror.style.overflow).toBe('visible');
        // Paint invariant: shorts title text keeps painting at rest.
        expect(host.style.getPropertyValue('visibility')).not.toBe('hidden');
        expect(mirror.style.getPropertyValue('visibility')).toBe('visible');
        expect(mirror.querySelector('.jpdb-reader-detached-furi')?.textContent).toBe('だいひょう');

        mockOverflow(mirror, 120, 40);
        makeRoomForRubyInCroppedRows(document);
        expect(h3.style.minHeight).toBe('');
        expect(h3.dataset.yomuRubyRoom).toBeUndefined();
        expect(h3.style.height).toBe('40px');
    });

    it('constrains an interactive-passive mirror to the host clamp box too', () => {
        stubYouTube();
        document.body.innerHTML = `
            <ytd-subscribe-button-renderer>
                <button id="sub" style="overflow:hidden;height:36px;white-space:nowrap;text-overflow:ellipsis">
                    <span id="sub-label">チャンネル登録</span>
                </button>
            </ytd-subscribe-button-renderer>
        `;
        const button = document.querySelector<HTMLElement>('#sub')!;
        const host = document.querySelector<HTMLElement>('#sub-label')!;
        mockOverflow(button, 36, 36);
        mockRect(button, { width: 129, height: 36 });
        const target: ScanTextTarget = {
            node: host.firstChild as Text, parent: host, text: 'チャンネル登録',
            nonDestructive: true, decoration: 'interactive-passive', suppressRuby: true, passiveInteraction: true,
        };

        applyTokensToScanTarget(target, [token('登録', 'チャンネル登録'.indexOf('登録'), 'チャンネル登録', 'とうろく')], FURI);

        const mirror = host.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;
        expect(mirror).toBeTruthy();
        expect(mirror.querySelector('rt')).toBeNull();
        expect(mirror.querySelector('.jpdb-reader-detached-furi')?.textContent).toBe('とうろく');
        expect(mirror.classList.contains('jpdb-reader-additive-text-mirror')).toBe(true);
        // No one-line-taller mirror poking below the pill.
        expect(mirror.style.maxHeight).toBe('36px');
    });
});

// Watch-metadata blocker (live 1.6.115 + first fix-build): #owner/#top-row/H1
// were grown to 111/153/78px by rest-hidden readings, and the clip-constrained
// mirror's ruby line-height under the clamp cap hid the subscriber count and
// over-clamped the title.
describe('watch metadata rows never grow and keep their base text painting', () => {
    function stubYouTube(): void {
        vi.stubGlobal('location', {
            href: 'https://www.youtube.com/watch?v=x',
            origin: 'https://www.youtube.com',
            hostname: 'www.youtube.com',
            pathname: '/watch',
        });
    }

    it('keeps the #owner flex row at its baseline height (channel name + subscriber count)', () => {
        stubYouTube();
        document.body.innerHTML = `
            <ytd-watch-metadata>
                <div id="top-row" style="display:flex">
                    <div id="owner" style="display:flex">
                        <a id="channel-name" href="/@ch" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;height:20px;line-height:20px">
                            <span id="channel-host" style="line-height:20px">日本語チャンネル</span>
                        </a>
                        <span id="owner-sub-count" style="display:block;height:18px;line-height:18px;overflow:hidden">チャンネル登録者数 1.72万人</span>
                    </div>
                </div>
            </ytd-watch-metadata>
        `;
        const owner = document.querySelector<HTMLElement>('#owner')!;
        const topRow = document.querySelector<HTMLElement>('#top-row')!;
        const anchor = document.querySelector<HTMLElement>('#channel-name')!;
        const host = document.querySelector<HTMLElement>('#channel-host')!;
        mockOverflow(anchor, 20, 20);
        mockRect(anchor, { width: 158, height: 20 });
        mockOverflow(owner, 42, 42);
        mockRect(owner, { width: 504, height: 42 });
        mockOverflow(topRow, 42, 42);
        const target: ScanTextTarget = { node: host.firstChild as Text, parent: host, text: '日本語チャンネル', nonDestructive: true };

        applyTokensToScanTarget(target, [token('日本語', 0, '日本語チャンネル', 'にほんご')], FURI);

        const mirror = host.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;
        expect(mirror).toBeTruthy();
        // Detached reading in an ellipsis row: host line metrics and native
        // base paint are preserved while the reading remains visible.
        expect(mirror.dataset.yomuDetachedReadings).toBe('true');
        expect(mirror.style.lineHeight).toBe('20px');
        expect(mirror.style.maxHeight).toBe('20px');
        expect(mirror.querySelector('.jpdb-reader-detached-furi')?.textContent).toBe('にほんご');
        // Paint invariant: channel name keeps painting; mirror is additive.
        expect(host.style.getPropertyValue('visibility')).not.toBe('hidden');
        expect(mirror.style.getPropertyValue('visibility')).toBe('visible');

        // The channel-name mirror is taller in scroll terms — the rest-hidden
        // reading must not grow #owner / #top-row / the anchor.
        mockOverflow(mirror, 42, 20);
        makeRoomForRubyInCroppedRows(document);
        makeRoomForRubyInCroppedRows(document);
        for (const box of [owner, topRow, anchor]) {
            expect(box.style.minHeight).toBe('');
            expect(box.style.getPropertyValue('min-height')).toBe('');
            expect(box.dataset.yomuRubyRoom).toBeUndefined();
        }
    });

    it('keeps a fixed metadata row unwritten with a detached at-rest reading', () => {
        stubYouTube();
        document.body.innerHTML = `
            <ytd-watch-metadata>
                <div class="ytContentMetadataViewModelMetadataRow" id="meta-row" style="overflow:hidden;height:22px;max-height:22px;line-height:22px">
                    <span id="meta-host" style="line-height:22px">3 か月前にライブ配信</span>
                </div>
            </ytd-watch-metadata>
        `;
        const row = document.querySelector<HTMLElement>('#meta-row')!;
        const host = document.querySelector<HTMLElement>('#meta-host')!;
        mockOverflow(row, 22, 22);
        mockRect(row, { width: 320, height: 22 });
        const text = '3 か月前にライブ配信';
        const target: ScanTextTarget = { node: host.firstChild as Text, parent: host, text, nonDestructive: true };

        applyTokensToScanTarget(target, [token('配信', text.indexOf('配信'), text, 'はいしん')], FURI);

        const mirror = host.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;
        expect(mirror).toBeTruthy();
        expect(mirror.style.getPropertyValue('visibility')).toBe('visible');
        expect(mirror.style.lineHeight).toBe('22px');
        expect(mirror.querySelector('.jpdb-reader-detached-furi')?.textContent).toBe('はいしん');
        expect(host.style.getPropertyValue('visibility')).not.toBe('hidden');

        mockOverflow(mirror, 42, 22);
        makeRoomForRubyInCroppedRows(document);
        makeRoomForRubyInCroppedRows(document);
        expect(row.style.minHeight).toBe('');
        expect(row.style.height).toBe('22px');
        expect(row.dataset.yomuRubyRoom).toBeUndefined();
    });

    it('keeps a clamp-2 watch H1 unwritten with a host-metric mirror', () => {
        stubYouTube();
        document.body.innerHTML = `
            <ytd-watch-metadata>
                <h1 id="watch-title" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;max-height:56px;line-height:28px">
                    <span id="title-host" style="line-height:28px">新卒エンジニアが一時間で天気予報アプリを作って学んだこと</span>
                </h1>
            </ytd-watch-metadata>
        `;
        const h1 = document.querySelector<HTMLElement>('#watch-title')!;
        const host = document.querySelector<HTMLElement>('#title-host')!;
        mockOverflow(h1, 56, 56);
        mockRect(h1, { width: 694, height: 56 });
        const text = '新卒エンジニアが一時間で天気予報アプリを作って学んだこと';
        const target: ScanTextTarget = { node: host.firstChild as Text, parent: host, text, nonDestructive: true };

        applyTokensToScanTarget(target, [token('新卒', 0, text, 'しんそつ')], FURI);

        const mirror = host.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;
        // Host-metric additive mirror: title text and detached reading paint
        // at rest without lifting the clamp or growing the H1.
        expect(mirror.style.lineHeight).toBe('28px');
        expect(mirror.style.maxHeight).toBe('56px');
        expect(host.style.getPropertyValue('visibility')).not.toBe('hidden');
        expect(mirror.style.getPropertyValue('visibility')).toBe('visible');
        expect(mirror.querySelector('.jpdb-reader-detached-furi')?.textContent).toBe('しんそつ');

        mockOverflow(mirror, 100, 56);
        makeRoomForRubyInCroppedRows(document);
        expect(h1.style.minHeight).toBe('');
        expect(h1.dataset.yomuRubyRoom).toBeUndefined();
    });
});

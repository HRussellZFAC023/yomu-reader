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

    it('keeps a line-clamped lockup title at its clamp box (no growth, constrained mirror, rt stamped hidden)', () => {
        stubYouTube();
        document.body.innerHTML = `
            <yt-lockup-view-model>
                <h3 class="ytLockupMetadataViewModelHeadingReset">
                    <a class="ytLockupMetadataViewModelTitle" href="/watch?v=x"
                       style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;max-height:44px;line-height:22px">
                        <span class="ytAttributedStringHost">${TITLE}</span>
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
        // The mirror reproduces the clamp: same line count, never taller than
        // the 44px clamp box; readings hidden at rest via the stamp.
        expect(mirror.style.getPropertyValue('-webkit-line-clamp')).toBe('2');
        expect(mirror.style.maxHeight).toBe('44px');
        expect(mirror.style.overflow).toBe('hidden');
        expect(mirror.dataset.yomuClipConstrained).toBe('true');

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
        expect(mirror.style.overflow).toBe('hidden');

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
        // No one-line-taller mirror poking below the pill.
        expect(mirror.style.maxHeight).toBe('36px');
    });
});

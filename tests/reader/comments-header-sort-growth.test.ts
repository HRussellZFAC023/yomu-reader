import { afterEach, describe, expect, it } from 'vitest';

import { classifyDecoration } from '../../src/reader/dom/decoration-policy';
import { applyTokensToScanTarget, makeRoomForRubyInCroppedRows, removeNonDestructiveScanMirrors } from '../../src/reader/dom';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { FragmentTextTarget } from '../../src/reader/dom';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';

const LABEL = '並べ替え';

function commentsHeaderDom(): void {
    document.body.innerHTML = `
        <ytd-comments>
          <ytd-item-section-renderer>
            <ytd-comments-header-renderer>
              <div id="title"><yt-sort-filter-sub-menu-renderer>
                <yt-dropdown-menu>
                  <tp-yt-paper-menu-button>
                    <div id="trigger">
                      <tp-yt-paper-button id="label" role="button" aria-haspopup="true">
                        <yt-icon class="style-scope yt-dropdown-menu"><svg></svg></yt-icon>
                        <div id="label-text">${LABEL}</div>
                      </tp-yt-paper-button>
                    </div>
                  </tp-yt-paper-menu-button>
                </yt-dropdown-menu>
              </yt-sort-filter-sub-menu-renderer></div>
            </ytd-comments-header-renderer>
          </ytd-item-section-renderer>
        </ytd-comments>
    `;
}

function token(): JPDBToken {
    const card: JPDBCard = {
        vid: 1, sid: 1, rid: 0, spelling: LABEL, reading: 'ならべかえ', frequencyRank: null,
        partOfSpeech: [], meanings: [], cardState: ['not-in-deck'], pitchAccent: [], wordWithReading: null, source: 'jpdb',
    };
    return {
        card,
        start: 0, end: LABEL.length, length: LABEL.length,
        rubies: [{ text: 'ならべかえ', start: 0, end: LABEL.length, length: LABEL.length }],
        pitchClass: '', sentence: LABEL,
    };
}

afterEach(() => {
    removeNonDestructiveScanMirrors(document);
    document.body.innerHTML = '';
});

// Stray growth (gate-3 flag): the comments-header sort row kept growing
// (ytd-comments-header-renderer DIVs + tp-yt-paper-menu-button min-height)
// because the sort trigger's caret ICON made isMediaTextContentControl treat
// the role=button trigger as media-text CONTENT — an icon is how controls
// decorate themselves, not a thumbnail. Menus/dropdown triggers must classify
// interactive-passive; real media cards (img avatar + name) stay content.
describe('comments-header sort trigger classifies interactive-passive', () => {
    it('classifies the sort dropdown label as interactive-passive despite the ytd-comments content root', () => {
        commentsHeaderDom();
        const label = document.querySelector<HTMLElement>('#label-text')!;
        expect(classifyDecoration(label)).toBe('interactive-passive');
    });

    it('treats a small measured <img> caret exactly like an svg icon (still a control)', () => {
        document.body.innerHTML = `
            <ytd-comments>
                <div role="button" id="row"><img id="caret" src="caret.png"><span id="text">並べ替え</span></div>
            </ytd-comments>
        `;
        const caret = document.getElementById('caret')!;
        Object.defineProperty(caret, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({ x: 0, y: 0, left: 0, top: 0, right: 16, bottom: 16, width: 16, height: 16, toJSON: () => ({}) }) as DOMRect,
        });
        expect(classifyDecoration(document.getElementById('text')!)).toBe('interactive-passive');
    });

    it('keeps a channel avatar link (real media + name) as content', () => {
        document.body.innerHTML = `
            <ytd-comments>
                <a id="channel" href="/@ch"><img src="avatar.jpg" alt=""><span id="name">高橋洋一チャンネル</span></a>
            </ytd-comments>
        `;
        const name = document.querySelector<HTMLElement>('#name')!;
        expect(classifyDecoration(name)).toBe('content-ruby');
    });

    it('never lets ruby-room grow the sort row: interactive-passive words reserve no room', () => {
        commentsHeaderDom();
        const label = document.querySelector<HTMLElement>('#label-text')!;
        const target: FragmentTextTarget = {
            text: LABEL,
            parent: label,
            fragments: [{ node: label.firstChild as Text, start: 0, end: LABEL.length, hasNativeRuby: false }],
            decoration: classifyDecoration(label),
        };
        applyTokensToScanTarget(target, [token()], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });

        makeRoomForRubyInCroppedRows(document);
        makeRoomForRubyInCroppedRows(document);

        for (const box of Array.from(document.querySelectorAll<HTMLElement>('ytd-comments-header-renderer, ytd-comments-header-renderer *'))) {
            expect(box.dataset.yomuRubyRoom, `${box.tagName} must not be grown`).toBeUndefined();
            expect(box.style.getPropertyValue('min-height')).not.toMatch(/\d/u);
        }
    });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    applyTokensToScanTarget,
    classifyDecoration,
    collectFragmentTextTargetsIn,
    isCurrentScanTarget,
    makeRoomForRubyInCroppedRows,
    resetDecorationPolicyCachesForTest,
    setRubyDistortsConstrainedRowsForTest,
    removeNonDestructiveScanMirrors,
    type FragmentTextTarget,
} from '../../src/reader/dom';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';

function stubYouTube(): void {
    vi.stubGlobal('location', {
        href: 'https://m.youtube.com/watch?v=abc',
        origin: 'https://m.youtube.com',
        hostname: 'm.youtube.com',
        pathname: '/watch',
    });
}

function collectTargets(root: Node = document.body): FragmentTextTarget[] {
    return collectFragmentTextTargetsIn(root, 20, false, '', {
        allowUiText: true,
        includeUiChrome: true,
        includeTabChrome: true,
        includePassiveInteractions: true,
        heading: true,
        minLength: 1,
    });
}

function mockOverflow(element: HTMLElement, scrollHeight: number, clientHeight: number): void {
    Object.defineProperty(element, 'scrollHeight', { value: scrollHeight, configurable: true });
    Object.defineProperty(element, 'clientHeight', { value: clientHeight, configurable: true });
}

function mockRect(element: HTMLElement, rect: Pick<DOMRect, 'width' | 'height'>): void {
    Object.defineProperty(element, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({
            x: 0,
            y: 0,
            left: 0,
            top: 0,
            right: rect.width,
            bottom: rect.height,
            width: rect.width,
            height: rect.height,
            toJSON: () => ({}),
        }) as DOMRect,
    });
}

function card(spelling: string, reading: string): JPDBCard {
    return {
        vid: spelling.charCodeAt(0),
        sid: spelling.charCodeAt(0),
        rid: 0,
        spelling,
        reading,
        frequencyRank: null,
        partOfSpeech: [],
        meanings: [],
        cardState: ['not-in-deck'],
        pitchAccent: [],
        wordWithReading: null,
        source: 'fallback',
    };
}

function token(surface: string, start: number, sentence: string, reading: string): JPDBToken {
    return {
        card: card(surface, reading),
        start,
        end: start + surface.length,
        length: surface.length,
        rubies: [{ text: reading, start, end: start + surface.length, length: surface.length }],
        pitchClass: 'heiban',
        sentence,
    };
}

const FURIGANA_SETTINGS = { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' as const };

afterEach(() => {
    removeNonDestructiveScanMirrors(document);
    document.body.innerHTML = '';
    setRubyDistortsConstrainedRowsForTest(null);
    resetDecorationPolicyCachesForTest();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

// The acceptance matrix: each state's exemplars classify deterministically
// from explicit DOM facts — same fixture, same state, no dependence on prior
// scans or accumulated state.
describe('classifyDecoration acceptance matrix', () => {
    function classifyText(selector: string): string {
        const element = document.querySelector<HTMLElement>(selector)!;
        expect(element).toBeTruthy();
        const first = classifyDecoration(element);
        // Determinism: repeated classification of the same node is identical.
        expect(classifyDecoration(element)).toBe(first);
        return first;
    }

    it('classifies a YouTube speed-picker chip as interactive-passive', () => {
        stubYouTube();
        document.body.innerHTML = `
            <ytm-bottom-sheet-renderer>
                <button id="chip" class="option"><span id="label">0.5倍</span></button>
            </ytm-bottom-sheet-renderer>
        `;
        expect(classifyText('#label')).toBe('interactive-passive');
    });

    it('classifies a player settings row (menuitem) as interactive-passive', () => {
        stubYouTube();
        document.body.innerHTML = `
            <div class="ytp-settings-menu" role="menu">
                <div id="row" role="menuitem"><span id="label">画質</span></div>
            </div>
        `;
        expect(classifyText('#label')).toBe('interactive-passive');
    });

    it('classifies subscribe buttons as interactive-passive even inside watch metadata', () => {
        stubYouTube();
        document.body.innerHTML = `
            <ytd-watch-metadata>
                <ytd-subscribe-button-renderer>
                    <button id="subscribe"><span id="label">チャンネル登録</span></button>
                </ytd-subscribe-button-renderer>
            </ytd-watch-metadata>
        `;
        expect(classifyText('#label')).toBe('interactive-passive');
    });

    it('classifies a feed filter chip (role=tab) as interactive-passive', () => {
        stubYouTube();
        document.body.innerHTML = `
            <ytm-feed-filter-chip-bar-renderer role="tablist">
                <div id="chip" role="tab"><span id="label">新着</span></div>
            </ytm-feed-filter-chip-bar-renderer>
        `;
        expect(classifyText('#label')).toBe('interactive-passive');
    });

    it('classifies a search input and its suggestion listbox as skip', () => {
        document.body.innerHTML = `
            <div role="combobox" aria-owns="suggestions" aria-expanded="true">
                <input id="search" type="search" value="日本語">
            </div>
            <div id="suggestions" role="listbox">
                <div id="suggestion" role="option">日本語 勉強</div>
            </div>
        `;
        expect(classifyText('#search')).toBe('skip');
        expect(classifyText('#suggestion')).toBe('skip');
    });

    it('classifies a combobox-owned popup without a listbox role as skip', () => {
        document.body.innerHTML = `
            <input role="combobox" aria-controls="popup" type="text">
            <div id="popup"><div id="row">日本語の候補</div></div>
        `;
        expect(classifyText('#row')).toBe('skip');
    });

    it('classifies disabled controls as skip', () => {
        document.body.innerHTML = '<button id="button" disabled>送信する</button>';
        expect(classifyText('#button')).toBe('skip');
    });

    it('classifies a video title link as content-ruby', () => {
        stubYouTube();
        document.body.innerHTML = `
            <yt-lockup-view-model>
                <h3><a href="/watch?v=jp"><span id="title">日本語のニュース</span></a></h3>
            </yt-lockup-view-model>
        `;
        expect(classifyText('#title')).toBe('content-ruby');
    });

    it('classifies a watch metadata count row as content-ruby', () => {
        stubYouTube();
        document.body.innerHTML = `
            <ytm-watch-metadata>
                <div id="counts">52,551回視聴 2026/06/12</div>
            </ytm-watch-metadata>
        `;
        expect(classifyText('#counts')).toBe('content-ruby');
    });

    it('classifies comment text as content-ruby', () => {
        stubYouTube();
        document.body.innerHTML = `
            <ytd-comment-view-model>
                <yt-attributed-string id="content-text">今夜も配信見なかったごめんね。</yt-attributed-string>
            </ytd-comment-view-model>
        `;
        expect(classifyText('#content-text')).toBe('content-ruby');
    });

    it('classifies owner-curated content chips (質問する) as content-ruby', () => {
        stubYouTube();
        document.body.innerHTML = `
            <ytm-slim-video-metadata-section-renderer>
                <ytm-button-renderer><button id="ask"><span id="label">質問する</span></button></ytm-button-renderer>
            </ytm-slim-video-metadata-section-renderer>
        `;
        expect(classifyText('#label')).toBe('content-ruby');
    });

    it('classifies an article paragraph as prose-full', () => {
        document.body.innerHTML = `
            <article><p id="paragraph">今日は日本語の文章を読みます。</p></article>
        `;
        expect(classifyText('#paragraph')).toBe('prose-full');
    });

    it('keeps a prose link inside an article as prose (furigana preserved)', () => {
        document.body.innerHTML = `
            <main><article><p>この<a id="link" href="/word">言葉</a>を調べる。</p></article></main>
        `;
        const link = document.querySelector<HTMLElement>('#link')!;
        expect(classifyDecoration(link)).toBe('prose-full');
    });

    it('classifies a nav link as interactive-passive', () => {
        document.body.innerHTML = `
            <nav><a id="nav-link" href="/subscriptions">登録チャンネル</a></nav>
        `;
        expect(classifyText('#nav-link')).toBe('interactive-passive');
    });

    it('classifies plain non-prose text as content-ruby by default', () => {
        document.body.innerHTML = '<div id="row">昨日の出来事について</div>';
        expect(classifyText('#row')).toBe('content-ruby');
    });
});

// Geometry-invariance guard (the interactive-passive layout contract):
// decorating a control changes NOTHING about its geometry — no in-flow
// <ruby>, no line-height class, identical bounding rect, and repeated scans
// accumulate nothing. Asserted on a youtube.com fixture because YouTube was
// the site historically exempted from chrome ruby suppression.
describe('interactive-passive geometry invariance', () => {
    it('never adds in-flow ruby or growth to a YouTube subscribe button across repeated scans', () => {
        stubYouTube();
        document.body.innerHTML = `
            <div id="shell">
                <button id="subscribe" style="overflow:hidden;height:36px;white-space:nowrap">チャンネル登録</button>
            </div>
        `;
        const button = document.querySelector<HTMLElement>('#subscribe')!;
        mockRect(button, { width: 160, height: 36 });
        const rectBefore = button.getBoundingClientRect().height;

        for (let pass = 0; pass < 2; pass += 1) {
            // A framework re-render resets the label to plain text between
            // passes — the accumulation guard must hold across repeats.
            if (pass > 0) button.textContent = 'チャンネル登録';
            const target = collectTargets().find(candidate => candidate.text === 'チャンネル登録');
            expect(target).toBeTruthy();
            expect(target?.decoration).toBe('interactive-passive');
            expect(target?.suppressRuby).toBe(true);
            applyTokensToScanTarget(target!, [
                token('登録', 'チャンネル登録'.indexOf('登録'), 'チャンネル登録', 'とうろく'),
            ], FURIGANA_SETTINGS);
        }

        // Zero layout delta: no in-flow ruby, no reserved ruby line, no
        // ruby-room growth writes, identical rect.
        expect(button.querySelector('rt')).toBeNull();
        expect(button.querySelector('.jpdb-reader-has-furi')).toBeNull();
        expect(button.getAttribute('data-yomu-decoration')).toBe('interactive-passive');
        expect(button.querySelector('.jpdb-reader-word')).toBeTruthy();

        // Even a hostile overflow measurement must not grow a control.
        mockOverflow(button, 72, 36);
        makeRoomForRubyInCroppedRows(document);
        makeRoomForRubyInCroppedRows(document);
        expect(button.style.minHeight).toBe('');
        expect(button.style.height).toBe('36px');
        expect(button.style.paddingTop).toBe('');
        expect(button.dataset.yomuRubyRoom).toBeUndefined();
        expect(button.getBoundingClientRect().height).toBe(rectBefore);
    });
});

// Class Q guard: clip-constrained rows are protected on EVERY engine — the
// old rubyDistortsConstrainedRows() probe verdict must not gate protection.
describe('clip-constrained chrome rows (engine-unconditional)', () => {
    function paintRow(row: HTMLElement): void {
        const target = collectTargets().find(candidate => candidate.text === '田中太郎');
        expect(target).toBeTruthy();
        applyTokensToScanTarget(target!, [token('田中', 0, '田中太郎', 'たなか')], FURIGANA_SETTINGS);
        void row;
    }

    function expectNoInFlowRuby(row: HTMLElement): void {
        // The reading may render in the out-of-flow mirror; the row's own flow
        // must stay ruby-free so the fixed-height clip cannot shave it.
        for (const rt of Array.from(row.querySelectorAll('rt'))) {
            expect(rt.closest('.jpdb-reader-text-mirror')).not.toBeNull();
        }
        for (const furi of Array.from(row.querySelectorAll('.jpdb-reader-has-furi'))) {
            expect(furi.closest('.jpdb-reader-text-mirror')).not.toBeNull();
        }
    }

    it('keeps in-flow ruby out of a fixed-height overflow-hidden name row', () => {
        setRubyDistortsConstrainedRowsForTest(false);
        document.body.innerHTML = '<div id="row" style="height:22px;overflow:hidden">田中太郎</div>';
        const row = document.querySelector<HTMLElement>('#row')!;
        mockRect(row, { width: 240, height: 22 });
        const heightBefore = row.getBoundingClientRect().height;
        paintRow(row);
        expectNoInFlowRuby(row);
        expect(row.getBoundingClientRect().height).toBe(heightBefore);
    });

    it('keeps in-flow ruby out of the same row inside a role=list (member list)', () => {
        setRubyDistortsConstrainedRowsForTest(false);
        document.body.innerHTML = `
            <div role="list">
                <div id="row" style="height:22px;overflow:hidden">田中太郎</div>
            </div>
        `;
        const row = document.querySelector<HTMLElement>('#row')!;
        mockRect(row, { width: 240, height: 22 });
        paintRow(row);
        expectNoInFlowRuby(row);
    });
});


// The sealed interactive-passive decision must dominate the page-wide
// furigana-mode=all attribute: an UNCONSTRAINED control (no clip styles, so
// the constrained-row guard cannot mask the check) still gets no in-flow ruby.
describe('interactive-passive under furigana-mode=all', () => {
    it('keeps in-flow ruby off an unconstrained button when readings are forced page-wide', () => {
        document.body.innerHTML = `
            <div data-yomu-furigana-mode="all">
                <button id="open">設定を開く</button>
            </div>
        `;
        const target = collectTargets().find(candidate => candidate.text === '設定を開く');
        expect(target).toBeTruthy();
        expect(target?.decoration).toBe('interactive-passive');
        applyTokensToScanTarget(target!, [
            token('設定', 0, '設定を開く', 'せってい'),
        ], FURIGANA_SETTINGS);
        const button = document.querySelector<HTMLElement>('#open')!;
        expect(button.querySelector('.jpdb-reader-word')).toBeTruthy();
        expect(button.querySelector('rt')).toBeNull();
        expect(button.querySelector('.jpdb-reader-has-furi')).toBeNull();
    });
});

// A sealed verdict must go stale when the classification-relevant facts
// change between collection and the asynchronous apply.
describe('sealed decoration staleness', () => {
    it('drops a content target whose container became an editor', () => {
        document.body.innerHTML = '<div id="row">今日の日記を書く</div>';
        const row = document.querySelector<HTMLElement>('#row')!;
        const target = collectTargets().find(candidate => candidate.text === '今日の日記を書く')!;
        expect(target.decoration).toBe('content-ruby');
        expect(isCurrentScanTarget(target)).toBe(true);

        row.setAttribute('contenteditable', 'true');
        expect(isCurrentScanTarget(target)).toBe(false);

        row.removeAttribute('contenteditable');
        expect(isCurrentScanTarget(target)).toBe(true);

        row.setAttribute('role', 'button');
        expect(isCurrentScanTarget(target)).toBe(false);
    });
});

// Combobox-owned popup facts: only genuine combobox/search owners skip, and
// ownership resolves inside shadow roots too.
describe('combobox popup ownership', () => {
    it('does not skip a region merely referenced by a checkbox aria-controls', () => {
        document.body.innerHTML = `
            <input type="checkbox" aria-controls="details">
            <article id="details"><p id="body">日本語の説明文がここにあります。</p></article>
        `;
        expect(classifyDecoration(document.querySelector('#body')!)).toBe('prose-full');
    });

    it('skips a suggestion popup owned by a combobox inside an open shadow root', () => {
        document.body.innerHTML = '<div id="shadow-host"></div>';
        const shadow = document.querySelector<HTMLElement>('#shadow-host')!.attachShadow({ mode: 'open' });
        shadow.innerHTML = `
            <input role="combobox" aria-controls="sr-popup" type="text">
            <div id="sr-popup"><div id="sr-row">日本語の候補</div></div>
        `;
        expect(classifyDecoration(shadow.querySelector('#sr-row')!)).toBe('skip');
    });
});

// A clipped host whose DESCENDANT paints (background icon, ::before glyph)
// must not be mirror-hidden — the mirror recreates text only.
describe('mirror bareness with painted descendants', () => {
    it('keeps a clipped row with a background-painted inner span rendering in place', () => {
        document.body.innerHTML = `
            <div id="row" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis"><span style="background-image:url(chevron.png)"></span>日本語の見出し</div>
        `;
        const target = collectTargets().find(candidate => candidate.text === '日本語の見出し')!;
        applyTokensToScanTarget(target, [
            token('日本語', 0, '日本語の見出し', 'にほんご'),
        ], FURIGANA_SETTINGS);
        const row = document.querySelector<HTMLElement>('#row')!;
        // The P2 contract under test: the painted row is NOT mirror-hidden
        // (its icon would vanish). Whether its reading is suppressed in place
        // is the fragment-path clip decision, deferred separately.
        expect(row.querySelector('.jpdb-reader-text-mirror')).toBeNull();
        expect(row.style.getPropertyValue('visibility')).not.toBe('hidden');
        expect(row.querySelector('.jpdb-reader-word')).toBeTruthy();
    });
});

// Live-YT release blocker (2026-07-10): the desktop subscribe button renders
// through the volatile-watch-metadata MIRROR; under furigana-mode=all the
// inner mirror render re-derived suppression WITHOUT the sealed decision and
// the mode attribute won — ruby appeared in the mirror channel. Realistic
// live DOM shape; interactive-passive must show furigana in NO channel.
describe('interactive-passive mirror channel under furigana-mode=all', () => {
    it('renders a subscribe-button mirror without any ruby when readings are forced page-wide', () => {
        stubYouTube();
        document.body.innerHTML = `
            <div data-yomu-furigana-mode="all">
                <ytd-watch-metadata>
                    <div id="owner">
                        <yt-subscribe-button-view-model>
                            <button class="yt-spec-button-shape-next yt-spec-button-shape-next--filled">
                                <div class="yt-spec-button-shape-next__button-text-content">チャンネル登録</div>
                            </button>
                        </yt-subscribe-button-view-model>
                    </div>
                </ytd-watch-metadata>
            </div>
        `;
        const collected = collectTargets().find(candidate => candidate.text === 'チャンネル登録');
        expect(collected).toBeTruthy();
        expect(collected?.decoration).toBe('interactive-passive');
        // The volatile watch-metadata profile routes subscribe rows through
        // the non-destructive mirror.
        const target = { ...collected!, nonDestructive: true, passiveInteraction: true };

        applyTokensToScanTarget(target, [
            token('登録', 'チャンネル登録'.indexOf('登録'), 'チャンネル登録', 'とうろく'),
        ], FURIGANA_SETTINGS);

        const button = document.querySelector<HTMLElement>('button.yt-spec-button-shape-next')!;
        const mirror = button.querySelector<HTMLElement>('.jpdb-reader-text-mirror');
        expect(mirror).toBeTruthy();
        expect(mirror?.querySelector('.jpdb-reader-word')).toBeTruthy();
        // No furigana in ANY channel: not in flow, not in the mirror.
        expect(button.querySelectorAll('rt')).toHaveLength(0);
        expect(button.querySelector('.jpdb-reader-has-furi')).toBeNull();
    });
});

// Site-sweep release blocker (2026-07-10): at-rest furigana escaped
// overflow-hidden / line-clamped one-line rows on live pages through BOTH
// channels — the out-of-flow mirror's rt (sankei/kakaku) and in-place
// fragment-path rt (tenki/bookwalker/amazon). Clip-constrained rows must
// carry the data-yomu-clip-constrained stamp wherever their readings render,
// so CSS can hide rt at rest (hover reveals; ruby-room growth re-shows).
describe('clip-constrained rows never show at-rest ruby (site-sweep shapes)', () => {
    it('stamps the mirror of a bare clipped category tile (kakaku shape)', () => {
        document.body.innerHTML = `
            <div class="category-tile">
                <p><strong><span id="label" style="display:block;height:15px;overflow:hidden">パソコン周辺機器</span></strong></p>
            </div>
        `;
        const label = document.querySelector<HTMLElement>('#label')!;
        mockRect(label, { width: 154, height: 15 });
        const target = collectTargets().find(candidate => candidate.text === 'パソコン周辺機器');
        expect(target).toBeTruthy();
        applyTokensToScanTarget(target!, [
            token('周辺', 'パソコン周辺機器'.indexOf('周辺'), 'パソコン周辺機器', 'しゅうへん'),
        ], FURIGANA_SETTINGS);

        const mirror = label.querySelector<HTMLElement>('.jpdb-reader-text-mirror');
        expect(mirror).toBeTruthy();
        expect(mirror?.querySelector('rt')).toBeTruthy();
        expect(mirror?.dataset.yomuClipConstrained).toBe('true');
    });

    it('stamps a styled fixed-height menu row rendered in place (tenki shape)', () => {
        document.body.innerHTML = `
            <aside>
                <ul>
                    <li><a href="/week/">
                        <span id="row" style="display:block;height:15px;overflow:hidden;background-color:rgb(240,240,240)">週間天気と予報の一覧</span>
                    </a></li>
                </ul>
            </aside>
        `;
        const row = document.querySelector<HTMLElement>('#row')!;
        mockRect(row, { width: 154, height: 15 });
        const target = collectTargets().find(candidate => candidate.text === '週間天気と予報の一覧');
        expect(target).toBeTruthy();
        applyTokensToScanTarget(target!, [
            token('週間', 0, '週間天気と予報の一覧', 'しゅうかん'),
        ], FURIGANA_SETTINGS);

        // Styled host: no mirror-hiding of the painted row; the reading
        // renders in place and the clip row must carry the stamp so CSS keeps
        // the rt invisible at rest.
        expect(row.querySelector('.jpdb-reader-text-mirror')).toBeNull();
        expect(row.querySelector('rt')).toBeTruthy();
        expect(row.dataset.yomuClipConstrained).toBe('true');
    });

    it('stamps the reading channel of a line-clamped store book title (bookwalker shape)', () => {
        document.body.innerHTML = `
            <article>
                <div>
                    <h3 class="t-o-heading-book-title" style="display:-webkit-box;-webkit-line-clamp:2;overflow:hidden;max-height:53px;line-height:26px">
                        <a id="title-link" class="t-o-heading-book-title__link" href="/de/12345/">英雄村の少年、無自覚に無双する</a>
                    </h3>
                </div>
            </article>
        `;
        const link = document.querySelector<HTMLElement>('#title-link')!;
        mockRect(link, { width: 129, height: 53 });
        const target = collectTargets().find(candidate => candidate.text === '英雄村の少年、無自覚に無双する');
        expect(target).toBeTruthy();
        applyTokensToScanTarget(target!, [
            token('英雄', 0, '英雄村の少年、無自覚に無双する', 'えいゆう'),
        ], FURIGANA_SETTINGS);

        // Wherever the reading landed (mirror or in place), its clip scope
        // carries the stamp — no unstamped at-rest rt exists in the row.
        const rts = Array.from(document.querySelectorAll<HTMLElement>('rt'));
        expect(rts.length).toBeGreaterThan(0);
        for (const rt of rts) {
            expect(rt.closest('[data-yomu-clip-constrained="true"]')).not.toBeNull();
        }
    });
});

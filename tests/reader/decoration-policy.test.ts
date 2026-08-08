import { readFileSync } from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    applyTokensToScanTarget,
    applyTokensToTextNode,
    classifyDecoration,
    collectFragmentTextTargetsIn,
    isCurrentScanTarget,
    makeRoomForRubyInCroppedRows,
    projectAdditiveTextMirrors,
    resetDecorationPolicyCachesForTest,
    setRubyDistortsConstrainedRowsForTest,
    removeNonDestructiveScanMirrors,
    withMirrorTokenApply,
    type FragmentTextTarget,
} from '../../src/reader/dom';
import {
    closestRubyFragileConstrainedRow,
    isClipConstrainedRow,
    noteConstrainedRowLayoutSettled,
    youtubeNativeChromeMustRemainPageOwned,
    youtubeShelfExpansionChromeMustRemainPageOwned,
} from '../../src/reader/dom/decoration-policy';
import { setRenderedWordPitchClass } from '../../src/reader/dom/rendered-word-state';
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

function positionedRect(left: number, top: number, right: number, bottom: number): DOMRect {
    return {
        x: left,
        y: top,
        left,
        top,
        right,
        bottom,
        width: right - left,
        height: bottom - top,
        toJSON: () => ({}),
    } as DOMRect;
}

function mockRangeRects(rectForNode: (node: Node | null) => DOMRect[]): void {
    const createRange = document.createRange.bind(document);
    vi.spyOn(document, 'createRange').mockImplementation(() => {
        const range = createRange();
        let selected: Node | null = null;
        const selectNodeContents = range.selectNodeContents.bind(range);
        Object.defineProperty(range, 'selectNodeContents', {
            configurable: true,
            value: (node: Node) => {
                selected = node;
                selectNodeContents(node);
            },
        });
        Object.defineProperty(range, 'getClientRects', {
            configurable: true,
            value: () => rectForNode(selected) as unknown as DOMRectList,
        });
        return range;
    });
}

function mockElementsFromPoint(elements: HTMLElement[]): () => void {
    const original = Object.getOwnPropertyDescriptor(document, 'elementsFromPoint');
    Object.defineProperty(document, 'elementsFromPoint', {
        configurable: true,
        value: () => elements,
    });
    return () => {
        if (original) Object.defineProperty(document, 'elementsFromPoint', original);
        else Reflect.deleteProperty(document, 'elementsFromPoint');
    };
}

function baseText(element: HTMLElement): string {
    const clone = element.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('.jpdb-reader-furi,.jpdb-reader-text-mirror').forEach(node => node.remove());
    return clone.textContent ?? '';
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
    document.documentElement.classList.remove('jpdb-reader-word-underline-pitch');
    setRubyDistortsConstrainedRowsForTest(null);
    resetDecorationPolicyCachesForTest();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

// Cluster G3 (iPad heat): the constrained-row style memo reuses its verdict
// across steady-state scan passes (each of which would otherwise force a
// reflow) and only re-measures once the geometry-settle sweep advances the
// layout generation. That decouples cross-pass reuse from settle freshness.
describe('constrained-row style memo generation', () => {
    it('reuses the verdict until a settle sweep, then re-measures fresh geometry', () => {
        const row = document.createElement('div');
        row.style.overflow = 'hidden';
        row.style.textOverflow = 'ellipsis';
        row.style.whiteSpace = 'nowrap';
        row.textContent = '日本語のタイトル';
        document.body.append(row);

        // First read measures and classifies the row as ruby-fragile.
        expect(closestRubyFragileConstrainedRow(row)).toBe(row);

        // The row stops ellipsizing, but with no settle sweep the memo still
        // returns the earlier verdict — this is the cross-pass reuse that spares
        // steady-state scans a reflow.
        row.style.textOverflow = 'clip';
        row.style.whiteSpace = 'normal';
        expect(closestRubyFragileConstrainedRow(row)).toBe(row);

        // A settle sweep advances the generation, so the next read re-measures.
        noteConstrainedRowLayoutSettled();
        expect(closestRubyFragileConstrainedRow(row)).toBeNull();
    });
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

    function mountLiveYouTubeShelfExpansion(): void {
        document.body.innerHTML = `
            <ytd-shelf-renderer>
                <ytd-vertical-list-renderer>
                    <h2><yt-formatted-string id="shelf-title">関連する動画</yt-formatted-string></h2>
                    <div id="items">
                        <ytd-video-renderer>
                            <h3>
                                <a href="/watch?v=jp">
                                    <yt-formatted-string id="video-title">富士フィルムのカメラ比較</yt-formatted-string>
                                </a>
                            </h3>
                        </ytd-video-renderer>
                    </div>
                    <div id="more">
                        <yt-formatted-string id="show-more-control" role="button" tabindex="0">
                            <span id="show-more-plus">+ </span><span id="show-more-label">他 3 件</span>
                        </yt-formatted-string>
                    </div>
                </ytd-vertical-list-renderer>
            </ytd-shelf-renderer>
        `;
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

    it('leaves YouTube ellipsis-constrained action and mini-guide labels undecorated', () => {
        stubYouTube();
        document.body.innerHTML = `
            <ytd-mini-guide-renderer role="navigation">
                <ytd-mini-guide-entry-renderer>
                    <a href="/" aria-label="ホーム">
                        <span id="home" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">ホーム</span>
                    </a>
                </ytd-mini-guide-entry-renderer>
            </ytd-mini-guide-renderer>
            <ytd-reel-player-overlay-renderer>
                <button aria-label="共有">
                    <span id="share" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">共有</span>
                </button>
            </ytd-reel-player-overlay-renderer>
        `;

        expect(classifyText('#home')).toBe('skip');
        expect(classifyText('#share')).toBe('skip');
    });

    it('recognizes only the explicit ytm-shorts action rail outside a reel overlay', () => {
        stubYouTube();
        document.body.innerHTML = `
            <ytm-shorts>
                <div id="actions" role="toolbar">
                    <button><span id="share" class="proof-shorts-action-label" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">共有</span></button>
                </div>
                <section id="details">
                    <button><span id="details-label" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">日本語の説明</span></button>
                </section>
            </ytm-shorts>
        `;

        expect(youtubeNativeChromeMustRemainPageOwned(document.querySelector<HTMLElement>('#share')!)).toBe(true);
        expect(classifyText('#share')).toBe('skip');
        expect(youtubeNativeChromeMustRemainPageOwned(document.querySelector<HTMLElement>('#details-label')!)).toBe(false);
    });

    it('leaves the live YouTube shelf expansion label page-owned', () => {
        stubYouTube();
        mountLiveYouTubeShelfExpansion();

        const control = document.querySelector<HTMLElement>('#show-more-control')!;
        const showMore = document.querySelector<HTMLElement>('#show-more-label')!;

        expect(youtubeShelfExpansionChromeMustRemainPageOwned(control)).toBe(true);
        expect(youtubeShelfExpansionChromeMustRemainPageOwned(showMore)).toBe(true);
        expect(youtubeNativeChromeMustRemainPageOwned(showMore)).toBe(true);
        expect(classifyText('#show-more-label')).toBe('skip');
    });

    it('does not collect or mutate YouTube shelf expansion chrome', () => {
        stubYouTube();
        mountLiveYouTubeShelfExpansion();
        const label = document.querySelector<HTMLElement>('#show-more-control')!;
        const nativeChildren = [...label.childNodes];
        const nativeStyle = label.style.cssText;
        const nativeAttributes = Array.from(label.attributes).map(attribute => [attribute.name, attribute.value]);
        expect(collectTargets(label)).toEqual([]);
        expect([...label.childNodes]).toEqual(nativeChildren);
        expect(label.style.cssText).toBe(nativeStyle);
        expect(Array.from(label.attributes).map(attribute => [attribute.name, attribute.value])).toEqual(nativeAttributes);
        expect(label.hasAttribute('data-yomu-decoration')).toBe(false);
        expect(document.querySelector('.jpdb-reader-word')).toBeNull();
    });

    it('keeps the live YouTube shelf title and result content annotatable beside its page-owned expander', () => {
        stubYouTube();
        mountLiveYouTubeShelfExpansion();

        const shelfTitle = document.querySelector<HTMLElement>('#shelf-title')!;
        const videoTitle = document.querySelector<HTMLElement>('#video-title')!;

        expect(youtubeShelfExpansionChromeMustRemainPageOwned(shelfTitle)).toBe(false);
        expect(youtubeShelfExpansionChromeMustRemainPageOwned(videoTitle)).toBe(false);
        expect(youtubeNativeChromeMustRemainPageOwned(shelfTitle)).toBe(false);
        expect(youtubeNativeChromeMustRemainPageOwned(videoTitle)).toBe(false);
        expect(classifyText('#shelf-title')).toBe('content-ruby');
        expect(classifyText('#video-title')).toBe('content-ruby');
    });

    it('keeps a realistically bounded YouTube video-title link and unclipped controls annotatable', () => {
        stubYouTube();
        document.body.innerHTML = `
            <ytd-reel-player-overlay-renderer>
                <h2><a id="title-link" href="/watch?v=jp" style="display:flex;max-width:240px">
                    <span id="title" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">日本語のニュース</span>
                </a></h2>
            </ytd-reel-player-overlay-renderer>
            <ytd-masthead><button><span id="create">作成</span></button></ytd-masthead>
        `;
        mockRect(document.querySelector<HTMLElement>('#title-link')!, { width: 240, height: 40 });

        expect(classifyText('#title')).toBe('content-ruby');
        expect(classifyText('#create')).toBe('interactive-passive');
    });

    it('recognizes YouTube native ellipsis chrome across an open shadow root', () => {
        stubYouTube();
        const entry = document.createElement('ytd-mini-guide-entry-renderer');
        const shadow = entry.attachShadow({ mode: 'open' });
        shadow.innerHTML = `
            <a href="/" aria-label="ホーム">
                <span id="shadow-home" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">ホーム</span>
            </a>
        `;
        document.body.append(entry);

        const label = shadow.querySelector<HTMLElement>('#shadow-home')!;
        expect(classifyDecoration(label)).toBe('skip');
        expect(classifyDecoration(label)).toBe('skip');
    });

    it('keeps ellipsis-constrained controls on other sites annotatable', () => {
        document.body.innerHTML = `
            <nav><button><span id="share" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">共有</span></button></nav>
        `;

        expect(classifyText('#share')).toBe('interactive-passive');
    });

    it('keeps unrelated YouTube controls annotatable while native Shorts chrome is page-owned before CSS hydration', () => {
        stubYouTube();
        document.body.innerHTML = `
            <ytm-bottom-sheet-renderer>
                <button><span id="speed" style="display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">再生速度</span></button>
            </ytm-bottom-sheet-renderer>
            <ytd-reel-player-overlay-renderer>
                <button><span id="unclipped-share">共有</span></button>
            </ytd-reel-player-overlay-renderer>
        `;

        expect(classifyText('#speed')).toBe('interactive-passive');
        expect(classifyText('#unclipped-share')).toBe('skip');
    });

    it('rejects ordinary YouTube feed text before reading computed styles', () => {
        stubYouTube();
        document.body.innerHTML = `
            <yt-lockup-view-model><h3><a href="/watch?v=jp"><span id="feed-title">日本語のニュース</span></a></h3></yt-lockup-view-model>
        `;
        const getComputedStyle = vi.spyOn(window, 'getComputedStyle');

        expect(youtubeNativeChromeMustRemainPageOwned(document.querySelector<HTMLElement>('#feed-title')!)).toBe(false);
        expect(getComputedStyle).not.toHaveBeenCalled();
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

    it('classifies a compact label beside its owning button as interactive-passive', () => {
        stubYouTube();
        document.body.innerHTML = `
            <div class="ytp-variable-speed-panel-preset-button-wrapper">
                <button class="ytp-variable-speed-panel-button"><span>1.0</span></button>
                <div id="label" class="ytp-variable-speed-panel-preset-button-label-text">標準</div>
            </div>
        `;
        expect(classifyText('#label')).toBe('interactive-passive');
    });

    it('classifies a compact panel heading beside its back button as interactive-passive', () => {
        stubYouTube();
        document.body.innerHTML = `
            <div class="ytp-panel-header">
                <button aria-label="前のメニューに戻る"></button>
                <span id="label" role="heading">再生速度</span>
            </div>
        `;
        expect(classifyText('#label')).toBe('interactive-passive');
    });

    it('keeps a hydrated panel label passive when the app shell lives under main', () => {
        stubYouTube();
        document.body.innerHTML = `
            <main>
                <div class="player-settings-menu">
                    <div class="variable-speed-panel">
                        <div class="preset-button-wrapper">
                            <button><span>1.0</span></button>
                            <div id="label" class="preset-button-label-text">標準</div>
                        </div>
                    </div>
                </div>
            </main>
        `;
        expect(classifyText('#label')).toBe('interactive-passive');
    });

    it('seals an unmeasured panel label as passive before its sibling control hydrates', () => {
        stubYouTube();
        document.body.innerHTML = `
            <main>
                <div class="player-settings-menu">
                    <div class="variable-speed-panel">
                        <div class="preset-button-wrapper">
                            <div id="label" class="preset-button-label-text">標準</div>
                        </div>
                    </div>
                </div>
            </main>
        `;
        expect(classifyText('#label')).toBe('interactive-passive');
    });

    it('keeps a media-card title as content when a separate overflow button is nearby', () => {
        stubYouTube();
        document.body.innerHTML = `
            <article>
                <h3><a href="/watch?v=jp"><span id="title">世界のニュース</span></a></h3>
                <button aria-label="その他の操作"></button>
            </article>
        `;
        expect(classifyText('#title')).toBe('content-ruby');
    });

    it('collects a visible compact badge inside an aria-hidden thumbnail', () => {
        stubYouTube();
        document.body.innerHTML = `
            <a id="thumbnail" href="/watch?v=playlist" aria-hidden="true">
                <img alt="">
                <div class="thumbnail-overlay-badge">
                    <div id="badge" class="badge-shape-text">ミックスリスト</div>
                </div>
            </a>
        `;
        const badge = document.querySelector<HTMLElement>('#badge')!;
        mockRect(badge, { width: 92, height: 24 });

        const target = collectFragmentTextTargetsIn(document.body, 20, false, '[aria-hidden="true"],svg', {
            allowUiText: true,
            includeUiChrome: true,
            includePassiveInteractions: true,
            heading: true,
            minLength: 1,
        }).find(candidate => candidate.text === 'ミックスリスト');

        expect(target).toBeTruthy();
        expect(target?.decoration).toBe('interactive-passive');
        expect(target?.passiveInteraction).toBe(true);
    });

    it('does not collect a non-painted aria-hidden label', () => {
        document.body.innerHTML = `
            <div aria-hidden="true">
                <span id="badge" class="badge-label" style="display:none">非表示ラベル</span>
            </div>
        `;
        const badge = document.querySelector<HTMLElement>('#badge')!;
        mockRect(badge, { width: 92, height: 24 });

        expect(collectTargets().some(candidate => candidate.text === '非表示ラベル')).toBe(false);
    });

    it('collects a full visible title wrapped in an aria-hidden node named elsewhere', () => {
        stubYouTube();
        // YouTube/Google wrap a painted title in aria-hidden while a separate
        // labelledby node supplies the accessible name. The title is neither a
        // compact badge nor short, so the paint fact — a visible element owning
        // the Japanese text — is what must rescue it, not any size/shape limit.
        document.body.innerHTML = `
            <a id="lockup" href="/watch?v=jp" aria-labelledby="a11y-title">
                <div aria-hidden="true">
                    <span id="title">東京の街を歩きながら日本語を学ぶ長編動画</span>
                </div>
            </a>
            <span id="a11y-title" style="position:absolute;left:-9999px">東京の街を歩きながら日本語を学ぶ長編動画</span>
        `;
        const title = document.querySelector<HTMLElement>('#title')!;
        mockRect(title, { width: 260, height: 24 });

        const target = collectTargets().find(candidate => candidate.text === '東京の街を歩きながら日本語を学ぶ長編動画');
        expect(target).toBeTruthy();
        expect(target?.passiveInteraction).toBe(true);
    });

    it('does not collect an aria-hidden copy already named by a labelled ancestor', () => {
        stubYouTube();
        // The visible view-count row supplies its own aria-label; the aria-hidden
        // spans it wraps are duplicates the labelled ancestor already covers, so
        // painting them would double-annotate the same reading.
        document.body.innerHTML = `
            <div id="view-count" aria-label="226 人が視聴中">
                <yt-formatted-string id="dup" aria-hidden="true">人が視聴中</yt-formatted-string>
            </div>
        `;
        const dup = document.querySelector<HTMLElement>('#dup')!;
        mockRect(dup, { width: 120, height: 20 });

        expect(collectTargets().some(candidate => candidate.text === '人が視聴中')).toBe(false);
    });

    it('reaches a visible Japanese title buried past the boxless-wrapper lookahead floor', () => {
        // A `display: contents` wrapper paints no box of its own, so its title is
        // rescued only by walking descendants for visible Japanese. Burying the
        // title behind >96 leading elements used to prune the whole wrapper; the
        // raised lookahead now reaches it while staying bounded.
        const wrapper = document.createElement('div');
        for (let index = 0; index < 120; index += 1) {
            const filler = document.createElement('span');
            filler.textContent = '·';
            wrapper.appendChild(filler);
        }
        const title = document.createElement('h3');
        title.textContent = '深い階層に置かれた日本語のタイトル';
        wrapper.appendChild(title);
        document.body.appendChild(wrapper);
        mockRect(title, { width: 240, height: 24 });

        const targets = collectFragmentTextTargetsIn(document.body, 20, true, '', {
            allowUiText: true,
            includeUiChrome: true,
            includeTabChrome: true,
            includePassiveInteractions: true,
            heading: true,
            minLength: 1,
        });
        expect(targets.some(candidate => candidate.text === '深い階層に置かれた日本語のタイトル')).toBe(true);
    });

    it('classifies subscribe buttons as interactive-passive even inside watch metadata', () => {
        stubYouTube();
        document.body.innerHTML = `
            <ytd-watch-metadata data-yomu-furigana-mode="all">
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

    it('keeps a search editor untouched while its declared suggestion choice is passive', () => {
        document.body.innerHTML = `
            <div role="combobox" aria-owns="suggestions" aria-expanded="true">
                <input id="search" type="search" value="日本語">
            </div>
            <div id="suggestions" role="listbox">
                <div id="suggestion" role="option">日本語 勉強</div>
            </div>
        `;
        expect(classifyText('#search')).toBe('skip');
        expect(classifyText('#suggestions')).toBe('skip');
        expect(classifyText('#suggestion')).toBe('interactive-passive');
        expect(collectTargets().find(candidate => candidate.text === '日本語 勉強')).toMatchObject({
            decoration: 'interactive-passive',
            passiveInteraction: true,
        });
    });

    it('classifies a combobox-owned popup without a listbox role as skip', () => {
        document.body.innerHTML = `
            <input role="combobox" aria-controls="popup" type="text">
            <div id="popup"><div id="row">日本語の候補</div></div>
        `;
        expect(classifyText('#row')).toBe('skip');
    });

    it('annotates a non-editable listbox trigger (select-like combobox) passively', () => {
        document.body.innerHTML = `
            <div id="picker" role="combobox" aria-haspopup="listbox" aria-expanded="false">
                <span id="face">日本語</span>
            </div>
        `;
        expect(classifyText('#face')).toBe('interactive-passive');
    });

    it('keeps an autocomplete combobox on the editor skip path', () => {
        document.body.innerHTML = `
            <div id="autocombo" role="combobox" aria-autocomplete="list" aria-expanded="false">
                <span id="typed">日本語</span>
            </div>
        `;
        expect(classifyText('#typed')).toBe('skip');
    });

    it('keeps an ARIA 1.1 combobox wrapper with a text-entry child on the editor skip path', () => {
        document.body.innerHTML = `
            <div id="wrapper" role="combobox" aria-expanded="false">
                <span id="hint">日本語で検索</span>
                <input type="text">
            </div>
        `;
        expect(classifyText('#hint')).toBe('skip');
    });

    it('annotates a declared menu choice inside a combobox-owned popup passively', () => {
        document.body.innerHTML = `
            <input role="combobox" aria-controls="popup" type="text">
            <div id="popup"><div id="row" role="menuitem">候補を選択</div></div>
        `;
        expect(classifyText('#row')).toBe('interactive-passive');
    });

    it('keeps native select options on the native-control mirror path', () => {
        document.body.innerHTML = '<select><option id="option">新しい順</option></select>';
        expect(classifyText('#option')).toBe('skip');
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

    it('classifies a watch metadata count row as interactive-passive', () => {
        stubYouTube();
        document.body.innerHTML = `
            <ytm-watch-metadata>
                <div id="counts">52,551回視聴 2026/06/12</div>
            </ytm-watch-metadata>
        `;
        expect(classifyText('#counts')).toBe('interactive-passive');
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

    it('keeps actual controls in YouTube content roots interactive-passive', () => {
        stubYouTube();
        document.body.innerHTML = `
            <ytm-slim-video-metadata-section-renderer>
                <ytm-button-renderer><button id="ask"><span id="label">質問する</span></button></ytm-button-renderer>
            </ytm-slim-video-metadata-section-renderer>
        `;
        expect(classifyText('#label')).toBe('interactive-passive');
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

    it('classifies compact metadata rows inside a linked card as interactive-passive', () => {
        document.body.innerHTML = `
            <a id="card" href="/r/example/comments/1">
                <h2 id="title">Discord Server Link</h2>
                <span id="flair">告知</span>
                <span id="metadata">10件の賛成票・0件のコメント</span>
            </a>
        `;

        expect(classifyText('#title')).toBe('content-ruby');
        expect(classifyText('#flair')).toBe('interactive-passive');
        expect(classifyText('#metadata')).toBe('interactive-passive');
    });

    it('classifies semantic timestamps as interactive-passive metadata', () => {
        document.body.innerHTML = '<article><time id="timestamp" datetime="2026-07-10T19:01:00Z">2時間前</time></article>';
        expect(classifyText('#timestamp')).toBe('interactive-passive');
    });

    it('classifies plain non-prose text as content-ruby by default', () => {
        document.body.innerHTML = '<div id="row">昨日の出来事について</div>';
        expect(classifyText('#row')).toBe('content-ruby');
    });
});

describe('late YouTube native-chrome hydration', () => {
    it('keeps Share page-owned before and after the native clipping CSS hydrates', () => {
        stubYouTube();
        document.body.innerHTML = `
            <ytd-reel-player-overlay-renderer>
                <button aria-label="共有"><span id="clip-row"><span id="share">共有</span></span></button>
            </ytd-reel-player-overlay-renderer>
        `;
        const button = document.querySelector<HTMLElement>('button')!;
        const clipRow = document.querySelector<HTMLElement>('#clip-row')!;
        expect(collectTargets(button)).toEqual([]);
        expect(button.querySelector('.jpdb-reader-text-mirror')).toBeNull();

        clipRow.style.overflow = 'hidden';
        clipRow.style.textOverflow = 'ellipsis';
        clipRow.style.whiteSpace = 'nowrap';
        noteConstrainedRowLayoutSettled();
        projectAdditiveTextMirrors(document);

        expect(collectTargets(button)).toEqual([]);
        expect(button.querySelector('.jpdb-reader-text-mirror')).toBeNull();
        expect(document.body.querySelector('.jpdb-reader-document-annotation-portal .jpdb-reader-word')).toBeNull();
        expect(baseText(button)).toBe('共有');
        expect(clipRow.style.getPropertyValue('visibility')).toBe('');
        expect(clipRow.style.getPropertyValue('position')).toBe('');
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

        // Zero layout delta: the reading is detached from line layout.
        expect(button.querySelector('rt')).toBeNull();
        expect(button.querySelector('.jpdb-reader-detached-furi')?.textContent).toBe('とうろく');
        expect(button.querySelector('.jpdb-reader-has-furi')).toBeTruthy();
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

    it('keeps Reddit-style linked-card metadata plain, visible, and fixed-height', () => {
        const metadataText = '10件の賛成票・0件のコメント';
        document.body.innerHTML = `
            <shreddit-app data-yomu-furigana-mode="all">
                <a id="card" href="/r/example/comments/1" style="display:block;height:120px;overflow:hidden">
                    <h2>Discord Server Link</h2>
                    <span id="metadata">${metadataText}</span>
                </a>
            </shreddit-app>
        `;
        const card = document.querySelector<HTMLElement>('#card')!;
        const metadata = document.querySelector<HTMLElement>('#metadata')!;
        mockRect(card, { width: 500, height: 120 });
        mockRect(metadata, { width: 260, height: 14 });
        const target = collectTargets(metadata).find(candidate => candidate.text === metadataText);
        expect(target).toBeTruthy();
        expect(target?.decoration).toBe('interactive-passive');

        applyTokensToScanTarget(target!, [
            token('賛成票', metadataText.indexOf('賛成票'), metadataText, 'さんせいひょう'),
            token('コメント', metadataText.indexOf('コメント'), metadataText, 'コメント'),
        ], FURIGANA_SETTINGS);

        expect(baseText(metadata)).toBe(metadataText);
        expect(metadata.querySelectorAll('.jpdb-reader-word').length).toBe(2);
        expect(metadata.querySelector('rt')).toBeNull();
        expect(metadata.querySelector('.jpdb-reader-detached-furi')?.textContent).toBe('さんせいひょう');
        expect(metadata.getAttribute('data-yomu-decoration')).toBe('interactive-passive');

        mockOverflow(card, 180, 120);
        makeRoomForRubyInCroppedRows(document);
        expect(card.style.height).toBe('120px');
        expect(card.dataset.yomuRubyRoom).toBeUndefined();
    });

    it('keeps a detached reading visible over same-line adjacent words and punctuation', () => {
        document.body.innerHTML = '<span id="metadata"><span id="source">賛成票・</span><span id="plain" class="jpdb-reader-word">コメント</span></span>';
        const source = document.querySelector<HTMLElement>('#source')!;
        const plainWord = document.querySelector<HTMLElement>('#plain')!;
        const sourceText = source.firstChild as Text;
        const readingRect = positionedRect(76, 0, 122, 7);
        const ownBaseRect = positionedRect(78, 8, 120, 25);
        const sameLinePlainWordRect = positionedRect(120, 8, 180, 25);
        const punctuationRect = positionedRect(120, 8, 134, 25);
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getRect(this: HTMLElement) {
            if (this.classList.contains('jpdb-reader-detached-furi')) return readingRect;
            if (this.classList.contains('jpdb-reader-ruby-base')) return ownBaseRect;
            if (this === plainWord) return sameLinePlainWordRect;
            if (this.classList.contains('jpdb-reader-word')) return ownBaseRect;
            return positionedRect(0, 8, 180, 25);
        });
        mockRangeRects(node => node?.nodeType === Node.TEXT_NODE && node.textContent === '・' ? [punctuationRect] : []);
        const restoreElementsFromPoint = mockElementsFromPoint([plainWord, source]);

        try {
            applyTokensToTextNode({
                text: '賛成票・',
                node: sourceText,
                parent: source,
                decoration: 'interactive-passive',
                suppressRuby: true,
            }, [token('賛成票', 0, '賛成票・', 'さんせいひょう')], FURIGANA_SETTINGS);

            const reading = source.querySelector<HTMLElement>('.jpdb-reader-detached-furi')!;
            expect(reading.textContent).toBe('さんせいひょう');
            expect(reading.dataset.yomuDetachedReadingHidden).toBeUndefined();
            expect(reading.style.getPropertyValue('display')).toBe('none');
        } finally {
            restoreElementsFromPoint();
        }
    });

    it.each<[string, string, string?]>([
        ['opaque', 'rgb(17, 26, 29)', undefined],
        ['transparent', 'transparent', undefined],
        ['missing-alpha', 'transparent', 'oklch(0.5 0.1 200 / none)'],
        ['scientific-alpha', 'transparent', 'color(srgb 0.1 0.1 0.1 / 5e-1)'],
    ])('keeps enabled furigana visible over an %s shadow overlay', (_kind, background, computedBackground) => {
        document.body.innerHTML = '<div id="behind">underlying text</div><reddit-overlay-host></reddit-overlay-host>';
        const behind = document.querySelector<HTMLElement>('#behind')!;
        const host = document.querySelector<HTMLElement>('reddit-overlay-host')!;
        const root = host.attachShadow({ mode: 'open' });
        root.innerHTML = `<div id="menu" style="background:${background}"><span id="source">賛成票</span></div>`;
        const menu = root.querySelector<HTMLElement>('#menu')!;
        const source = root.querySelector<HTMLElement>('#source')!;
        const sourceText = source.firstChild as Text;
        if (computedBackground) {
            const realGetComputedStyle = window.getComputedStyle.bind(window);
            vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudoElement) => {
                const style = realGetComputedStyle(element, pseudoElement);
                if (element !== menu) return style;
                return new Proxy(style, {
                    get(target, property) {
                        if (property === 'backgroundColor') return computedBackground;
                        const value = Reflect.get(target, property, target);
                        return typeof value === 'function' ? value.bind(target) : value;
                    },
                });
            });
        }
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getRect(this: HTMLElement) {
            if (this.classList.contains('jpdb-reader-detached-furi')) return positionedRect(76, 20, 122, 27);
            if (this.classList.contains('jpdb-reader-ruby-base')) return positionedRect(78, 28, 120, 45);
            if (this.classList.contains('jpdb-reader-word')) return positionedRect(78, 28, 120, 45);
            if (this === source) return positionedRect(76, 28, 122, 45);
            if (this === menu || this === host || this === behind) return positionedRect(0, 0, 180, 80);
            return positionedRect(0, 0, 180, 80);
        });
        Object.defineProperty(root, 'elementsFromPoint', {
            configurable: true,
            // WebKit includes document layers behind the shadow surface in
            // ShadowRoot.elementsFromPoint(), not only in the document stack.
            value: () => [source, menu, behind],
        });
        mockRangeRects(node => node === behind.firstChild ? [positionedRect(76, 18, 150, 35)] : []);
        const restoreElementsFromPoint = mockElementsFromPoint([host, behind]);

        try {
            applyTokensToTextNode({
                text: '賛成票',
                node: sourceText,
                parent: source,
                decoration: 'interactive-passive',
                suppressRuby: true,
            }, [token('賛成票', 0, '賛成票', 'さんせいひょう')], FURIGANA_SETTINGS);

            const reading = source.querySelector<HTMLElement>('.jpdb-reader-detached-furi')!;
            expect(reading.dataset.yomuDetachedReadingHidden).toBeUndefined();
            expect(reading.style.getPropertyValue('display')).toBe('none');
        } finally {
            restoreElementsFromPoint();
        }
    });

    it('keeps nested-shadow menu readings above text in an outer composed paint plane', () => {
        document.body.innerHTML = '<div id="behind">underlying text</div><reddit-outer-overlay></reddit-outer-overlay>';
        const behind = document.querySelector<HTMLElement>('#behind')!;
        const outerHost = document.querySelector<HTMLElement>('reddit-outer-overlay')!;
        const outerRoot = outerHost.attachShadow({ mode: 'open' });
        outerRoot.innerHTML = '<div id="menu" style="background:rgb(17, 26, 29)"><reddit-inner-label></reddit-inner-label></div>';
        const menu = outerRoot.querySelector<HTMLElement>('#menu')!;
        const innerHost = outerRoot.querySelector<HTMLElement>('reddit-inner-label')!;
        const innerRoot = innerHost.attachShadow({ mode: 'open' });
        innerRoot.innerHTML = '<span id="source">賛成票</span>';
        const source = innerRoot.querySelector<HTMLElement>('#source')!;
        const sourceText = source.firstChild as Text;

        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getRect(this: HTMLElement) {
            if (this.classList.contains('jpdb-reader-detached-furi')) return positionedRect(76, 20, 122, 27);
            if (this.classList.contains('jpdb-reader-ruby-base') || this.classList.contains('jpdb-reader-word')) {
                return positionedRect(78, 28, 120, 45);
            }
            if (this === source) return positionedRect(76, 28, 122, 45);
            return positionedRect(0, 0, 180, 80);
        });
        let innerRootHitQueries = 0;
        let outerRootHitQueries = 0;
        Object.defineProperty(innerRoot, 'elementsFromPoint', {
            configurable: true,
            // Reproduce WebKit leaking layers from ancestor/document roots
            // into the innermost ShadowRoot stack.
            value: () => {
                innerRootHitQueries += 1;
                return [source, menu, behind];
            },
        });
        Object.defineProperty(outerRoot, 'elementsFromPoint', {
            configurable: true,
            value: () => {
                outerRootHitQueries += 1;
                return [innerHost, menu, behind];
            },
        });
        mockRangeRects(node => node === behind.firstChild ? [positionedRect(76, 18, 150, 35)] : []);
        const restoreElementsFromPoint = mockElementsFromPoint([outerHost, behind]);

        try {
            applyTokensToTextNode({
                text: '賛成票',
                node: sourceText,
                parent: source,
                decoration: 'interactive-passive',
                suppressRuby: true,
            }, [token('賛成票', 0, '賛成票', 'さんせいひょう')], FURIGANA_SETTINGS);

            const reading = source.querySelector<HTMLElement>('.jpdb-reader-detached-furi')!;
            expect(reading.dataset.yomuDetachedReadingHidden).toBeUndefined();
            expect(reading.style.getPropertyValue('display')).toBe('none');
            expect(innerRootHitQueries).toBe(0);
            expect(outerRootHitQueries).toBe(0);
        } finally {
            restoreElementsFromPoint();
        }
    });

    it('detects visible foreign text in an intermediate transparent shadow root', () => {
        document.body.innerHTML = '<reddit-outer-overlay></reddit-outer-overlay>';
        const outerHost = document.querySelector<HTMLElement>('reddit-outer-overlay')!;
        const outerRoot = outerHost.attachShadow({ mode: 'open' });
        outerRoot.innerHTML = '<div id="surface"><span id="foreign">outer text</span><reddit-inner-label></reddit-inner-label></div>';
        const surface = outerRoot.querySelector<HTMLElement>('#surface')!;
        const foreign = outerRoot.querySelector<HTMLElement>('#foreign')!;
        const innerHost = outerRoot.querySelector<HTMLElement>('reddit-inner-label')!;
        const innerRoot = innerHost.attachShadow({ mode: 'open' });
        innerRoot.innerHTML = '<span id="source">賛成票</span>';
        const source = innerRoot.querySelector<HTMLElement>('#source')!;
        const sourceText = source.firstChild as Text;

        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getRect(this: HTMLElement) {
            if (this.classList.contains('jpdb-reader-detached-furi')) return positionedRect(76, 20, 122, 27);
            if (this.classList.contains('jpdb-reader-ruby-base') || this.classList.contains('jpdb-reader-word')) {
                return positionedRect(78, 28, 120, 45);
            }
            if (this === foreign) return positionedRect(76, 18, 150, 35);
            return positionedRect(0, 0, 180, 80);
        });
        Object.defineProperty(innerRoot, 'elementsFromPoint', {
            configurable: true,
            // The leaked outer hit is discarded here; the intermediate-root
            // query below remains responsible for its visible text.
            value: () => [source, foreign],
        });
        let outerRootHitQueries = 0;
        Object.defineProperty(outerRoot, 'elementsFromPoint', {
            configurable: true,
            value: () => {
                outerRootHitQueries += 1;
                return [innerHost, foreign, surface];
            },
        });
        mockRangeRects(node => node === foreign.firstChild ? [positionedRect(76, 18, 150, 35)] : []);
        const restoreElementsFromPoint = mockElementsFromPoint([outerHost]);

        try {
            applyTokensToTextNode({
                text: '賛成票',
                node: sourceText,
                parent: source,
                decoration: 'interactive-passive',
                suppressRuby: true,
            }, [token('賛成票', 0, '賛成票', 'さんせいひょう')], FURIGANA_SETTINGS);

            const reading = source.querySelector<HTMLElement>('.jpdb-reader-detached-furi')!;
            expect(reading.dataset.yomuDetachedReadingHidden).toBeUndefined();
            expect(reading.style.getPropertyValue('display')).toBe('none');
            expect(outerRootHitQueries).toBe(0);
        } finally {
            restoreElementsFromPoint();
        }
    });

    it.each<[
        kind: string,
        background: string,
        stack: string[],
        computedOverrides?: Record<string, string>,
        geometry?: 'corner' | 'partial',
    ]>([
        ['opaque foreground', 'rgb(17, 26, 29)', ['menu', 'behind']],
        ['transparent foreground', 'transparent', ['menu', 'behind']],
        ['opaque background', 'rgb(17, 26, 29)', ['behind', 'menu']],
        ['filtered foreground', 'rgb(17, 26, 29)', ['menu', 'behind'], { filter: 'opacity(0.5)' }],
        ['masked foreground', 'rgb(17, 26, 29)', ['menu', 'behind'], { maskImage: 'linear-gradient(transparent, black)' }],
        ['clipped foreground', 'rgb(17, 26, 29)', ['menu', 'behind'], { clipPath: 'circle(20%)' }],
        ['blended foreground', 'rgb(17, 26, 29)', ['menu', 'behind'], { mixBlendMode: 'multiply' }],
        ['scaled foreground', 'rgb(17, 26, 29)', ['menu', 'behind'], { transform: 'matrix(0.5, 0, 0, 0.5, 0, 0)' }],
        ['translated foreground', 'rgb(17, 26, 29)', ['menu', 'behind'], { transform: 'matrix(1, 0, 0, 1, 12, 8)' }],
        ['rounded transparent corner', 'rgb(17, 26, 29)', ['menu', 'behind'], {
            borderTopLeftRadius: '40px',
            borderTopRightRadius: '40px',
            borderBottomRightRadius: '40px',
            borderBottomLeftRadius: '40px',
        }, 'corner'],
        ['partial-width foreground', 'rgb(17, 26, 29)', ['menu', 'behind'], undefined, 'partial'],
    ])('keeps enabled furigana visible across an %s paint surface', (_kind, background, stack, computedOverrides, geometry) => {
        document.body.innerHTML = `
            <div id="surface">
                <div id="behind"><span id="behind-source">国際</span></div>
                <div id="menu" style="background:${background}"><span id="menu-source">並べ</span></div>
            </div>
        `;
        const behind = document.querySelector<HTMLElement>('#behind')!;
        const menu = document.querySelector<HTMLElement>('#menu')!;
        const behindSource = document.querySelector<HTMLElement>('#behind-source')!;
        const menuSource = document.querySelector<HTMLElement>('#menu-source')!;
        const behindText = behindSource.firstChild as Text;
        const menuText = menuSource.firstChild as Text;
        if (computedOverrides) {
            const realGetComputedStyle = window.getComputedStyle.bind(window);
            vi.spyOn(window, 'getComputedStyle').mockImplementation((element, pseudoElement) => {
                const style = realGetComputedStyle(element, pseudoElement);
                if (element !== menu) return style;
                return new Proxy(style, {
                    get(target, property) {
                        if (typeof property === 'string' && property in computedOverrides) {
                            return computedOverrides[property];
                        }
                        const value = Reflect.get(target, property, target);
                        return typeof value === 'function' ? value.bind(target) : value;
                    },
                });
            });
        }
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getRect(this: HTMLElement) {
            if (geometry === 'corner') {
                const foreground = Boolean(this.closest('#menu'));
                if (this.classList.contains('jpdb-reader-detached-furi')) return positionedRect(0, 0, 20, 7);
                if (this.classList.contains('jpdb-reader-ruby-base') || this.classList.contains('jpdb-reader-word')) {
                    return foreground
                        ? positionedRect(2, 8, 18, 25)
                        : positionedRect(0, 0, 20, 17);
                }
                return positionedRect(0, 0, 180, 80);
            }
            const foreground = Boolean(this.closest('#menu'));
            if (this.classList.contains('jpdb-reader-detached-furi')) {
                return positionedRect(76, 20, 122, 27);
            }
            if (this.classList.contains('jpdb-reader-ruby-base')) {
                return foreground
                    ? positionedRect(78, 28, 120, 45)
                    : positionedRect(76, 20, 122, 37);
            }
            if (this.classList.contains('jpdb-reader-word')) {
                return foreground
                    ? positionedRect(78, 28, 120, 45)
                    : positionedRect(76, 20, 122, 37);
            }
            if (this === menu && geometry === 'partial') return positionedRect(0, 0, 100, 80);
            return positionedRect(0, 0, 180, 80);
        });
        mockRangeRects(() => []);
        const hitElements = stack.map(id => document.querySelector<HTMLElement>(`#${id}`)!);
        const restoreElementsFromPoint = mockElementsFromPoint(hitElements);

        try {
            withMirrorTokenApply(() => {
                applyTokensToTextNode({
                    text: '国際',
                    node: behindText,
                    parent: behindSource,
                    decoration: 'interactive-passive',
                    suppressRuby: true,
                }, [token('国際', 0, '国際', 'こくさい')], FURIGANA_SETTINGS);
                applyTokensToTextNode({
                    text: '並べ',
                    node: menuText,
                    parent: menuSource,
                    decoration: 'interactive-passive',
                    suppressRuby: true,
                }, [token('並べ', 0, '並べ', 'ならべ')], FURIGANA_SETTINGS);
            });

            const foregroundReading = menu.querySelector<HTMLElement>('.jpdb-reader-detached-furi')!;
            const backgroundReading = behind.querySelector<HTMLElement>('.jpdb-reader-detached-furi')!;
            expect(foregroundReading.dataset.yomuDetachedReadingHidden).toBeUndefined();
            expect(foregroundReading.style.getPropertyValue('display')).toBe('none');
            expect(backgroundReading.dataset.yomuDetachedReadingHidden).toBeUndefined();
            expect(backgroundReading.style.getPropertyValue('display')).toBe('none');
        } finally {
            restoreElementsFromPoint();
        }
    });

    it('does not hide neighboring readings on a shared opaque menu surface', () => {
        document.body.innerHTML = `
            <div id="menu" style="background:rgb(17, 26, 29)">
                <span id="first">国際</span><span id="second">並べ</span>
            </div>
        `;
        const menu = document.querySelector<HTMLElement>('#menu')!;
        const first = document.querySelector<HTMLElement>('#first')!;
        const second = document.querySelector<HTMLElement>('#second')!;
        const firstText = first.firstChild as Text;
        const secondText = second.firstChild as Text;
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getRect(this: HTMLElement) {
            if (this.classList.contains('jpdb-reader-detached-furi')) return positionedRect(76, 20, 122, 27);
            if (this.classList.contains('jpdb-reader-ruby-base') || this.classList.contains('jpdb-reader-word')) {
                return this.closest('#first')
                    ? positionedRect(76, 20, 122, 37)
                    : positionedRect(78, 28, 120, 45);
            }
            return positionedRect(0, 0, 180, 80);
        });
        mockRangeRects(() => []);
        const restoreElementsFromPoint = mockElementsFromPoint([menu]);

        try {
            withMirrorTokenApply(() => {
                applyTokensToTextNode({
                    text: '国際', node: firstText, parent: first,
                    decoration: 'interactive-passive', suppressRuby: true,
                }, [token('国際', 0, '国際', 'こくさい')], FURIGANA_SETTINGS);
                applyTokensToTextNode({
                    text: '並べ', node: secondText, parent: second,
                    decoration: 'interactive-passive', suppressRuby: true,
                }, [token('並べ', 0, '並べ', 'ならべ')], FURIGANA_SETTINGS);
            });

            expect([...menu.querySelectorAll<HTMLElement>('.jpdb-reader-detached-furi')]
                .every(reading => !reading.dataset.yomuDetachedReadingHidden
                    && reading.style.getPropertyValue('display') === 'none')).toBe(true);
        } finally {
            restoreElementsFromPoint();
        }
    });

    it('keeps a detached reading visible when it reaches a neighboring authored row', () => {
        document.body.innerHTML = '<div id="foreign">ordinary text</div><span id="source">賛成票</span>';
        const source = document.querySelector<HTMLElement>('#source')!;
        const foreign = document.querySelector<HTMLElement>('#foreign')!;
        const sourceText = source.firstChild as Text;
        const readingRect = positionedRect(76, 20, 122, 27);
        const ownBaseRect = positionedRect(78, 28, 120, 45);
        const foreignRowRect = positionedRect(76, 12, 150, 29);
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function getRect(this: HTMLElement) {
            if (this.classList.contains('jpdb-reader-detached-furi')) return readingRect;
            if (this.classList.contains('jpdb-reader-ruby-base')) return ownBaseRect;
            if (this.classList.contains('jpdb-reader-word')) return ownBaseRect;
            if (this === foreign) return foreignRowRect;
            return positionedRect(0, 12, 180, 45);
        });
        mockRangeRects(node => node?.nodeType === Node.TEXT_NODE && node.textContent?.includes('ordinary') ? [foreignRowRect] : []);
        const restoreElementsFromPoint = mockElementsFromPoint([foreign]);

        try {
            applyTokensToTextNode({
                text: '賛成票',
                node: sourceText,
                parent: source,
                decoration: 'interactive-passive',
                suppressRuby: true,
            }, [token('賛成票', 0, '賛成票', 'さんせいひょう')], FURIGANA_SETTINGS);

            const reading = source.querySelector<HTMLElement>('.jpdb-reader-detached-furi')!;
            expect(reading.dataset.yomuDetachedReadingHidden).toBeUndefined();
            expect(reading.style.getPropertyValue('display')).toBe('none');
        } finally {
            restoreElementsFromPoint();
        }
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
        // Fixed-height rows keep readings detached so the authored box does
        // not grow; detached furigana remains visible at rest.
        for (const rt of Array.from(row.querySelectorAll('rt'))) {
            const scoped = rt.closest('.jpdb-reader-text-mirror') ?? rt.closest('[data-yomu-clip-constrained="true"]');
            expect(scoped).not.toBeNull();
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

    it('recognizes a 112px preview only when its native content is actively truncated', () => {
        document.body.innerHTML = `
            <div id="preview" style="height:112px;max-height:112px;overflow:hidden">
                <span id="copy">田中太郎</span>
            </div>
        `;
        const preview = document.querySelector<HTMLElement>('#preview')!;
        const copy = document.querySelector<HTMLElement>('#copy')!;
        mockRect(preview, { width: 208, height: 112 });
        mockOverflow(preview, 241, 112);

        expect(closestRubyFragileConstrainedRow(copy)).toBe(preview);
        expect(isClipConstrainedRow(preview)).toBe(true);
    });

    it('does not classify a non-overflowing 112px box as a constrained preview', () => {
        document.body.innerHTML = `
            <div id="preview" style="height:112px;max-height:112px;overflow:hidden">
                <span id="copy">田中太郎</span>
            </div>
        `;
        const preview = document.querySelector<HTMLElement>('#preview')!;
        const copy = document.querySelector<HTMLElement>('#copy')!;
        mockRect(preview, { width: 208, height: 112 });
        mockOverflow(preview, 112, 112);

        expect(closestRubyFragileConstrainedRow(copy)).toBeNull();
        expect(isClipConstrainedRow(preview)).toBe(false);
    });

    it('does not classify a viewport-sized overflow shell as a text preview', () => {
        document.body.innerHTML = `
            <main id="shell" style="height:600px;max-height:600px;overflow:hidden">
                <span id="copy">田中太郎</span>
            </main>
        `;
        const shell = document.querySelector<HTMLElement>('#shell')!;
        const copy = document.querySelector<HTMLElement>('#copy')!;
        // Even if a transform makes the visual rect look preview-sized, the
        // authored client viewport remains page-sized and must keep it out.
        mockRect(shell, { width: 273, height: 160 });
        mockOverflow(shell, 1200, 600);

        expect(closestRubyFragileConstrainedRow(copy)).toBeNull();
        expect(isClipConstrainedRow(shell)).toBe(false);
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
        expect(button.querySelector('.jpdb-reader-detached-furi')?.textContent).toBe('せってい');
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

    it('drops a multi-fragment target when a later fragment becomes page-owned', () => {
        document.body.innerHTML = '<div><span>今日</span><span id="later">の日記を書く</span></div>';
        const later = document.querySelector<HTMLElement>('#later')!;
        const target = collectTargets().find(candidate => candidate.text === '今日の日記を書く')!;
        expect(target.fragments).toHaveLength(2);
        expect(isCurrentScanTarget(target)).toBe(true);

        later.setAttribute('contenteditable', 'true');
        expect(isCurrentScanTarget(target)).toBe(false);

        later.removeAttribute('contenteditable');
        expect(isCurrentScanTarget(target)).toBe(true);
    });

    it('lets a later skipped fragment outrank an earlier passive fragment', () => {
        document.body.innerHTML = '<div class="metadata"><span>設定</span><span>を</span><span id="later">開く</span></div>';
        const later = document.querySelector<HTMLElement>('#later')!;
        const target = collectTargets().find(candidate => candidate.text === '設定を開く')!;
        expect(target.fragments).toHaveLength(3);
        expect(target.decoration).toBe('interactive-passive');
        expect(isCurrentScanTarget(target)).toBe(true);

        later.setAttribute('contenteditable', 'true');
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
// live DOM shape; interactive-passive keeps the site's native line geometry.
describe('interactive-passive mirror channel under furigana-mode=all', () => {
    it('derives detached furigana from a card reading when the live token has no explicit rubies', () => {
        document.body.innerHTML = `
            <button id="sort" style="height:36px;overflow:hidden;white-space:nowrap">賛成票率順</button>
        `;
        const button = document.querySelector<HTMLElement>('#sort')!;
        mockRect(button, { width: 144, height: 36 });
        const collected = collectTargets(button).find(candidate => candidate.text === '賛成票率順')!;
        const liveToken = token('賛成票率順', 0, collected.text, 'さんせいひょうりつじゅん');
        liveToken.rubies = [];

        applyTokensToScanTarget(
            { ...collected, nonDestructive: true, passiveInteraction: true },
            [liveToken],
            FURIGANA_SETTINGS,
        );

        const mirror = button.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;
        expect(mirror.dataset.yomuDetachedReadings).toBe('true');
        expect(mirror.dataset.yomuControlMirror).toBe('true');
        expect(mirror.querySelector('.jpdb-reader-detached-furi')?.textContent)
            .toBe('さんせいひょうりつじゅん');
        expect(button.style.getPropertyValue('overflow')).toBe('hidden');
    });

    it('renders a centered subscribe-button annotation with a layout-neutral detached reading', () => {
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
        // Controls remain lookupable and readable without reserving an
        // in-flow furigana lane that can displace fixed-height labels on WebKit.
        expect(button.querySelectorAll('rt')).toHaveLength(0);
        expect(mirror?.querySelector('.jpdb-reader-detached-furi')?.textContent).toBe('とうろく');
        // Subscribe is a control, so its mirror keeps the host's own control
        // metrics while the reading rides the out-of-flow lane above.
        expect(mirror?.dataset.yomuControlMirror).toBe('true');
        expect(button.dataset.yomuRubyRoom).toBeUndefined();
    });

    it('preserves detached readings plus compound and multiple pitch patterns on a control word', () => {
        stubYouTube();
        document.documentElement.classList.add('jpdb-reader-word-underline-pitch');
        document.body.innerHTML = `
            <button id="count" style="height:36px;overflow:hidden;white-space:nowrap">チャンネル登録者数</button>
        `;
        const button = document.querySelector<HTMLElement>('#count')!;
        mockRect(button, { width: 168, height: 36 });
        const collected = collectTargets(button).find(candidate => candidate.text === 'チャンネル登録者数')!;
        const compound = token('登録者数', 'チャンネル登録者数'.indexOf('登録者数'), 'チャンネル登録者数', 'とうろくしゃすう');
        compound.pitchClass = 'nakadaka';
        compound.card.pitchAccent = ['LHHHHHLL', 'HLLLLLLL'];

        applyTokensToScanTarget({ ...collected, nonDestructive: true, passiveInteraction: true }, [compound], FURIGANA_SETTINGS);

        const mirror = button.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;
        const word = mirror.querySelector<HTMLElement>('.jpdb-reader-word')!;
        expect(word.dataset.pitchClass).toBe('nakadaka');
        expect(word.dataset.pitchAccent).toBe('LHHHHHLL|HLLLLLLL');
        expect(word.classList.contains('jpdb-pitch-nakadaka')).toBe(true);
        expect(mirror.querySelector('.jpdb-reader-detached-furi')?.textContent).toBe('とうろくしゃすう');
        expect(mirror.dataset.yomuControlMirror).toBe('true');
        expect(button.dataset.yomuRubyRoom).toBeUndefined();
    });

    it('keeps a compact non-button metadata row detached inside a rich watch root', () => {
        stubYouTube();
        document.body.innerHTML = `
            <ytd-watch-metadata data-yomu-furigana-mode="all">
                <span id="owner-sub-count" class="ytContentMetadataViewModelMetadataText"
                      style="display:block;height:18px;line-height:18px;overflow:hidden;white-space:nowrap">
                    チャンネル登録者数 43.9万人
                </span>
            </ytd-watch-metadata>
        `;
        const row = document.querySelector<HTMLElement>('#owner-sub-count')!;
        mockRect(row, { width: 210, height: 18 });
        const collected = collectTargets(row).find(candidate => candidate.text === 'チャンネル登録者数 43.9万人')!;
        expect(collected.decoration).toBe('interactive-passive');
        const compound = token('登録者数', 'チャンネル登録者数 43.9万人'.indexOf('登録者数'), 'チャンネル登録者数 43.9万人', 'とうろくしゃすう');

        applyTokensToScanTarget({ ...collected, nonDestructive: true, passiveInteraction: true }, [compound], FURIGANA_SETTINGS);
        makeRoomForRubyInCroppedRows(document);

        expect(row.querySelector('rt')).toBeNull();
        expect(row.querySelector('.jpdb-reader-detached-furi')?.textContent).toBe('とうろくしゃすう');
        expect(row.querySelector('.jpdb-reader-text-mirror')).toBeTruthy();
        // A metadata SPAN inside a control row takes the same control metrics.
        expect(row.querySelector<HTMLElement>('.jpdb-reader-text-mirror')?.dataset.yomuControlMirror).toBe('true');
        expect(row.getBoundingClientRect().height).toBe(18);
        expect(row.dataset.yomuRubyRoom).toBeUndefined();
        expect(row.closest('[data-yomu-ruby-room="true"]')).toBeNull();
    });

    it('keeps a clipped Reddit-style control mirror annotated and visible at rest', () => {
        document.body.innerHTML = `
            <shreddit-app data-yomu-furigana-mode="all">
                <button id="join" style="height:40px;max-height:40px;overflow:hidden;white-space:nowrap">参加</button>
            </shreddit-app>
        `;
        const button = document.querySelector<HTMLElement>('#join')!;
        mockRect(button, { width: 88, height: 40 });
        const collected = collectTargets(button).find(candidate => candidate.text === '参加');
        expect(collected?.decoration).toBe('interactive-passive');

        applyTokensToScanTarget({ ...collected!, nonDestructive: true, passiveInteraction: true }, [
            token('参加', 0, '参加', 'さんか'),
        ], FURIGANA_SETTINGS);

        const mirror = button.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;
        expect(mirror).toBeTruthy();
        expect(mirror.querySelector('.jpdb-reader-word')).toBeTruthy();
        expect(mirror.querySelector('rt')).toBeNull();
        expect(mirror.querySelector('.jpdb-reader-detached-furi')?.textContent).toBe('さんか');
        // 参加 is a Reddit chrome button: annotated at rest through the
        // out-of-flow reading lane, like every other control.
        expect(mirror.dataset.yomuControlMirror).toBe('true');
        expect(mirror.classList.contains('jpdb-reader-additive-text-mirror')).toBe(true);
        expect(mirror.classList.contains('jpdb-reader-clip-hover-mirror')).toBe(false);
        expect(button.dataset.yomuClipHoverHost).toBeUndefined();
        expect(button.getBoundingClientRect().height).toBe(40);
        expect(button.dataset.yomuRubyRoom).toBeUndefined();
    });

    it('lets a mounted kana-only additive mirror gain late pitch paint without a reading or remount', () => {
        document.documentElement.classList.add('jpdb-reader-word-underline-pitch');
        document.body.innerHTML = `
            <shreddit-app data-yomu-furigana-mode="all">
                <button id="feed" style="height:40px;overflow:hidden;white-space:nowrap">フィード</button>
            </shreddit-app>
        `;
        const button = document.querySelector<HTMLElement>('#feed')!;
        mockRect(button, { width: 92, height: 40 });
        const collected = collectTargets(button).find(candidate => candidate.text === 'フィード')!;

        const unresolved = token('フィード', 0, 'フィード', 'フィード');
        unresolved.pitchClass = 'unknown';
        applyTokensToScanTarget({ ...collected, nonDestructive: true, passiveInteraction: true }, [unresolved], FURIGANA_SETTINGS);

        const mirror = button.querySelector<HTMLElement>('.jpdb-reader-additive-text-mirror')!;
        const word = mirror.querySelector<HTMLElement>('.jpdb-reader-word')!;
        expect(mirror.querySelector('.jpdb-reader-detached-furi')).toBeNull();
        expect(mirror.style.getPropertyValue('-webkit-text-fill-color')).toBe('transparent');
        expect(word.style.getPropertyValue('--jpdb-reader-word-decoration-source'))
            .toContain('--jpdb-reader-source-pitch-decoration');
        expect(word.style.getPropertyValue('text-decoration-color')).toBe('');

        setRenderedWordPitchClass(word, 'heiban');

        expect(button.querySelector('.jpdb-reader-additive-text-mirror')).toBe(mirror);
        expect(word.dataset.pitchClass).toBe('heiban');
        expect(word.classList.contains('jpdb-pitch-heiban')).toBe(true);
        expect(mirror.querySelector('.jpdb-reader-detached-furi')).toBeNull();
    });

    it('does not coerce a clipped inline metadata host to inline-block', () => {
        document.body.innerHTML = `
            <shreddit-app data-yomu-furigana-mode="all">
                <a href="/r/example/comments/1"><h2>Card</h2><span id="meta" style="display:inline;max-height:16px;overflow:hidden">告知</span></a>
            </shreddit-app>
        `;
        const metadata = document.querySelector<HTMLElement>('#meta')!;
        mockRect(metadata, { width: 28, height: 16 });
        const collected = collectTargets(metadata).find(candidate => candidate.text === '告知');
        expect(collected?.decoration).toBe('interactive-passive');

        applyTokensToScanTarget({ ...collected!, nonDestructive: true, passiveInteraction: true }, [
            token('告知', 0, '告知', 'こくち'),
        ], FURIGANA_SETTINGS);

        expect(metadata.style.display).toBe('inline');
        expect(metadata.querySelector('.jpdb-reader-text-mirror')).toBeTruthy();
        // A metadata span inside a linked card is still a control mirror.
        expect(metadata.querySelector<HTMLElement>('.jpdb-reader-text-mirror')?.dataset.yomuControlMirror).toBe('true');
        expect(metadata.querySelector('rt')).toBeNull();
        expect(metadata.querySelector('.jpdb-reader-detached-furi')?.textContent).toBe('こくち');
        expect(metadata.textContent).toContain('告知');
    });
});

// Site-sweep release blocker (2026-07-10/11): compact clipped rows must keep
// their authored box while still showing the requested reading. Readings are
// now detached overlays rather than in-flow rt, so they cannot grow the row.
describe('clip-constrained rows keep detached readings without ruby-room growth', () => {
    it('keeps detached furigana on a destructive clipped text target', () => {
        document.body.innerHTML = '<span id="label" style="display:block;height:15px;overflow:hidden">周辺機器</span>';
        const label = document.querySelector<HTMLElement>('#label')!;
        const node = label.firstChild as Text;
        mockRect(label, { width: 70, height: 15 });

        applyTokensToTextNode({
            text: '周辺機器',
            node,
            parent: label,
            decoration: 'content-ruby',
        }, [token('周辺', 0, '周辺機器', 'しゅうへん')], FURIGANA_SETTINGS);

        expect(label.querySelector('rt')).toBeNull();
        expect(label.querySelector('.jpdb-reader-detached-furi')?.textContent).toBe('しゅうへん');
    });

    it('does not open overflow on an aria-expanded content panel', () => {
        document.body.innerHTML = `
            <section id="description-inline-expander" role="region" tabindex="0" aria-expanded="false"
                style="height:40px;overflow:hidden">
                <span id="copy">日本語の説明です</span>
            </section>
        `;
        const panel = document.querySelector<HTMLElement>('#description-inline-expander')!;
        const copy = document.querySelector<HTMLElement>('#copy')!;
        mockRect(panel, { width: 220, height: 40 });
        mockRect(copy, { width: 120, height: 20 });
        Object.defineProperties(panel, {
            clientWidth: { value: 220, configurable: true },
            clientHeight: { value: 40, configurable: true },
            scrollWidth: { value: 220, configurable: true },
            scrollHeight: { value: 40, configurable: true },
        });
        const target = collectTargets(panel).find(candidate => candidate.text === '日本語の説明です')!;

        applyTokensToScanTarget(target, [token('日本語', 0, target.text, 'にほんご')], FURIGANA_SETTINGS);

        expect(panel.style.getPropertyValue('overflow')).toBe('hidden');
        expect(panel.dataset.yomuDetachedReadingOverflow).toBeUndefined();
        expect(panel.querySelector('.jpdb-reader-detached-furi')?.textContent).toBe('にほんご');
    });

    it('opens a visible furigana lane on an aria-expanded disclosure button', () => {
        document.body.innerHTML = `
            <button id="sort" type="button" aria-expanded="false" aria-haspopup="menu"
                style="height:40px;max-height:40px;overflow:hidden;white-space:nowrap">賛成票率順</button>
        `;
        const button = document.querySelector<HTMLElement>('#sort')!;
        mockRect(button, { width: 150, height: 40 });
        Object.defineProperties(button, {
            clientWidth: { value: 150, configurable: true },
            clientHeight: { value: 40, configurable: true },
            scrollWidth: { value: 150, configurable: true },
            scrollHeight: { value: 40, configurable: true },
        });
        const clicked = vi.fn();
        button.addEventListener('click', clicked);
        const target = collectTargets(button).find(candidate => candidate.text === '賛成票率順')!;
        const nativeCreateRange = document.createRange.bind(document);
        vi.spyOn(document, 'createRange').mockImplementation(() => {
            const range = nativeCreateRange();
            Object.defineProperty(range, 'getClientRects', {
                configurable: true,
                value: () => [{
                    x: 0, y: 10, left: 0, top: 10, right: 120, bottom: 30,
                    width: 120, height: 20, toJSON: () => ({}),
                }] as unknown as DOMRectList,
            });
            return range;
        });

        applyTokensToScanTarget(target, [
            token('賛成票率順', 0, target.text, 'さんせいひょうりつじゅん'),
        ], FURIGANA_SETTINGS);
        makeRoomForRubyInCroppedRows(document);

        const reading = button.querySelector<HTMLElement>('.jpdb-reader-detached-furi')!;
        expect(button.dataset.yomuDetachedReadingOverflow).toBeUndefined();
        expect(button.style.getPropertyValue('overflow')).toBe('hidden');
        expect(reading.dataset.yomuDetachedReadingHidden).toBeUndefined();
        expect(getComputedStyle(reading).display).toBe('none');
        expect(button.getBoundingClientRect().height).toBe(40);
        button.click();
        expect(clicked).toHaveBeenCalledTimes(1);
    });

    it.each([
        ['treeitem', 'role="treeitem"'],
        ['link-like custom toggle', 'role="link" tabindex="0"'],
    ])('opens a visible furigana lane on an aria-expanded %s', (_label, semantics) => {
        document.body.innerHTML = `<div id="toggle" ${semantics} aria-expanded="false"
            style="height:40px;max-height:40px;overflow:hidden;white-space:nowrap">表示順</div>`;
        const toggle = document.querySelector<HTMLElement>('#toggle')!;
        mockRect(toggle, { width: 100, height: 40 });
        Object.defineProperties(toggle, {
            clientWidth: { value: 100, configurable: true },
            clientHeight: { value: 40, configurable: true },
            scrollWidth: { value: 100, configurable: true },
            scrollHeight: { value: 40, configurable: true },
        });
        const clicked = vi.fn();
        toggle.addEventListener('click', clicked);
        const target = collectTargets(toggle).find(candidate => candidate.text === '表示順')!;
        const nativeCreateRange = document.createRange.bind(document);
        vi.spyOn(document, 'createRange').mockImplementation(() => {
            const range = nativeCreateRange();
            Object.defineProperty(range, 'getClientRects', {
                configurable: true,
                value: () => [{
                    x: 0, y: 10, left: 0, top: 10, right: 70, bottom: 30,
                    width: 70, height: 20, toJSON: () => ({}),
                }] as unknown as DOMRectList,
            });
            return range;
        });

        applyTokensToScanTarget(target, [token('表示順', 0, target.text, 'ひょうじじゅん')], FURIGANA_SETTINGS);
        makeRoomForRubyInCroppedRows(document);

        const reading = toggle.querySelector<HTMLElement>('.jpdb-reader-detached-furi')!;
        expect(toggle.dataset.yomuDetachedReadingOverflow).toBeUndefined();
        expect(toggle.style.getPropertyValue('overflow')).toBe('hidden');
        expect(reading.dataset.yomuDetachedReadingHidden).toBeUndefined();
        expect(getComputedStyle(reading).display).toBe('none');
        toggle.click();
        expect(clicked).toHaveBeenCalledTimes(1);
    });

    it('renders a bare clipped category tile with a detached reading (kakaku shape)', () => {
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

        expect(label.style.getPropertyValue('visibility')).not.toBe('hidden');
        expect(label.querySelector('rt')).toBeNull();
        expect(label.querySelector('.jpdb-reader-detached-furi')?.textContent).toBe('しゅうへん');
        expect(label.closest('[data-yomu-ruby-room="true"]')).toBeNull();
    });

    it('keeps a styled fixed-height menu row and its detached reading (tenki shape)', () => {
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

        expect(row.style.getPropertyValue('visibility')).not.toBe('hidden');
        expect(row.querySelector('rt')).toBeNull();
        expect(row.querySelector('.jpdb-reader-detached-furi')?.textContent).toBe('しゅうかん');
        expect(row.dataset.yomuRubyRoom).toBeUndefined();
    });

    it('keeps a line-clamped store book title annotated without in-flow ruby (bookwalker shape)', () => {
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

        expect(document.querySelector('rt')).toBeNull();
        expect(document.querySelector('.jpdb-reader-detached-furi')?.textContent).toBe('えいゆう');
        expect(document.querySelector('[data-yomu-ruby-room="true"]')).toBeNull();
    });
});

// Chrome buttons (Reddit's 質問 / 参加 / 共有 / アワードを贈る and their kind) are
// annotated AT REST like any other text. They stay interactive-passive, so the
// reading rides an out-of-flow lane and the control keeps its authored line
// height and hit target — that is layout safety, not a reason to hide the
// reading. There is no bare-until-hover tier: a reading the user cannot see
// until they hover is a reading they cannot read.
describe('chrome buttons are annotated at rest', () => {
    function chromeMirror(button: HTMLElement, text: string, reading: string): HTMLElement {
        mockRect(button, { width: 120, height: 40 });
        const collected = collectTargets(button).find(candidate => candidate.text === text)!;
        expect(collected).toBeTruthy();
        expect(collected.decoration).toBe('interactive-passive');
        applyTokensToScanTarget({ ...collected, nonDestructive: true, passiveInteraction: true }, [
            token(text, 0, text, reading),
        ], FURIGANA_SETTINGS);
        return button.querySelector<HTMLElement>('.jpdb-reader-text-mirror')!;
    }

    // Every case asserts the same contract: the reading exists in the detached
    // lane at rest, and no in-flow rt can grow the button.
    it.each([
        ['search-bar 質問 button', '<div role="search"><button id="c">質問</button></div>', '質問', 'しつもん'],
        ['参加 join button', '<button id="c">参加</button>', '参加', 'さんか'],
        ['共有 share button with an icon child', '<button id="c"><svg aria-hidden="true"></svg><span>共有</span></button>', '共有', 'きょうゆう'],
        ['アワードを贈る comment action', '<div class="comment-action-row"><button id="c">アワードを贈る</button></div>', 'アワードを贈る', 'おく'],
    ])('annotates a %s at rest', (_name, html, text, reading) => {
        document.body.innerHTML = html;
        const mirror = chromeMirror(document.querySelector<HTMLElement>('#c')!, text, reading);
        expect(mirror.dataset.yomuControlMirror).toBe('true');
        expect(mirror.querySelector('.jpdb-reader-word')).toBeTruthy();
        expect(mirror.querySelector('rt')).toBeNull();
        expect(mirror.querySelector('.jpdb-reader-detached-furi')?.textContent).toBe(reading);
    });

    // Nothing may reintroduce a rest-hiding marker on chrome.
    it('leaves no bare-until-hover marker on an annotated control', () => {
        document.body.innerHTML = '<button id="c">参加</button>';
        chromeMirror(document.querySelector<HTMLElement>('#c')!, '参加', 'さんか');
        expect(document.querySelector('[data-yomu-command-control]')).toBeNull();
        expect(document.querySelector('[data-yomu-control-mirror="command"]')).toBeNull();
    });

    // Deleting the marker is not enough on its own: the control mirror keeps a
    // stamp, and rest-hiding CSS re-keyed on that stamp would bring the whole
    // tier back with nothing in the gate to see it. jsdom loads no stylesheet,
    // so paint has to be judged from the stylesheet text here — the smokes that
    // measure real paint do not run in the check gate.
    it('leaves no control-mirror rule that hides a reading surface at rest', () => {
        const css = readFileSync('src/reader/styles/reader-words-ocr.css', 'utf8');
        const controlRules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/gu)]
            .map(match => ({ selector: match[1].trim(), body: match[2] }))
            .filter(rule => /\[data-yomu-control-mirror|\[data-yomu-command-control/u.test(rule.selector));
        // A renamed stamp must fail loudly rather than leave this scanning air.
        expect(controlRules.length).toBeGreaterThan(0);

        // In-flow rt is deliberately suppressed on controls — the detached lane
        // replaces it — so the surfaces that must survive at rest are the
        // reading itself, the word, and its exact Range fragments.
        const readingSurface = /jpdb-reader-detached-furi|jpdb-reader-source-fragment|jpdb-reader-word(?![\w-])/u;
        const revealState = /:hover|:focus|keyboard-active/u;
        const hidesPaint = /display:\s*none|visibility:\s*hidden|opacity:\s*0(?![.\d])|content:\s*none|(?:text-decoration-color|border-block-end-color|border-block-end|--jpdb-reader-word-underline):\s*transparent/u;
        const restHiders = controlRules
            .filter(rule => readingSurface.test(rule.selector)
                && !revealState.test(rule.selector)
                && hidesPaint.test(rule.body))
            .map(rule => rule.selector);
        expect(restHiders).toEqual([]);
    });

    it('keeps content chrome on its content tiers', () => {
        document.body.innerHTML = `
            <article>
                <h1 id="post-title">日本語の投稿タイトル</h1>
                <p id="promo">インターネットで最もリアルな場所に参加しましょう</p>
            </article>
        `;
        expect(classifyDecoration(document.querySelector('#post-title')!)).toBe('content-ruby');
        expect(classifyDecoration(document.querySelector('#promo')!)).toBe('prose-full');
    });
});

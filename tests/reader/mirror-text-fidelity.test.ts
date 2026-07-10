import { readFileSync } from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { applyTokensToScanTarget, collectFragmentTextTargetsIn, collectTextTargetsIn, removeNonDestructiveScanMirrors } from '../../src/reader/dom';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';

function card(spelling: string, reading: string): JPDBCard {
    return {
        vid: spelling.length, sid: 1, rid: 0, spelling, reading, frequencyRank: null,
        partOfSpeech: [], meanings: [], cardState: ['not-in-deck'], pitchAccent: [], wordWithReading: null, source: 'jpdb',
    };
}

function tokenAt(text: string, spelling: string, reading: string, start: number): JPDBToken {
    return {
        card: card(spelling, reading),
        start,
        end: start + spelling.length,
        length: spelling.length,
        rubies: [{ text: reading, start, end: start + spelling.length, length: spelling.length }],
        pitchClass: '',
        sentence: text,
    };
}

function paint(host: HTMLElement, match: string, tokens: (target: { text: string }) => JPDBToken[]): void {
    const target = collectTextTargetsIn(host, 400, false).find(t => t.text.includes(match));
    expect(target, `scan target containing ${match}`).toBeTruthy();
    applyTokensToScanTarget({ ...target!, nonDestructive: true }, tokens(target!), { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
}

function mirror(root: ParentNode = document): HTMLElement {
    const found = root.querySelector<HTMLElement>('.jpdb-reader-text-mirror');
    expect(found, 'rendered text mirror').toBeTruthy();
    return found!;
}

// The mirror's rendered base text: every text node except furigana readings.
function renderedMirrorText(m: HTMLElement): string {
    const walker = document.createTreeWalker(m, NodeFilter.SHOW_TEXT, {
        acceptNode: node => (node.parentElement?.closest('rt,rp') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    let text = '';
    for (let node = walker.nextNode(); node; node = walker.nextNode()) text += node.textContent ?? '';
    return text;
}

const mirrorCss = readFileSync('src/reader/styles/reader-words-ocr.css', 'utf8').replace(/\r\n/g, '\n');

afterEach(() => {
    vi.restoreAllMocks();
    removeNonDestructiveScanMirrors(document);
    document.body.innerHTML = '';
});

// Class O — mirrored words are atomic nowrap inline boxes rendered back-to-back.
// Japanese prose has no inter-word spaces, so a long mirrored line exposes ZERO
// soft-wrap opportunities and overflows its host horizontally (side-scroll).
describe('class O: mirror soft-wrap opportunities', () => {
    const TEXT = '言語学習支援';

    function paintThreeWords(host: HTMLElement): void {
        paint(host, TEXT, target => {
            const base = target.text.indexOf(TEXT);
            return [
                tokenAt(target.text, '言語', 'げんご', base),
                tokenAt(target.text, '学習', 'がくしゅう', base + 2),
                tokenAt(target.text, '支援', 'しえん', base + 4),
            ];
        });
    }

    it('inserts a <wbr> break opportunity between adjacent mirrored word tokens', () => {
        document.body.innerHTML = `<span id="t" class="ytAttributedStringHost">${TEXT}</span>`;
        const host = document.getElementById('t')!;
        paintThreeWords(host);
        const m = mirror(host);
        const words = m.querySelectorAll('.jpdb-reader-word');
        expect(words.length).toBe(3);
        // Between each pair of ADJACENT word spans there must be a wbr.
        const breaks = m.querySelectorAll('wbr');
        expect(breaks.length).toBe(2);
        expect(words[0]!.nextElementSibling?.tagName).toBe('WBR');
        expect(words[1]!.previousElementSibling?.tagName).toBe('WBR');
    });

    it('keeps copied/mirrored text free of ZWSP and other break artifacts', () => {
        document.body.innerHTML = `<span id="t" class="ytAttributedStringHost">${TEXT}</span>`;
        const host = document.getElementById('t')!;
        paintThreeWords(host);
        const m = mirror(host);
        // <wbr> carries no text: textContent must be the exact source text plus
        // readings in rt only — never U+200B (which would leak into clipboard on
        // engines that ignore user-select:none for programmatic ranges).
        expect(m.textContent).not.toContain('​');
        expect(host.textContent).not.toContain('​');
        const baseText = Array.from(m.querySelectorAll('.jpdb-reader-ruby-base')).map(b => b.textContent).join('');
        expect(baseText).toBe(TEXT);
    });

    it('does not insert breaks between non-adjacent tokens (plain text keeps its own wrap points)', () => {
        const MIXED = '言語と学習';
        document.body.innerHTML = `<span id="t" class="ytAttributedStringHost">${MIXED}</span>`;
        const host = document.getElementById('t')!;
        paint(host, MIXED, target => {
            const base = target.text.indexOf(MIXED);
            return [
                tokenAt(target.text, '言語', 'げんご', base),
                tokenAt(target.text, '学習', 'がくしゅう', base + 3),
            ];
        });
        expect(mirror(host).querySelectorAll('wbr').length).toBe(0);
    });

    it('withdraws the forced overflow:visible unclip when the mirror does not fit its host', () => {
        vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockImplementation(function (this: Element) {
            return this.classList?.contains('jpdb-reader-text-mirror') ? 500 : 100;
        });
        vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(() => 100);
        document.body.innerHTML = `<span id="t" class="ytAttributedStringHost" style="overflow: hidden">${TEXT}</span>`;
        const host = document.getElementById('t')!;
        paintThreeWords(host);
        mirror(host);
        // The mirror overflows the host box: forcing overflow:visible would let
        // the runaway line escape its container (horizontal page scroll).
        expect(host.style.getPropertyValue('overflow')).toBe('hidden');
    });

    it('keeps the ruby unclip when the mirror fits its host', () => {
        vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockImplementation(() => 100);
        vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(() => 100);
        document.body.innerHTML = `<span id="t" class="ytAttributedStringHost" style="overflow: hidden">${TEXT}</span>`;
        const host = document.getElementById('t')!;
        paintThreeWords(host);
        mirror(host);
        expect(host.style.getPropertyValue('overflow')).toBe('visible');
        expect(host.style.getPropertyPriority('overflow')).toBe('important');
    });
});

// Class R — the mirror synthesizes spaces the page never renders.
describe('class R: mirror must not invent spaces', () => {
    it('flex-item boundary whitespace (Discord mention rows): ポーラン + @Canna stay unspaced', () => {
        // The whitespace between the direct text run and the mention span sits
        // at a flex-item boundary — the page never renders it, so the mirror
        // must not turn it into a literal space.
        document.body.innerHTML = '<div id="msg" class="message_abc" style="display: flex">ポーラン\n  <span>@Canna</span></div>';
        const host = document.getElementById('msg')!;
        (host as HTMLElement & Record<string, unknown>).__reactFiber$test = {};
        paint(host, 'ポーラン', target => [tokenAt(target.text, 'ポーラン', 'ぽーらん', target.text.indexOf('ポーラン'))]);
        expect(renderedMirrorText(mirror(host))).toBe('ポーラン@Canna');
    });

    it('skips computed-hidden descendant text (display:none never reaches the mirror)', () => {
        document.body.innerHTML = '<div id="msg" style="display: flex">日本語\n<span style="display: none">隠れた</span></div>';
        const host = document.getElementById('msg')!;
        (host as HTMLElement & Record<string, unknown>).__reactFiber$test = {};
        paint(host, '日本語', target => [tokenAt(target.text, '日本語', 'にほんご', target.text.indexOf('日本語'))]);
        expect(renderedMirrorText(mirror(host))).toBe('日本語');
    });

    it('treats halfwidth katakana as CJK: a line break next to ｶﾌｪ synthesizes no space', () => {
        document.body.innerHTML = '<div id="msg" style="display: flex">喫茶\nｶﾌｪ屋<span>先生</span></div>';
        const host = document.getElementById('msg')!;
        (host as HTMLElement & Record<string, unknown>).__reactFiber$test = {};
        paint(host, '喫茶', target => [tokenAt(target.text, '喫茶', 'きっさ', target.text.indexOf('喫茶'))]);
        expect(renderedMirrorText(mirror(host))).toBe('喫茶ｶﾌｪ屋先生');
    });

    it('still keeps a single space at Latin boundaries inside one inline context', () => {
        document.body.innerHTML = '<div id="msg">日本語\nguide<span>です</span></div>';
        const host = document.getElementById('msg')!;
        (host as HTMLElement & Record<string, unknown>).__reactFiber$test = {};
        paint(host, '日本語', target => [tokenAt(target.text, '日本語', 'にほんご', target.text.indexOf('日本語'))]);
        expect(renderedMirrorText(mirror(host))).toBe('日本語 guideです');
    });

    it('removes a mirror relocated OUTSIDE the host subtree on repaint (no duplicated text)', () => {
        document.body.innerHTML = '<div id="row"><div id="msg">日本語</div><div id="sibling"></div></div>';
        const host = document.getElementById('msg')!;
        const sibling = document.getElementById('sibling')!;
        const paintMsg = () => paint(host, '日本語', target => [tokenAt(target.text, '日本語', 'にほんご', target.text.indexOf('日本語'))]);
        paintMsg();
        // Framework reconciliation relocates the mirror to a host SIBLING —
        // outside host.querySelectorAll scope — between paints.
        sibling.append(mirror(host));
        paintMsg();
        expect(document.querySelectorAll('.jpdb-reader-text-mirror').length).toBe(1);
        expect(host.querySelectorAll('.jpdb-reader-text-mirror').length).toBe(1);
    });
});

// Adversarial (gpt-5.6-sol) review regressions over the slice-2 fixes.
describe('sol review: mirror fidelity edge cases', () => {
    function reactHost(id: string): HTMLElement {
        const host = document.getElementById(id)!;
        (host as HTMLElement & Record<string, unknown>).__reactFiber$test = {};
        return host;
    }

    it('keeps a REAL space beside an atomic inline-level box (inline-flex badge)', () => {
        // The inline-flex box participates in the surrounding inline formatting
        // context: whitespace adjacent to it renders on the page and must
        // survive in the mirror. Only whitespace BETWEEN items inside the box
        // is layout-dropped.
        document.body.innerHTML = '<div id="msg">ラベル<span style="display: inline-flex">JP</span>\n日本語です</div>';
        const host = reactHost('msg');
        paint(host, '日本語', target => [tokenAt(target.text, '日本語', 'にほんご', target.text.indexOf('日本語'))]);
        expect(renderedMirrorText(mirror(host))).toBe('ラベルJP 日本語です');
    });

    it('drops whitespace-only anonymous flex items even under preserving white-space modes', () => {
        // css-flexbox-1 §4: a child text sequence containing ONLY white space
        // is not rendered, regardless of the white-space property.
        document.body.innerHTML = '<div id="msg" style="display: flex; white-space: pre">日本語<span>アニメ</span> <span>です</span></div>';
        const host = reactHost('msg');
        paint(host, '日本語', target => [tokenAt(target.text, '日本語', 'にほんご', target.text.indexOf('日本語'))]);
        expect(renderedMirrorText(mirror(host))).toBe('日本語アニメです');
    });

    it('preserves pre-wrap whitespace runs verbatim instead of collapsing them', () => {
        document.body.innerHTML = '<div id="msg" style="white-space: pre-wrap">日本語\n  guide</div>';
        const host = reactHost('msg');
        paint(host, '日本語', target => [tokenAt(target.text, '日本語', 'にほんご', target.text.indexOf('日本語'))]);
        expect(renderedMirrorText(mirror(host))).toBe('日本語\n  guide');
    });

    it('resolves display:contents wrappers to their promoted flex items (no space)', () => {
        document.body.innerHTML = '<div id="msg" style="display: flex"><div style="display: contents">ポーラン\n<span>@Canna</span></div></div>';
        const host = reactHost('msg');
        paint(host, 'ポーラン', target => [tokenAt(target.text, 'ポーラン', 'ぽーらん', target.text.indexOf('ポーラン'))]);
        expect(renderedMirrorText(mirror(host))).toBe('ポーラン@Canna');
    });

    it('skips text hidden by an ANCESTOR display:none, not just the direct parent', () => {
        document.body.innerHTML = '<div id="msg" style="display: flex">日本語\n<span style="display: none"><em>隠れた</em></span></div>';
        const host = reactHost('msg');
        paint(host, '日本語', target => [tokenAt(target.text, '日本語', 'にほんご', target.text.indexOf('日本語'))]);
        expect(renderedMirrorText(mirror(host))).toBe('日本語');
    });

    it('re-renders the mirror when a layout flip (flex→block) changes whitespace semantics', () => {
        document.body.innerHTML = '<div id="msg" style="display: flex">ポーラン\n  <span>@Canna</span></div>';
        const host = reactHost('msg');
        const paintMsg = () => paint(host, 'ポーラン', target => [tokenAt(target.text, 'ポーラン', 'ぽーらん', target.text.indexOf('ポーラン'))]);
        paintMsg();
        expect(renderedMirrorText(mirror(host))).toBe('ポーラン@Canna');
        // Same text, same tokens — but the page now renders a space. The
        // sourceText+signature idempotency alone would keep the stale mirror.
        host.style.display = 'block';
        paintMsg();
        expect(renderedMirrorText(mirror(host))).toBe('ポーラン @Canna');
    });

    it('keeps the unclip when only the RUBY (not the base text) is wider than the host', () => {
        // A narrow label (順 with じゅん) has fitting base text but a wider
        // reading: the overflow gate must measure the base text WITHOUT rt, or
        // it re-clips the annotation it exists to reveal.
        vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockImplementation(function (this: Element) {
            if (!(this instanceof HTMLElement) || !this.classList.contains('jpdb-reader-text-mirror')) return 100;
            const rubyHidden = Array.from(this.querySelectorAll<HTMLElement>('rt'))
                .every(rt => rt.style.display === 'none');
            return rubyHidden ? 100 : 500;
        });
        vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(() => 100);
        document.body.innerHTML = '<span id="t" class="ytAttributedStringHost" style="overflow: hidden">言語学習支援</span>';
        const host = document.getElementById('t')!;
        paint(host, '言語', target => {
            const base = target.text.indexOf('言語');
            return [tokenAt(target.text, '言語', 'げんご', base), tokenAt(target.text, '学習', 'がくしゅう', base + 2)];
        });
        mirror(host);
        expect(host.style.getPropertyValue('overflow')).toBe('visible');
        // The measurement pass must leave the readings visible afterwards.
        mirror(host).querySelectorAll<HTMLElement>('rt').forEach(rt => expect(rt.style.display).not.toBe('none'));
    });

    it('clip-constrained rows: host stays unclipped for the reveal, but the MIRROR self-clips at rest', () => {
        vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockImplementation(function (this: Element) {
            return (this instanceof HTMLElement && this.classList.contains('jpdb-reader-text-mirror')) ? 500 : 100;
        });
        vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(() => 100);
        document.body.innerHTML = '<span id="t" class="ytAttributedStringHost" style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap">言語学習支援</span>';
        const host = document.getElementById('t')!;
        paint(host, '言語', target => {
            const base = target.text.indexOf('言語');
            return [tokenAt(target.text, '言語', 'げんご', base), tokenAt(target.text, '学習', 'がくしゅう', base + 2)];
        });
        // The host unclip must survive (hover/ruby-room ruby reveal paints
        // outside the row) …
        expect(mirror(host).dataset.yomuClipConstrained).toBe('true');
        expect(host.style.getPropertyValue('overflow')).toBe('visible');
        // … while the MIRROR clips itself to the host box at rest, so a 500px
        // base line cannot escape a 100px ellipsized title horizontally.
        // CSS-driven so :hover / ruby-room growth can release it.
        const restRule = mirrorCss.match(/(^|\n)\.jpdb-reader-text-mirror\[data-yomu-clip-constrained="true"\]\s*\{[^}]*\}/)?.[0] ?? '';
        expect(restRule).toContain('overflow: hidden !important');
        const revealRule = mirrorCss.match(/(^|\n)[^{}]*data-yomu-clip-constrained[^{}]*:hover[^{}]*\{[^}]*\}/)?.[0] ?? '';
        expect(revealRule).toContain('overflow: visible !important');
        expect(revealRule).toContain('data-yomu-ruby-room');
    });

    it('threads whitespace joints through multi-node fragment targets (production Discord path)', () => {
        // The real Discord shape: one FragmentTextTarget spanning the direct
        // text run AND the mention span, whose text equals the host text — the
        // plan must not lose the joints on that equality fast path.
        document.body.innerHTML = '<div id="msg" style="display: flex">ポーラン先生\n  <span>@Canna さん</span></div>';
        const host = reactHost('msg');
        const target = collectFragmentTextTargetsIn(host, 400, false).find(t => t.text.includes('ポーラン'))!;
        expect(target).toBeTruthy();
        expect(target.fragments.length >= 2, 'multi-node production fragment target').toBe(true);
        const base = target.text.indexOf('ポーラン');
        applyTokensToScanTarget(
            { ...target, nonDestructive: true },
            [tokenAt(target.text, 'ポーラン', 'ぽーらん', base)],
            { ...DEFAULT_SETTINGS, furiganaMode: 'all' },
        );
        // Flex-item boundary whitespace never renders; the intra-node latin
        // space inside the mention span does.
        expect(renderedMirrorText(mirror(host))).toBe('ポーラン先生@Canna さん');
    });

    it('keeps an explicitly visibility:visible descendant under a hidden ancestor (CSS 2.2)', () => {
        document.body.innerHTML = '<div id="msg" style="display: flex">日本語\n<span style="visibility: hidden">駄目<em style="visibility: visible">見える</em></span></div>';
        const host = reactHost('msg');
        paint(host, '日本語', target => [tokenAt(target.text, '日本語', 'にほんご', target.text.indexOf('日本語'))]);
        expect(renderedMirrorText(mirror(host))).toBe('日本語見える');
    });

    it('hides the mirror when the page conceals the host after annotation (menu close)', () => {
        document.body.innerHTML = '<div id="menu"><div id="msg">日本語です</div></div>';
        const host = reactHost('msg');
        const menu = document.getElementById('menu')!;
        const paintMsg = () => paint(host, '日本語', target => [tokenAt(target.text, '日本語', 'にほんご', target.text.indexOf('日本語'))]);
        paintMsg();
        expect(mirror(host).style.getPropertyValue('visibility')).toBe('visible');
        // The dropdown closes via ancestor visibility — the mirror's forced
        // visibility:visible would otherwise float the label over the page.
        menu.style.visibility = 'hidden';
        paintMsg();
        expect(mirror(host).style.getPropertyValue('visibility')).toBe('hidden');
        menu.style.visibility = '';
        paintMsg();
        expect(mirror(host).style.getPropertyValue('visibility')).toBe('visible');
    });

    it('flattens nested display:contents into one contiguous anonymous flex item (space renders)', () => {
        document.body.innerHTML = '<div id="msg" style="display: flex">日本<div style="display: contents"><div style="display: contents">ポーラン</div> gold</div></div>';
        const host = reactHost('msg');
        paint(host, '日本', target => [tokenAt(target.text, '日本', 'にほん', target.text.indexOf('日本'))]);
        // Box construction elides both contents wrappers: ポーラン and " gold"
        // are contiguous text runs forming ONE anonymous item, so the space
        // between them renders.
        expect(renderedMirrorText(mirror(host))).toBe('日本ポーラン gold');
    });

    it('does not flatten native rt readings into mirrored base text', () => {
        document.body.innerHTML = '<div id="msg"><ruby>東京<rt>とうきょう</rt></ruby>です</div>';
        const host = reactHost('msg');
        paint(host, '東京', target => [tokenAt(target.text, '東京', 'とうきょう', target.text.indexOf('東京'))]);
        expect(renderedMirrorText(mirror(host))).toBe('東京です');
    });

    it('sweeps a registered orphan even when it was relocated into a shadow root', () => {
        document.body.innerHTML = '<div id="row"><div id="msg">日本語</div><div id="sibling"></div></div>';
        const host = document.getElementById('msg')!;
        const shadow = document.getElementById('sibling')!.attachShadow({ mode: 'open' });
        const paintMsg = () => paint(host, '日本語', target => [tokenAt(target.text, '日本語', 'にほんご', target.text.indexOf('日本語'))]);
        paintMsg();
        shadow.append(mirror(host));
        paintMsg();
        const total = document.querySelectorAll('.jpdb-reader-text-mirror').length
            + shadow.querySelectorAll('.jpdb-reader-text-mirror').length;
        expect(total).toBe(1);
    });
});

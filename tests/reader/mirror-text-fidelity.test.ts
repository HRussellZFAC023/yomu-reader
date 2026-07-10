import { afterEach, describe, expect, it, vi } from 'vitest';

import { applyTokensToScanTarget, collectTextTargetsIn, removeNonDestructiveScanMirrors } from '../../src/reader/dom';
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

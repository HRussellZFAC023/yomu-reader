import { afterEach, describe, expect, it } from 'vitest';

import { applyTokensToScanTarget, removeNonDestructiveScanMirrors } from '../../src/reader/dom';
import { collectScanTargets } from '../../src/reader/app/site-parsers';
import { segmentJapaneseText } from '../../src/reader/lookup/japanese-segments';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';

function fallbackCard(surface: string): JPDBCard {
    return {
        vid: -1, sid: -1, rid: 0, spelling: surface, reading: 'な', frequencyRank: null,
        partOfSpeech: [], meanings: [], cardState: ['not-in-deck'], pitchAccent: [],
        wordWithReading: null, source: 'fallback',
    };
}

// Tokens carrying a reading -> ruby rendering, like the live (keyed) parse path.
function readingTokens(text: string): JPDBToken[] {
    return segmentJapaneseText(text).map(segment => ({
        card: fallbackCard(segment.surface),
        start: segment.start,
        end: segment.end,
        length: segment.end - segment.start,
        rubies: [{ text: 'な', start: segment.start, end: segment.end, length: segment.end - segment.start }],
        pitchClass: '',
        sentence: text,
    }));
}

// What the user actually reads: text under an inline visibility:hidden element is
// invisible unless a descendant flips visibility back to visible (the mirror).
// Furigana annotations (rt / .jpdb-reader-furi) are skipped so the assertion
// measures the base sentence rather than the interleaved readings.
const RUBY_ANNOTATION_SELECTOR = 'rt,rp,.jpdb-reader-furi';
function visibleText(root: Node, inheritedHidden = false): string {
    let out = '';
    root.childNodes.forEach(node => {
        if (node.nodeType === Node.TEXT_NODE) {
            if (!inheritedHidden) out += node.textContent ?? '';
            return;
        }
        if (!(node instanceof HTMLElement) || node.matches(RUBY_ANNOTATION_SELECTOR)) return;
        const value = node.style.getPropertyValue('visibility');
        const hidden = value === 'hidden' ? true : value === 'visible' ? false : inheritedHidden;
        out += visibleText(node, hidden);
    });
    return out;
}
const normalize = (text: string): string => text.replace(/\s+/g, ' ').trim();

let restoreRect: (() => void) | null = null;
function mockVisibleRects(): void {
    const original = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function () {
        return { x: 0, y: 0, width: 600, height: 20, top: 0, right: 600, bottom: 20, left: 0, toJSON: () => ({}) } as DOMRect;
    };
    restoreRect = () => { HTMLElement.prototype.getBoundingClientRect = original; };
}

function scanAndAnnotate(): void {
    for (const target of collectScanTargets(40, 'https://example.com/page')) {
        applyTokensToScanTarget(target, readingTokens(target.text), { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
    }
}

afterEach(() => {
    removeNonDestructiveScanMirrors(document.body);
    document.body.innerHTML = '';
    restoreRect?.();
    restoreRect = null;
});

// Mixed-script surfaces must preserve every page-owned text node. The generic
// scanner may annotate the Japanese leaf inline or choose a source-preserving
// mirror when real framework ownership is detected; neither path may flatten or
// hide the surrounding English and links.
describe('mixed-script annotation keeps page-owned host text visible', () => {
    it('preserves every word of a link-interspersed paragraph on a managed app shell', () => {
        mockVisibleRects();
        document.body.innerHTML = `<shreddit-app><div class="comment"><p>You collect your package at a pick-up point.</p><p>Cainiao operates a network of <a href="#">courier</a> pick-up points known as Cainiao Stations (<a href="#">Chinese</a>: 菜鸟驿站) across <a href="#">the Chinese mainland</a>. These stations are strategically situated in residential neighborhoods.</p><p><a href="#">https://en.wikipedia.org/wiki/Cainiao</a></p></div></shreddit-app>`;

        scanAndAnnotate();

        const visible = normalize(visibleText(document.body));
        for (const phrase of ['You collect your package', 'Cainiao operates a network of', 'courier', 'pick-up points known as Cainiao Stations', 'Chinese', '菜鸟驿站', 'across', 'the Chinese mainland', 'These stations are strategically situated', 'en.wikipedia.org/wiki/Cainiao']) {
            expect(visible, `vanished: "${phrase}"`).toContain(phrase);
        }
    });

    it('still applies furigana to the CJK run inside the preserved text', () => {
        mockVisibleRects();
        document.body.innerHTML = `<shreddit-app><div class="comment"><p>well <a href="#">known</a> as Cainiao Stations (Chinese: 菜鸟驿站) across the mainland.</p></div></shreddit-app>`;

        scanAndAnnotate();

        const annotatedWord = document.querySelector('.jpdb-reader-word');
        expect(annotatedWord, 'expected the Japanese leaf to be annotated').toBeTruthy();
        expect(annotatedWord!.querySelector('rt, .jpdb-reader-furi'), 'expected rendered furigana').toBeTruthy();
        const visible = normalize(visibleText(document.body));
        expect(visible).toContain('as Cainiao Stations');
        expect(visible).toContain('across the mainland');
    });

    it('is generic: preserves surrounding text on a React (#root) shell too', () => {
        mockVisibleRects();
        document.body.innerHTML = `<div id="root"><div class="comment"><p>The store is called <a href="#">セブン</a>イレブン and it is open all night near the 駅 downtown.</p></div></div>`;

        scanAndAnnotate();

        const visible = normalize(visibleText(document.body));
        for (const phrase of ['The store is called', 'and it is open all night near the', 'downtown']) {
            expect(visible, `vanished: "${phrase}"`).toContain(phrase);
        }
        expect(visible).toContain('駅');
    });
});

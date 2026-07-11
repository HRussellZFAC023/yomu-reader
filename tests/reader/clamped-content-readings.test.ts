import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { applyTokensToScanTarget, removeNonDestructiveScanMirrors } from '../../src/reader/dom';
import { contentClipRowShowsRestReadings } from '../../src/reader/dom/decoration-policy';
import { collectScanTargets } from '../../src/reader/app/site-parsers';
import { VisiblePageScanner } from '../../src/reader/app/visible-page-scanner';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import type { FragmentTextTarget } from '../../src/reader/dom';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';

const SNIPPET = '東京都の天気予報によると明日は晴れの見込みです';
const FURI = { ...DEFAULT_SETTINGS, showFurigana: true, furiganaMode: 'all' as const };

function card(spelling: string, reading: string): JPDBCard {
    return {
        vid: 1, sid: 1, rid: 0, spelling, reading, frequencyRank: null,
        partOfSpeech: [], meanings: [], cardState: ['not-in-deck'], pitchAccent: [], wordWithReading: null, source: 'jpdb',
    };
}

function token(spelling: string, start: number, sentence: string, reading: string): JPDBToken {
    return {
        card: card(spelling, reading),
        start, end: start + spelling.length, length: spelling.length,
        rubies: [{ text: reading, start, end: start + spelling.length, length: spelling.length }],
        pitchClass: '', sentence,
    };
}

function fragmentTarget(host: HTMLElement, text: string, decoration: FragmentTextTarget['decoration']): FragmentTextTarget {
    return {
        text,
        parent: host,
        fragments: [{ node: host.firstChild as Text, start: 0, end: text.length, hasNativeRuby: false }],
        decoration,
    };
}

afterEach(() => {
    removeNonDestructiveScanMirrors(document);
    document.body.innerHTML = '';
    document.documentElement.removeAttribute('data-yomu-clamped-readings');
    vi.unstubAllGlobals();
});

// Only semantic long-form prose may let a clamped row grow naturally for
// in-flow readings. Search cards and app chrome use the paint-invariant
// hover-only channel: WebKit can otherwise crop the base while leaving rt, or
// grow a flex card into the large empty gap reported on iPad.
describe('clamped content preserves base text and bounded geometry', () => {
    it('stamps a semantic article paragraph as "content" (readings visible at rest)', () => {
        document.body.innerHTML = `
            <main><article>
                <p class="prose" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:22px">${SNIPPET}</p>
            </article></main>
        `;
        const row = document.querySelector<HTMLElement>('.prose')!;
        applyTokensToScanTarget(fragmentTarget(row, SNIPPET, 'prose-full'), [token('東京', 0, SNIPPET, 'とうきょう')], FURI);

        // The in-place channel stamps "content", NOT "true": the rest-hide CSS
        // is value-exact on "true", so readings stay visible at rest and the
        // clamped row grows naturally via the in-flow ruby line box.
        expect(row.dataset.yomuClipConstrained).toBe('content');
        expect(row.querySelector('.jpdb-reader-word ruby rt')?.textContent).toBe('とうきょう');
    });

    it('stamps a Google-style result DIV as "true" so its base stays in the authored row', () => {
        document.body.innerHTML = `
            <div id="search"><div class="g">
                <div class="VwiC3b" style="display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;line-height:22px">${SNIPPET}</div>
            </div></div>
        `;
        const row = document.querySelector<HTMLElement>('.VwiC3b')!;
        applyTokensToScanTarget(fragmentTarget(row, SNIPPET, 'content-ruby'), [token('東京', 0, SNIPPET, 'とうきょう')], FURI);

        expect(row.dataset.yomuClipConstrained).toBe('true');
        expect(row.querySelector('.jpdb-reader-word ruby rt')?.textContent).toBe('とうきょう');
        expect(row.dataset.yomuRubyRoom).toBeUndefined();
    });

    it('keeps a definite-height clip row rest-hidden even for content (in-flow growth impossible)', () => {
        document.body.innerHTML = `<main><p id="fixed" style="overflow:hidden;max-height:44px;line-height:22px">${SNIPPET}</p></main>`;
        const row = document.querySelector<HTMLElement>('#fixed')!;
        Object.defineProperty(row, 'getBoundingClientRect', {
            configurable: true,
            value: () => ({ x: 0, y: 0, left: 0, top: 0, right: 320, bottom: 44, width: 320, height: 44, toJSON: () => ({}) }) as DOMRect,
        });
        applyTokensToScanTarget(fragmentTarget(row, SNIPPET, 'prose-full'), [token('東京', 0, SNIPPET, 'とうきょう')], FURI);
        expect(row.dataset.yomuClipConstrained).toBe('true');
    });

    it('vetoes at-rest readings when the clamp row carries an authored max-height cap', () => {
        document.body.innerHTML = `<main><p id="capped" style="display:-webkit-box;-webkit-line-clamp:2;overflow:hidden;max-height:44px">${SNIPPET}</p></main>`;
        const row = document.querySelector<HTMLElement>('#capped')!;
        expect(contentClipRowShowsRestReadings('prose-full', row)).toBe(false);
    });

    it('never grants at-rest readings to interactive-passive or skip rows', () => {
        document.body.innerHTML = `<div id="row" style="display:-webkit-box;-webkit-line-clamp:2;overflow:hidden">${SNIPPET}</div>`;
        const row = document.querySelector<HTMLElement>('#row')!;
        expect(contentClipRowShowsRestReadings('interactive-passive', row)).toBe(false);
        expect(contentClipRowShowsRestReadings('skip', row)).toBe(false);
        expect(contentClipRowShowsRestReadings(undefined, row)).toBe(false);
        expect(contentClipRowShowsRestReadings('content-ruby', row)).toBe(false);
        expect(contentClipRowShowsRestReadings('prose-full', row)).toBe(false);

        document.body.innerHTML = `<main><p id="prose" style="display:-webkit-box;-webkit-line-clamp:2;overflow:hidden">${SNIPPET}</p></main>`;
        const prose = document.querySelector<HTMLElement>('#prose')!;
        expect(contentClipRowShowsRestReadings('prose-full', prose)).toBe(true);
    });

    it('ships the hover-only override CSS keyed on the root stamp and keeps the rest-hide rule value-exact', () => {
        const css = readFileSync(resolve(process.cwd(), 'src/reader/styles/reader-words-ocr.css'), 'utf8');
        expect(css).toContain(':root[data-yomu-clamped-readings="hover"]');
        expect(css).toContain('[data-yomu-clip-constrained="content"]');
        // The blanket rest-hide must stay scoped to the chrome value so
        // "content" rows are visible at rest by default: the ONLY selector
        // that hides "content" readings is the :root hover-mode rule.
        expect(css).toContain('[data-yomu-clip-constrained="true"]:not(.jpdb-reader-text-mirror) .jpdb-reader-word rt.jpdb-reader-furi');
        expect(css).toMatch(/@media \(hover: hover\) and \(pointer: fine\)[\s\S]*\[data-yomu-clip-hover-host="true"\]:hover/);
        expect(css).toMatch(/@media \(hover: none\), \(pointer: coarse\)[\s\S]*\.jpdb-reader-clip-hover-mirror[\s\S]*visibility: visible !important/);
        expect(css).toMatch(/@media \(hover: none\), \(pointer: coarse\)[\s\S]*rt\.jpdb-reader-furi[\s\S]*display: none !important/);
        const contentSelectorUses = css.split('[data-yomu-clip-constrained="content"]').length - 1;
        expect(contentSelectorUses).toBe(1);
        expect(css).toMatch(/:root\[data-yomu-clamped-readings="hover"\]\s*\[data-yomu-clip-constrained="content"\]/);
    });

    it('syncs the hover-only root stamp from the clampedRowReadings setting on scan', async () => {
        const scanner = (settings: typeof DEFAULT_SETTINGS) => new VisiblePageScanner({
            getSettings: () => settings,
            parseJapanese: async paragraphs => paragraphs.map(() => []),
            pauseMutationObserver: callback => callback(),
            preloadParsedTokens: () => undefined,
            enrichPitchWords: () => undefined,
            enrichAnkiWords: () => undefined,
            toast: () => undefined,
        });
        await scanner({ ...DEFAULT_SETTINGS, clampedRowReadings: 'hover' }).scanVisiblePage({ silent: true });
        expect(document.documentElement.getAttribute('data-yomu-clamped-readings')).toBe('hover');
        await scanner({ ...DEFAULT_SETTINGS, clampedRowReadings: 'show' }).scanVisiblePage({ silent: true });
        expect(document.documentElement.hasAttribute('data-yomu-clamped-readings')).toBe(false);
    });
});

// Class E, Google-shaped fixture (user screenshot: partial annotation on a
// static results page — some words decorated, neighbours bare). One capped
// scan pass must COLLECT every Japanese-bearing result block; nothing about a
// simple static page may be dropped by budget/ordering.
describe('Google search results collection coverage (class E fixture)', () => {
    it('collects every clamped snippet block in one pass and classifies them as content', () => {
        vi.stubGlobal('location', {
            href: 'https://www.google.com/search?q=天気',
            origin: 'https://www.google.com',
            hostname: 'www.google.com',
            pathname: '/search',
        });
        const restoreRect = mockVisibleRects();
        try {
            document.body.innerHTML = `<div id="search">${Array.from({ length: 8 }, (_, index) => `
                <div class="g">
                    <h3 class="LC20lb">結果タイトル${index}の日本語</h3>
                    <div class="VwiC3b" style="display:-webkit-box;-webkit-line-clamp:2;overflow:hidden">説明文${index}は${SNIPPET}</div>
                </div>`).join('')}</div>`;

            const targets = collectScanTargets(200, 'https://www.google.com/search?q=天気');
            const covered = targets.map(target => target.text).join('\n');
            for (let index = 0; index < 8; index += 1) {
                expect(covered, `snippet ${index} must be collected`).toContain(`説明文${index}`);
                expect(covered, `title ${index} must be collected`).toContain(`結果タイトル${index}`);
            }
            for (const target of targets) {
                expect(target.decoration === 'interactive-passive').toBe(false);
            }
        } finally {
            restoreRect();
        }
    });
});

function mockVisibleRects(): () => void {
    const original = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function rect() {
        return { x: 0, y: 0, width: 320, height: 20, top: 0, right: 320, bottom: 20, left: 0, toJSON: () => ({}) } as DOMRect;
    };
    return () => {
        HTMLElement.prototype.getBoundingClientRect = original;
    };
}

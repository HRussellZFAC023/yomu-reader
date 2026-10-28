import { afterEach, describe, expect, it, vi } from 'vitest';

import { collectFragmentTextTargetsIn, collectTextTargetsIn } from '../../src/reader/dom';

// Footnote and citation markers are page navigation, not prose. ja.wikipedia
// prints them as [注釈 3]; annotating one put a reading over 注釈 and an
// underline under a link the reader never reads as part of the sentence.

const PASSIVE_PAGE_SCAN = {
    allowUiText: true,
    includeUiChrome: true,
    includeFormChrome: true,
    includeTabChrome: true,
    includePassiveInteractions: true,
    heading: true,
    minLength: 1,
} as const;

function mountWikipediaParagraph(): void {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
        left: 0, right: 900, top: 0, bottom: 40, width: 900, height: 40, x: 0, y: 0, toJSON: () => ({}),
    } as DOMRect);
    // Trimmed from the live ja.wikipedia 日本語 article (Parsoid markup).
    document.body.innerHTML = `<div class="mw-parser-output"><p id="prose"><b>日本語</b>（にほんご）`
        + `<sup class="mw-ref reference" id="cite_ref-9"><a id="note-link" href="#cite_note-9"><span class="mw-reflink-text">`
        + `<span class="cite-bracket">[</span>注釈 3<span class="cite-bracket">]</span></span></a></sup>`
        + `）は、<a href="/wiki/日本">日本</a>国内で使用されている言語。`
        + `<sup role="doc-noteref"><a href="#fn1">注1</a></sup>`
        + `<sup id="fnref:2"><a href="#fn:2" class="footnote-ref">注2</a></sup></p></div>`;
}

const texts = (targets: { text: string }[]): string => targets.map(target => target.text).join('|');

afterEach(() => {
    vi.restoreAllMocks();
    document.body.innerHTML = '';
});

describe('footnote and citation markers', () => {
    it('are skipped by the text-node collector, even though a short link label is otherwise admitted', () => {
        mountWikipediaParagraph();
        const collected = texts(collectTextTargetsIn(document.body, 40, true));
        expect(collected).toContain('日本');
        expect(collected).not.toMatch(/注釈|注1|注2/);
    });

    it('are skipped by the fragment collector walking the paragraph', () => {
        mountWikipediaParagraph();
        const collected = texts(collectFragmentTextTargetsIn(document.querySelector('#prose')!, 40, true, '', PASSIVE_PAGE_SCAN));
        expect(collected).toContain('国内で使用されている言語');
        expect(collected).not.toMatch(/注釈|注1|注2/);
    });

    it('are skipped when a collector roots at the marker link itself', () => {
        mountWikipediaParagraph();
        const link = document.querySelector('#note-link')!;
        expect(collectFragmentTextTargetsIn(link, 40, true, '', PASSIVE_PAGE_SCAN)).toEqual([]);
        expect(collectFragmentTextTargetsIn(link.querySelector('.mw-reflink-text')!, 40, true, '', PASSIVE_PAGE_SCAN)).toEqual([]);
    });
});

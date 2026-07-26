import { afterEach, describe, expect, it, vi } from 'vitest';

import { collectScanTargets } from '../../src/reader/app/site-parsers';
import { applyTokensToScanTarget, removeNonDestructiveScanMirrors } from '../../src/reader/dom';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';

const HREF = 'https://m.youtube.com/';
const CARD: JPDBCard = {
    vid: 1, sid: 1, rid: 0, spelling: '', reading: '', frequencyRank: null,
    partOfSpeech: [], meanings: [], cardState: ['not-in-deck'], pitchAccent: [],
    wordWithReading: null, source: 'jpdb',
};

// One token per kanji run — enough for every leaf of a feed row to render a word.
function tokensFor(text: string): JPDBToken[] {
    const tokens: JPDBToken[] = [];
    const kanjiRun = /[一-鿿]+/gu;
    let match: RegExpExecArray | null;
    while ((match = kanjiRun.exec(text))) {
        const spelling = match[0];
        tokens.push({
            card: { ...CARD, spelling, reading: 'かな' },
            start: match.index,
            end: match.index + spelling.length,
            length: spelling.length,
            rubies: [{ text: 'かな', start: 0, end: spelling.length, length: spelling.length }],
            pitchClass: '',
            sentence: text,
        });
    }
    return tokens;
}

function stubMobileYouTube(): void {
    vi.stubGlobal('location', {
        href: HREF, origin: 'https://m.youtube.com', hostname: 'm.youtube.com', pathname: '/',
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
        x: 0, y: 0, left: 0, top: 0, right: 320, bottom: 24,
        width: 320, height: 24, toJSON: () => ({}),
    } as DOMRect);
}

// A mobile feed row: the metadata line is ONE scan target spread over sibling
// leaf spans under a shared host.
const ROW = (title: string, views: string) => `
<ytm-video-with-context-renderer>
  <div class="media-item-info">
    <h3 class="media-item-headline"><span class="yt-core-attributed-string">${title}</span></h3>
    <div class="media-item-metadata">
      <span class="yt-core-attributed-string badge">新着</span>
      <span class="yt-core-attributed-string views">${views}</span>
      <span class="yt-core-attributed-string age">2時間前</span>
    </div>
  </div>
</ytm-video-with-context-renderer>`;

function silentScan(): ReturnType<typeof collectScanTargets> {
    return collectScanTargets(200, HREF, { skipMirroredHosts: true });
}

function silentScanTexts(): string[] {
    return silentScan().map(target => target.text.replace(/\s+/g, ' '));
}

function paint(targets: ReturnType<typeof collectScanTargets>): void {
    for (const target of targets) {
        applyTokensToScanTarget(target, tokensFor(target.text), { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
    }
}

function paintSilentScan(): string[] {
    const targets = silentScan();
    paint(targets);
    return targets.map(target => target.text.replace(/\s+/g, ' '));
}

function annotatedWords(root: ParentNode = document): string[] {
    return Array.from(root.querySelectorAll('.jpdb-reader-word')).map(word => word.textContent ?? '');
}

function mountedMirrors(): HTMLElement[] {
    return Array.from(document.querySelectorAll<HTMLElement>('.jpdb-reader-text-mirror'));
}

// A silent settle scan may only skip a target it has ALREADY ANNOTATED. Both
// directions of that fact have to hold, and each one is a shipped bug when it
// does not:
//   * too strict (the historic host-text EQUALITY test, which only a target
//     spanning its whole host could ever satisfy) re-collects and re-parses
//     every multi-node row on every settle, so a phone's parse budget is spent
//     re-doing finished work and freshly recycled rows stay bare;
//   * too loose (asking whether the HOST's text covers the target text) marks a
//     target done because a NEIGHBOUR sharing that host was rendered, and
//     nothing left in the system can ever heal it.
describe('recycled node re-annotation', () => {
    afterEach(() => {
        removeNonDestructiveScanMirrors(document);
        document.body.innerHTML = '';
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('re-annotates a reused node whose text was replaced', () => {
        stubMobileYouTube();
        document.body.innerHTML = `<ytm-rich-grid-renderer>${ROW('日本語の題名', '9.3万回視聴')}</ytm-rich-grid-renderer>`;
        expect(paintSilentScan().join('|')).toContain('9.3万回視聴');
        expect(annotatedWords()).toContain('万回視聴');

        // Recycle in place: the SAME leaf node is reused with new text.
        const views = document.querySelector<HTMLElement>('.views')!;
        views.textContent = '17万回視聴';

        expect(silentScanTexts().join('|')).toContain('17万回視聴');
        paintSilentScan();
        expect(annotatedWords(views.parentElement!)).toContain('万回視聴');
        expect(views.textContent).toContain('17万回視聴');
    });

    it('stops re-collecting rows it has already annotated', () => {
        stubMobileYouTube();
        document.body.innerHTML = `<ytm-rich-grid-renderer>${ROW('日本語の題名', '9.3万回視聴')}</ytm-rich-grid-renderer>`;
        paintSilentScan();

        // Nothing changed, so a silent settle scan has no work: a target spread
        // over several nodes must be recognised as already annotated, exactly
        // like the single-node title above it.
        expect(silentScanTexts()).toEqual([]);
    });

    it('keeps the freshly recycled row the only work after a settle scan', () => {
        stubMobileYouTube();
        document.body.innerHTML = `<ytm-rich-grid-renderer>${
            [0, 1, 2].map(index => ROW(`動画の題名${index}`, '9.3万回視聴')).join('')
        }</ytm-rich-grid-renderer>`;
        paintSilentScan();

        const recycled = document.querySelectorAll<HTMLElement>('.views')[2]!;
        recycled.textContent = '17万回視聴';

        const work = silentScanTexts();
        expect(work).toHaveLength(1);
        expect(work[0]).toContain('17万回視聴');
    });

    // A framework-owned host forces a source-preserving mirror even when it
    // holds several independently collected lines, so one mirror reproduces the
    // whole host text while carrying words for only ONE of them. The other line
    // is genuinely bare and must keep being offered.
    describe('two targets sharing one framework-owned host', () => {
        function mountSharedHostRow(): { annotated: HTMLElement; bare: HTMLElement } {
            stubMobileYouTube();
            document.body.innerHTML = '<ytm-rich-grid-renderer><ytm-video-with-context-renderer>'
                + '<div class="yt-core-attributed-string wrap">'
                + '<div class="badge-line">新<span>着の動画</span></div>'
                + '<div class="views-line">9.3万<span>回視聴</span></div>'
                + '</div></ytm-video-with-context-renderer></ytm-rich-grid-renderer>';
            const wrap = document.querySelector<HTMLElement>('.wrap')!;
            // The private expando a framework leaves on the nodes it owns.
            Object.defineProperty(wrap, '__reactFiber$test', { value: {}, configurable: true });
            return {
                annotated: document.querySelector<HTMLElement>('.badge-line')!,
                bare: document.querySelector<HTMLElement>('.views-line')!,
            };
        }

        it('still offers the line nobody annotated', () => {
            const { bare } = mountSharedHostRow();
            const targets = silentScan();
            expect(targets.map(target => target.text)).toEqual(['新着の動画', '9.3万回視聴']);

            // Only the first line is parsed and rendered — the second waited for
            // budget that never came.
            paint(targets.slice(0, 1));
            const [mirror] = mountedMirrors();
            // The trap this pins: one mirror, mounted on the host BOTH lines
            // share, whose source text covers the line it never annotated.
            expect(mountedMirrors()).toHaveLength(1);
            expect(mirror!.dataset.sourceText).toContain('9.3万回視聴');
            expect(annotatedWords(mirror!).join('')).not.toContain('回視聴');

            expect(silentScanTexts()).toEqual(['9.3万回視聴']);

            // And the offer is real work: painting it annotates the bare line.
            paintSilentScan();
            expect(annotatedWords().join('|')).toContain('回視聴');
            expect(bare.textContent).toContain('9.3万回視聴');
        });

        it('re-offers a line whose render a neighbour replaced', () => {
            mountSharedHostRow();
            const targets = silentScan();
            paint(targets.slice(0, 1));
            expect(silentScanTexts()).toEqual(['9.3万回視聴']);

            // The neighbour's render replaces the shared host's mirror, taking
            // the first line's words with it. "Already annotated" is a fact
            // about the standing render, not a one-way flag, so the first line
            // becomes work again instead of staying bare forever.
            paint(targets.slice(1));
            expect(silentScanTexts()).toContain('新着の動画');
        });
    });
});

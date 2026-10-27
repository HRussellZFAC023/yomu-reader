import { afterEach, describe, expect, it, vi } from 'vitest';

import { collectFragmentTextTargetsIn, collectTextTargetsIn } from '../../src/reader/dom';
import "../../src/reader/companions/register-build-companions";
import { collectSiteScanTargets } from "../../src/reader/app/site-parsers";
import { applyTokensToScanTarget, removeNonDestructiveScanMirrors } from "../../src/reader/dom";
import { testEnSettings } from "./helpers/settings-fixture";
import { readerTextMirrorForSource, readerWordsForSource } from "./helpers/text-mirror";
import type { JPDBToken } from "../../src/reader/app/types";

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

describe('visible page text boundaries', () => {
    afterEach(() => {
        removeNonDestructiveScanMirrors(document);
        document.body.innerHTML = '';
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
    });

    function token(text: string, spelling = text): JPDBToken {
        const start = text.indexOf(spelling);
        return {
            card: { vid: 1, sid: 1, rid: 0, spelling, reading: 'にほんご', frequencyRank: null,
                partOfSpeech: [], meanings: [], cardState: ['not-in-deck'], pitchAccent: [], wordWithReading: null, source: 'jpdb' },
            start, end: start + spelling.length, length: spelling.length, rubies: [], pitchClass: '', sentence: text,
        };
    }


    it('keeps clipped YouTube live announcements out of every collection path', () => {
        vi.stubGlobal('location', new URL('https://www.youtube.com/watch?v=fixture'));
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(new DOMRect(20, 20, 300, 30));
        document.body.innerHTML = `<ytd-watch-flexy><div id="movie_player"><yt-formatted-string id="message">再生が一時停止されました。<span class="ytp-sr-only">動画が開始されました。</span></yt-formatted-string></div><ytd-watch-metadata><h1>再生が一時停止されました。<span class="ytp-sr-only">動画が開始されました。</span></h1></ytd-watch-metadata></ytd-watch-flexy>`;
        const host = document.querySelector<HTMLElement>('#message')!;
        const options = { includePlayerChrome: true, includePassiveInteractions: true };
        const collections = [
            collectFragmentTextTargetsIn(host, 40, false, '', options),
            collectTextTargetsIn(host, 40, false),
            collectSiteScanTargets(40, location.href) ?? [],
        ];
        for (const [index, targets] of collections.entries()) {
            expect(targets.some(target => target.text.includes('再生')), `collection ${index}: ${targets.map(target => target.text).join('|')}`).toBe(true);
            expect(targets.some(target => target.text.includes('開始'))).toBe(false);
        }
        const target = collections[0]!.find(target => target.text.includes('再生'))!;
        applyTokensToScanTarget({ ...target, nonDestructive: true }, [token(target.text)], testEnSettings());
        expect(readerTextMirrorForSource(host)?.dataset.sourceText).not.toContain('開始');
        expect(host.querySelector('.ytp-sr-only')?.textContent).toBe('動画が開始されました。');
    });

    it('keeps mixed Latin/Japanese Reddit sidebar headings available for lookup', () => {
        vi.stubGlobal('location', new URL('https://www.reddit.com/r/codex/?locale=ja-JP'));
        document.body.innerHTML = '<aside><h2 id="rules" style="font-size:12px;text-transform:uppercase"><div class="i18n-translatable-text">r/codex のルール</div></h2><h2 id="data">REDDITのデータ</h2></aside>';
        for (const [id, spelling] of [['rules', 'ルール'], ['data', 'データ']]) {
            const host = document.getElementById(id!)!;
            const targets = collectFragmentTextTargetsIn(host, 40, false);
            const target = targets.find(candidate => candidate.text.includes(spelling!))!;
            expect(target).toBeTruthy();
            applyTokensToScanTarget({ ...target, nonDestructive: true }, [token(target.text, spelling)], testEnSettings());
            expect(readerWordsForSource(target.parent).some(word => word.dataset.surface === spelling)).toBe(true);
            expect(host.querySelector('.i18n-translatable-text')?.firstChild?.textContent ?? host.firstChild?.textContent).toContain(spelling);
        }
    });
});

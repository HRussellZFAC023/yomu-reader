import '../../src/reader/companions/register-build-companions';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { collectSiteScanTargets } from '../../src/reader/app/site-parsers';
import { applyTokensToScanTarget, collectFragmentTextTargetsIn, collectTextTargetsIn, removeNonDestructiveScanMirrors } from '../../src/reader/dom';
import { testEnSettings } from './helpers/settings-fixture';
import { readerTextMirrorForSource, readerWordsForSource } from './helpers/text-mirror';
import type { JPDBToken } from '../../src/reader/app/types';

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

describe('visible page text boundaries', () => {
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

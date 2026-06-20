import { describe, expect, it, vi } from 'vitest';

import { applyTokensToScanTarget, collectTextTargetsIn, readerWordSurfaceText } from '../../src/reader/dom';
import { collectScanTargets } from '../../src/reader/app/site-parsers';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { JPDBCard, JPDBToken } from '../../src/reader/app/types';

const composedKanjiCard: JPDBCard = {
    vid: 2400,
    sid: 2400,
    rid: 0,
    spelling: '発',
    reading: 'はつ',
    frequencyRank: null,
    partOfSpeech: [],
    meanings: [],
    cardState: ['not-in-deck'],
    pitchAccent: [],
    wordWithReading: null,
    source: 'jpdb',
};

function token(surface: string, reading: string): JPDBToken {
    return {
        card: { ...composedKanjiCard, spelling: surface, reading },
        start: 0,
        end: surface.length,
        length: surface.length,
        rubies: [{ text: reading, start: 0, end: surface.length, length: surface.length }],
        pitchClass: '',
        sentence: surface,
    };
}

// UT-64: jpdb.io structural widgets are mixed: pitch diagrams are per-mora
// letter soup, while "Kanji used" spellings are dictionary links the user can
// hover just like other JPDB terms.
describe('jpdb structural widget skip', () => {
    it('leaves the native large JPDB vocabulary title untouched while scanning detail prose', () => {
        const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
            left: 0,
            right: 900,
            top: 0,
            bottom: 320,
            width: 900,
            height: 320,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        } as DOMRect);
        document.body.innerHTML = `
            <div class="result vocabulary">
                <div class="subsection-headword">
                    <div class="subsection-spelling with-furigana">
                        <div class="primary-spelling">
                            <div class="spelling"><div><ruby class="v">表<rt>ひょう</rt>示<rt>じ</rt></ruby></div></div>
                        </div>
                    </div>
                </div>
                <div class="subsection-meanings">
                    <h6 class="subsection-label">Meanings</h6>
                    <div class="description">1. 表示されます</div>
                </div>
                <div class="subsection-composed-of-kanji">
                    <h6 class="subsection-label">Kanji used</h6>
                    <div class="subsection"><div>
                        <div class="spelling"><a class="plain" href="/kanji/表#a">表</a></div>
                        <div class="description">front side</div>
                    </div></div>
                </div>
            </div>`;

        const targets = collectScanTargets(40, 'https://jpdb.io/vocabulary/1489610/%E8%A1%A8%E7%A4%BA/%E3%81%B2%E3%82%87%E3%81%86%E3%81%98?lang=english#a');
        rectSpy.mockRestore();
        const texts = targets.map(target => target.text.trim()).filter(Boolean);
        expect(texts).toContain('1. 表示されます');
        expect(texts).toContain('表');
        expect(texts).not.toContain('表示');
        document.body.innerHTML = '';
    });

    it('annotates the kanji-used spelling glyph and skips the pitch diagram', () => {
        const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
            left: 0,
            right: 800,
            top: 0,
            bottom: 240,
            width: 800,
            height: 240,
            x: 0,
            y: 0,
            toJSON: () => ({}),
        } as DOMRect);
        document.body.innerHTML = `
            <div class="subsection-composed-of-kanji">
                <h6 class="subsection-label">Kanji used</h6>
                <div class="subsection"><div>
                    <div class="spelling"><a class="plain" href="/kanji/発#a">発</a></div>
                    <div class="description">calm 落ち着き</div>
                </div></div>
            </div>
            <div class="subsection-pitch-accent">
                <h6 class="subsection-label">Pitch accent</h6>
                <div class="subsection"><div>おだやか</div></div>
            </div>
            <div class="subsection-meanings"><p id="prose">穏やかな海。</p></div>`;
        const targets = collectScanTargets(40, 'https://jpdb.io/search?q=%E7%99%BA');
        rectSpy.mockRestore();
        const texts = targets.map(target => target.text.trim()).filter(Boolean);
        expect(texts.join(' ')).toContain('穏やかな海。');
        expect(texts.some(text => text === '発')).toBe(true);
        expect(texts.some(text => text === 'おだやか')).toBe(false);
        // the keyword/description row remains annotatable prose
        expect(texts.some(text => text.includes('落ち着き'))).toBe(true);

        const target = targets.find(item => item.text.trim() === '発');
        expect(target).toBeTruthy();
        applyTokensToScanTarget(target!, [token('発', 'はつ')], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
        const word = document.querySelector<HTMLElement>('.subsection-composed-of-kanji .spelling .jpdb-reader-word')!;
        expect(readerWordSurfaceText(word)).toBe('発');
        expect(word.querySelector('rt')?.textContent).toBe('はつ');
        document.body.innerHTML = '';
    });
});

// UT-76/79: short Japanese control labels annotate generically on any site
// as click-transparent passive words — no per-site element lists.
describe('control label annotation allowance', () => {
    it('collects short Japanese control labels and skips long/non-Japanese ones', () => {
        document.body.innerHTML = `
            <div class="chips"><button>最近アップロードされた動画</button></div>
            <button id="plain">設定を開く</button>
            <button id="english">Open settings</button>
            <button id="long">${'こ'.repeat(80)}</button>`;
        const targets = collectTextTargetsIn(document.body, 20, false);
        const texts = targets.map(target => target.text.trim());
        expect(texts).toContain('最近アップロードされた動画');
        expect(texts).toContain('設定を開く');
        expect(texts).not.toContain('Open settings');
        expect(texts.some(text => text.startsWith('こここ'))).toBe(false);
        document.body.innerHTML = '';
    });

    it('marks chip text passive and layout sensitive end to end', async () => {
        const { applyTokensToTextNode } = await import('../../src/reader/dom');
        const { DEFAULT_SETTINGS } = await import('../../src/reader/settings');
        document.body.innerHTML = '<div class="filter-row"><button>動画</button></div>';
        const [target] = collectTextTargetsIn(document.body, 5, false);
        expect(target).toBeTruthy();
        applyTokensToTextNode(target!, [{
            card: { vid: 1, sid: 1, rid: 0, spelling: '動画', reading: 'どうが', frequencyRank: null, partOfSpeech: [], meanings: [], cardState: ['new'], pitchAccent: [], wordWithReading: null, source: 'jpdb' },
            start: 0, end: 2, length: 2,
            rubies: [{ text: 'どうが', start: 0, end: 2, length: 2 }],
            pitchClass: '',
            sentence: '動画',
        }], { ...DEFAULT_SETTINGS, furiganaMode: 'all' });
        const word = document.querySelector('.jpdb-reader-word');
        expect(word).toBeTruthy();
        // click-transparent but still fully annotated with ruby
        expect(document.querySelector('rt')?.textContent).toBe('どうが');
        expect((word as HTMLElement).dataset.jpdbReaderPassive).toBe('true');
        document.body.innerHTML = '';
    });
});

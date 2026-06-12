import { describe, expect, it } from 'vitest';

import { collectTextTargetsIn } from '../../src/reader/dom';

// UT-64: jpdb.io's "Kanji used" glyph and pitch diagram are structural
// widgets, not prose — annotating the glyph matched rare alt-form words
// (穏 → しずか) and dropped a reading under the kanji.
describe('jpdb structural widget skip', () => {
    it('skips the kanji-used spelling glyph and the pitch diagram', () => {
        document.body.innerHTML = `
            <div class="subsection-composed-of-kanji">
                <h6 class="subsection-label">Kanji used</h6>
                <div class="subsection"><div>
                    <div class="spelling"><a class="plain" href="/kanji/穏#a">穏</a></div>
                    <div class="description">calm 落ち着き</div>
                </div></div>
            </div>
            <div class="subsection-pitch-accent">
                <h6 class="subsection-label">Pitch accent</h6>
                <div class="subsection"><div>おだやか</div></div>
            </div>
            <p id="prose">穏やかな海。</p>`;
        const targets = collectTextTargetsIn(document.body, 40, false);
        const texts = targets.map(target => target.text.trim()).filter(Boolean);
        expect(texts.join(' ')).toContain('穏やかな海。');
        expect(texts.some(text => text === '穏')).toBe(false);
        expect(texts.some(text => text === 'おだやか')).toBe(false);
        // the keyword/description row remains annotatable prose
        expect(texts.some(text => text.includes('落ち着き'))).toBe(true);
        document.body.innerHTML = '';
    });
});

// UT-76: YouTube filter chips are buttons (normally skipped), but their
// labels annotate as click-transparent passive words.
describe('YouTube chip annotation allowance', () => {
    it('collects chip button labels but keeps ordinary buttons skipped', () => {
        document.body.innerHTML = `
            <yt-chip-cloud-chip-renderer><button>最近アップロードされた動画</button></yt-chip-cloud-chip-renderer>
            <button id="plain">設定を開く</button>`;
        const targets = collectTextTargetsIn(document.body, 20, false);
        const texts = targets.map(target => target.text.trim());
        expect(texts).toContain('最近アップロードされた動画');
        expect(texts).not.toContain('設定を開く');
        document.body.innerHTML = '';
    });

    it('marks chip text passive and layout sensitive end to end', async () => {
        const { applyTokensToTextNode } = await import('../../src/reader/dom');
        const { DEFAULT_SETTINGS } = await import('../../src/reader/settings');
        document.body.innerHTML = '<yt-chip-cloud-chip-renderer><button>動画</button></yt-chip-cloud-chip-renderer>';
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
        // color-only + click-transparent: no ruby, passive marker present
        expect(document.querySelector('rt')).toBeNull();
        expect((word as HTMLElement).dataset.jpdbReaderPassive).toBe('true');
        document.body.innerHTML = '';
    });
});

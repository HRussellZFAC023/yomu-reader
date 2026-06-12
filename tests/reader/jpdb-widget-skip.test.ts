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

import { describe, expect, it } from 'vitest';

import { getMatchingSiteParsers, siteProvidesNativeTextLayer } from '../../src/reader/app/site-parsers';

// Canna feedback regression: on mokuro readers the native .textBox layer is
// accurate (it has 事), so image OCR (Google Lens) must be suppressed — it both
// misses characters and double-paints. siteProvidesNativeTextLayer drives that.
describe('site parser native text layer', () => {
    it('flags mokuro reader hosts as providing a native text layer', () => {
        expect(siteProvidesNativeTextLayer('https://reader.mokuro.app/')).toBe(true);
        expect(siteProvidesNativeTextLayer('https://mokuro.moe/catalog')).toBe(true);
        expect(siteProvidesNativeTextLayer('https://sub.mokuro.moe/x')).toBe(true);
        expect(siteProvidesNativeTextLayer('file:///Users/x/My%20mokuro%20manga/vol1.html')).toBe(true);
    });

    it('does not flag ordinary sites', () => {
        expect(siteProvidesNativeTextLayer('https://www.youtube.com/watch?v=x')).toBe(false);
        expect(siteProvidesNativeTextLayer('https://viewer.bookwalker.jp/x/viewer.html')).toBe(false);
        expect(siteProvidesNativeTextLayer('https://example.com/')).toBe(false);
    });

    it('marks the mokuro parser with providesTextLayer and matches mokuro.moe', () => {
        const profiles = getMatchingSiteParsers('https://reader.mokuro.app/');
        const mokuro = profiles.find(profile => profile.id === 'mokuro-parser');
        expect(mokuro).toBeDefined();
        expect(mokuro?.providesTextLayer).toBe(true);
        expect(getMatchingSiteParsers('https://mokuro.moe/catalog').some(p => p.id === 'mokuro-parser')).toBe(true);
    });
});

import { afterEach, describe, expect, it } from 'vitest';

import { getMatchingSiteParsers, mokuroDisplayOcrEnabled, siteProvidesNativeTextLayer } from '../../src/reader/app/site-parsers';

// Canna feedback regression: on mokuro readers the native .textBox layer is
// accurate (it has 事), so image OCR (Google Lens) must be suppressed — it both
// misses characters and double-paints. siteProvidesNativeTextLayer drives that,
// but only while mokuro's own "OCR enabled" (displayOCR) setting is on — when the
// user turns it off, mokuro hides its text boxes and the reader runs its own
// (sharper, touch-friendly) OCR instead.
afterEach(() => { try { localStorage.clear(); } catch { /* ignore */ } });

describe('site parser native text layer', () => {
    it('flags mokuro reader hosts as providing a native text layer (mokuro OCR on by default)', () => {
        expect(siteProvidesNativeTextLayer('https://reader.mokuro.app/')).toBe(true);
        expect(siteProvidesNativeTextLayer('https://mokuro.moe/catalog')).toBe(true);
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
        expect(mokuro?.providesTextLayer).toBe(true);
        expect(getMatchingSiteParsers('https://mokuro.moe/catalog').some(p => p.id === 'mokuro-parser')).toBe(true);
    });
});

describe('mokuro displayOCR gating', () => {
    function setProfile(displayOCR: boolean): void {
        localStorage.setItem('currentProfile', 'Mobile');
        localStorage.setItem('profiles', JSON.stringify({ Mobile: { displayOCR } }));
    }

    it('reads mokuro displayOCR from localStorage profiles, defaulting to enabled', () => {
        expect(mokuroDisplayOcrEnabled()).toBe(true); // no profiles stored
        setProfile(true);
        expect(mokuroDisplayOcrEnabled()).toBe(true);
        setProfile(false);
        expect(mokuroDisplayOcrEnabled()).toBe(false);
    });

    it('handles a JSON-quoted currentProfile name', () => {
        localStorage.setItem('currentProfile', JSON.stringify('Default'));
        localStorage.setItem('profiles', JSON.stringify({ Default: { displayOCR: false } }));
        expect(mokuroDisplayOcrEnabled()).toBe(false);
    });

    it('stops treating mokuro as a native text layer when mokuro OCR is off (so the reader OCRs instead)', () => {
        setProfile(false);
        expect(siteProvidesNativeTextLayer('https://reader.mokuro.app/')).toBe(false);
        setProfile(true);
        expect(siteProvidesNativeTextLayer('https://reader.mokuro.app/')).toBe(true);
    });
});

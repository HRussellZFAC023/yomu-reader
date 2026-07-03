import { afterEach, describe, expect, it, vi } from 'vitest';

import { isTranslatableJapaneseSentence, translateJapaneseSentence } from '../../src/reader/study/tools-impl';

// Regression: OCR of a code screenshot produced a mostly-ASCII "sentence"
// with one embedded CJK word; the popover sent it to Google Translate and
// presented the round-tripped garbage as TRANSLATION/MEANING.
const REDDIT_GARBLE = '-;;{:radarupdatedcreplystringoptions菜单-or-nil}.Deterministiccontrolflow;';

describe('sentence translation gating', () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    it('rejects mostly-ASCII noise with a stray CJK word', () => {
        expect(isTranslatableJapaneseSentence(REDDIT_GARBLE)).toBe(false);
        expect(isTranslatableJapaneseSentence('state machine grounding')).toBe(false);
        expect(isTranslatableJapaneseSentence('')).toBe(false);
    });

    it('accepts real Japanese sentences, including Latin-mixed ones', () => {
        expect(isTranslatableJapaneseSentence('ソフィー、前へ移れ。')).toBe(true);
        expect(isTranslatableJapaneseSentence('iPhoneを買う')).toBe(true);
        expect(isTranslatableJapaneseSentence('NPO多言語多読は「多読」を提案します。')).toBe(true);
    });

    it('short-circuits to empty without any network request for noise', async () => {
        const fetchSpy = vi.fn(() => Promise.reject(new Error('should not be called')));
        vi.stubGlobal('fetch', fetchSpy);
        vi.stubGlobal('GM_xmlhttpRequest', fetchSpy);
        await expect(translateJapaneseSentence(REDDIT_GARBLE)).resolves.toBe('');
        expect(fetchSpy).not.toHaveBeenCalled();
    });
});

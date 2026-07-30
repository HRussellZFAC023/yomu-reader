import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderStudyToolResult } from '../../src/reader/study/render-impl';
import { isTranslatableJapaneseSentence, translateJapaneseSentence } from '../../src/reader/study/tools-impl';

// Regression: OCR of a code screenshot produced a mostly-ASCII "sentence"
// with one embedded CJK word; the popover sent it to Google Translate and
// presented the round-tripped garbage as TRANSLATION/MEANING.
const REDDIT_GARBLE = '-;;{:radarupdatedcreplystringoptions菜单-or-nil}.Deterministiccontrolflow;';

describe('sentence translation gating', () => {
    afterEach(() => {
        document.body.innerHTML = '';
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

    it('shows a stable unavailable state when the learner language has no provider target', async () => {
        const fetchSpy = vi.fn(() => Promise.reject(new Error('should not be called')));
        vi.stubGlobal('fetch', fetchSpy);
        vi.stubGlobal('GM_xmlhttpRequest', fetchSpy);
        document.body.innerHTML = `
            <section class="jpdb-reader-study-tools">
                <button type="button">Translate</button>
                <div data-study-panel hidden></div>
            </section>`;
        const button = document.querySelector<HTMLButtonElement>('button')!;
        const panel = document.querySelector<HTMLElement>('[data-study-panel]')!;

        await expect(renderStudyToolResult(
            button,
            'study-translate',
            'これは日本語です。',
            undefined,
            'en',
            { outputLanguage: 'grc' },
        )).resolves.toBeUndefined();

        expect(fetchSpy).not.toHaveBeenCalled();
        expect(panel.hidden).toBe(false);
        expect(panel.textContent).toContain('Translation unavailable.');
        expect(panel.textContent).not.toContain('Translating...');
    });
});

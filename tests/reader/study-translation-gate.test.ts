import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderStudyToolResult } from '../../src/reader/study/render-impl';
import {
    isTranslatableJapaneseSentence,
    isTranslatableTargetSentence,
    translateTargetSentence,
} from '../../src/reader/study/tools-impl';
import {
    resetActiveLearningTargetLanguage,
    setActiveLearningTargetLanguage,
} from '../../src/reader/languages/active';
import { resetGoogleTranslationCacheForTests } from '../../src/reader/translation/google';

// Regression: OCR of a code screenshot produced a mostly-ASCII "sentence"
// with one embedded CJK word; the popover sent it to Google Translate and
// presented the round-tripped garbage as TRANSLATION/MEANING.
const REDDIT_GARBLE = '-;;{:radarupdatedcreplystringoptions菜单-or-nil}.Deterministiccontrolflow;';

describe('sentence translation gating', () => {
    beforeEach(() => {
        resetActiveLearningTargetLanguage();
        resetGoogleTranslationCacheForTests();
        vi.stubGlobal('GM_xmlhttpRequest', undefined);
    });

    afterEach(() => {
        resetActiveLearningTargetLanguage();
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

    it.each([
        ['es', 'Leemos libros cada día.', 'es'],
        ['ar', 'نقرأ الكتب كل يوم.', 'ar'],
        ['ko', '우리는 매일 책을 읽어요.', 'ko'],
    ] as const)('routes the active %s target as the translation source', async (target, sentence, providerSource) => {
        expect(setActiveLearningTargetLanguage(target)).not.toBeNull();
        const fetchSpy = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify({
            sentences: [{ trans: 'Translated sentence.' }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        vi.stubGlobal('fetch', fetchSpy);

        await expect(translateTargetSentence(sentence, 'en')).resolves.toEqual({
            text: 'Translated sentence.',
            outputLanguage: 'en',
        });

        const requestedUrl = String(fetchSpy.mock.calls[0]?.[0] ?? '');
        const targetUrl = new URL(requestedUrl).searchParams.get('url') ?? requestedUrl;
        const translateUrl = new URL(targetUrl);
        expect(translateUrl.searchParams.get('sl')).toBe(providerSource);
        expect(translateUrl.searchParams.get('tl')).toBe('en');
        expect(translateUrl.searchParams.get('q')).toBe(sentence);
    });

    it('uses the active target detector for a language-neutral noise gate', () => {
        expect(setActiveLearningTargetLanguage('es')).not.toBeNull();
        expect(isTranslatableTargetSentence('Leemos libros cada día.')).toBe(true);
        expect(isTranslatableTargetSentence('--- 1234 [] {}')).toBe(false);

        expect(setActiveLearningTargetLanguage('ar')).not.toBeNull();
        expect(isTranslatableTargetSentence('نقرأ الكتب كل يوم.')).toBe(true);
        expect(isTranslatableTargetSentence('--- 1234 [] {}')).toBe(false);
    });

    it.each([
        ['does not present the source sentence as its own translation', 'es', 'Leemos libros cada día.', 'es', ''],
        ['keeps an unsupported Ancient Greek source honestly unavailable', 'grc', 'Ἀρχὴ σοφίας φόβος κυρίου.', 'en', /not available for grc/],
    ] as const)('%s', async (_label, target, sentence, outputLanguage, outcome) => {
        expect(setActiveLearningTargetLanguage(target)).not.toBeNull();
        const fetchSpy = vi.fn(() => Promise.reject(new Error('should not be called')));
        vi.stubGlobal('fetch', fetchSpy);

        const translation = translateTargetSentence(sentence, outputLanguage);
        if (typeof outcome === 'string') await expect(translation).resolves.toBeNull();
        else await expect(translation).rejects.toThrow(outcome);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('short-circuits to empty without any network request for noise', async () => {
        const fetchSpy = vi.fn(() => Promise.reject(new Error('should not be called')));
        vi.stubGlobal('fetch', fetchSpy);
        vi.stubGlobal('GM_xmlhttpRequest', fetchSpy);
        await expect(translateTargetSentence(REDDIT_GARBLE)).resolves.toBeNull();
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

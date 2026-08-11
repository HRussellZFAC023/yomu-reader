import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StudySourceController } from '../../src/reader/study/sources';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import { resetGoogleTranslationCacheForTests } from '../../src/reader/translation/google';
import type { ReaderSettings } from '../../src/reader/app/types';
import {
    resetActiveLearningTargetLanguage,
    setActiveLearningTargetLanguage,
} from '../../src/reader/languages/active';

// Regression (iPad Safari, real Reddit page): the study TRANSLATION card was
// stuck forever showing "Translating..." under MEANING. The studied sentence
// was Reddit chrome — "r/mildlyinfuriating 5 時間前" — which is NOT translatable
// (3 Japanese chars in 23), so translation resolves to '' at once. The card
// still hung because loadTranslationContent awaited Promise.all([parseJapanese,
// translate]); an iPad-WebKit IndexedDB stall left parseJapanese pending, which
// stranded the whole card. The MEANING must resolve on the (always-bounded)
// translation alone; parsing only enriches the original line and must never
// gate it.

function settings(overrides: Partial<ReaderSettings> = {}): ReaderSettings {
    return {
        ...DEFAULT_SETTINGS,
        interfaceLanguage: 'en',
        studyTranslationEnabled: true,
        studyGrammarEnabled: false,
        audioEnabled: false,
        ...overrides,
    } as ReaderSettings;
}

// parseJapanese that NEVER settles, mirroring a stalled IndexedDB read.
const hangingParse = () => new Promise<never[][]>(() => undefined);

function makeController(getSettings: () => ReaderSettings = () => settings()) {
    return new StudySourceController({
        getSettings,
        dictionarySourceAttributes: () => '',
        parseJapanese: hangingParse as never,
        parsePopoverJapanese: () => undefined,
        enrichPitchWords: () => undefined,
        enrichAnkiWords: () => undefined,
        isCurrentPopoverRoot: () => true,
    });
}

function settingsForOutput(outputLanguage: string): ReaderSettings {
    const activeProfile = DEFAULT_SETTINGS.languageProfiles[0]!;
    return settings({
        languageProfiles: [{ ...activeProfile, outputLanguage }],
        activeLanguageProfileId: activeProfile.id,
    });
}

function deferredResponse() {
    let resolve!: (response: Response) => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<Response>((accept, decline) => {
        resolve = accept;
        reject = decline;
    });
    return { promise, reject, resolve };
}

function translationResponse(trans: string): Response {
    return new Response(
        JSON.stringify({ sentences: [{ trans }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
}

async function startInFlightTranslation() {
    const oldOutput = deferredResponse();
    const currentOutput = deferredResponse();
    const fetchSpy = vi.fn()
        .mockImplementationOnce(() => oldOutput.promise)
        .mockImplementationOnce(() => currentOutput.promise);
    vi.stubGlobal('fetch', fetchSpy);
    vi.stubGlobal('GM_xmlhttpRequest', undefined);
    const state = { settings: settingsForOutput('en') };
    const controller = makeController(() => state.settings);
    const { details } = mountTranslationCard(controller, 'これは日本語です。');
    const result = details.querySelector<HTMLElement>('[data-study-translation-result]')!;
    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    return {
        oldOutput,
        currentOutput,
        fetchSpy,
        result,
        changeOutputLanguage: (outputLanguage: string) => {
            state.settings = settingsForOutput(outputLanguage);
        },
    };
}

function mountTranslationCard(controller: StudySourceController, sentence: string) {
    document.body.innerHTML = `<div class="popover">${controller.renderTranslationSource(sentence)}</div>`;
    const popover = document.querySelector<HTMLElement>('.popover')!;
    const details = popover.querySelector<HTMLDetailsElement>('[data-study-translation]')!;
    details.open = true;
    controller.installLoaders(popover, sentence);
    return { popover, details };
}

async function flush(): Promise<void> {
    for (let i = 0; i < 6; i++) {
        await new Promise<void>(resolve => setTimeout(resolve, 0));
    }
}

function stubTranslation(trans: string) {
    vi.stubGlobal('GM_xmlhttpRequest', undefined);
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(
        JSON.stringify({ sentences: [{ trans }] }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))));
}

describe('study translation MEANING never sticks on "Translating..."', () => {
    beforeEach(() => {
        resetActiveLearningTargetLanguage();
        resetGoogleTranslationCacheForTests();
    });
    afterEach(() => {
        resetActiveLearningTargetLanguage();
        document.body.innerHTML = '';
        vi.unstubAllGlobals();
    });

    it('hides the untranslatable Reddit-chrome card even while parsing hangs', async () => {
        const fetchSpy = vi.fn(() => Promise.reject(new Error('should not translate chrome noise')));
        vi.stubGlobal('fetch', fetchSpy);
        vi.stubGlobal('GM_xmlhttpRequest', undefined);
        const controller = makeController();

        const { details } = mountTranslationCard(controller, 'r/mildlyinfuriating 5 時間前');
        await flush();

        // The empty-translation card must be gone, not left visibly stuck.
        expect(details.hidden).toBe(true);
        expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('shows the translation right away for a real sentence while parsing hangs', async () => {
        stubTranslation('This is Japanese.');
        const controller = makeController();

        const { details } = mountTranslationCard(controller, 'これは日本語です。');
        await flush();

        const result = details.querySelector<HTMLElement>('[data-study-translation-result]')!;
        expect(details.hidden).toBe(false);
        expect(result.textContent).toBe('This is Japanese.');
        expect(result.textContent).not.toContain('Translating');
    });

    it('marks target and output text independently for an RTL target', async () => {
        expect(setActiveLearningTargetLanguage('ar')).not.toBeNull();
        stubTranslation('We read books every day.');
        const controller = makeController();

        const { details } = mountTranslationCard(controller, 'نقرأ الكتب كل يوم.');
        const original = details.querySelector<HTMLElement>('[data-study-original-render]')!;
        expect(original.lang).toBe('ar');
        expect(original.dir).toBe('rtl');

        await flush();

        const result = details.querySelector<HTMLElement>('[data-study-translation-result]')!;
        expect(details.hidden).toBe(false);
        expect(result.textContent).toBe('We read books every day.');
        expect(result.lang).toBe('en');
        expect(result.dir).toBe('ltr');
    });

    it('discards an in-flight result owned by an older output language', async () => {
        const request = await startInFlightTranslation();
        request.changeOutputLanguage('ar');

        request.oldOutput.resolve(translationResponse('Stale English result.'));
        await vi.waitFor(() => expect(request.fetchSpy).toHaveBeenCalledTimes(2));
        expect(request.result.textContent).not.toContain('Stale English');
        expect(request.result.lang).not.toBe('en');

        request.currentOutput.resolve(translationResponse('نتيجة عربية حالية.'));
        await flush();
        expect(request.result.textContent).toBe('نتيجة عربية حالية.');
        expect(request.result.lang).toBe('ar');
        expect(request.result.dir).toBe('rtl');
    });

    it('does not render an old request error after the output language changes', async () => {
        const request = await startInFlightTranslation();
        request.changeOutputLanguage('ar');

        request.oldOutput.reject(new Error('stale request failed'));
        await vi.waitFor(() => expect(request.fetchSpy).toHaveBeenCalledTimes(2));
        expect(request.result.textContent).not.toContain('unavailable');

        request.currentOutput.resolve(translationResponse('ترجمة حديثة.'));
        await flush();
        expect(request.result.textContent).toBe('ترجمة حديثة.');
        expect(request.result.lang).toBe('ar');
    });

});

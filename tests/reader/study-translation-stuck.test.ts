import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { StudySourceController } from '../../src/reader/study/sources';
import { DEFAULT_SETTINGS } from '../../src/reader/settings/index';
import { resetGoogleTranslationCacheForTests } from '../../src/reader/translation/google';
import type { ReaderSettings } from '../../src/reader/app/types';

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

function makeController() {
    return new StudySourceController({
        getSettings: () => settings(),
        dictionarySourceAttributes: () => '',
        parseJapanese: hangingParse as never,
        parsePopoverJapanese: () => undefined,
        enrichPitchWords: () => undefined,
        enrichAnkiWords: () => undefined,
        isCurrentPopoverRoot: () => true,
    });
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
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify({
        sentences: [{ trans }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))));
}

describe('study translation MEANING never sticks on "Translating..."', () => {
    beforeEach(() => resetGoogleTranslationCacheForTests());
    afterEach(() => {
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
});

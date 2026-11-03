import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReaderSettings } from '../../src/reader/app/types';
import { DEFAULT_SETTINGS, loadSettings, normalizeReaderSettings, saveSettings } from '../../src/reader/settings';
import { activateSettingsPanel, localizeSettingsForm, readFormSettings, renderSettingsForm } from '../../src/reader/settings/form';
import { StudySourceController } from '../../src/reader/study/sources';
import { resetGoogleTranslationCacheForTests } from '../../src/reader/translation/google';
import { installGmStorageFixture } from './helpers/settings-persistence-fixture';
import { installProviderExampleBehaviors, renderProviderExamples } from '../../src/reader/sources/provider-examples';
import { translateJapaneseSentence } from '../../src/reader/study/tools';
import { translationOutputLanguage } from '../../src/reader/translation/languages';

function koreanSettings(): ReaderSettings {
    const profile = DEFAULT_SETTINGS.languageProfiles[0]!;
    return normalizeReaderSettings({
        ...DEFAULT_SETTINGS,
        interfaceLanguage: 'en',
        audioEnabled: false,
        studyGrammarEnabled: false,
        studyTranslationEnabled: true,
        languageProfiles: [
            { ...profile, outputLanguage: 'ko', learnerLanguage: 'ko', uiLocale: 'en' },
            { ...profile, id: 'inactive', outputLanguage: 'fr', learnerLanguage: 'fr' },
        ],
    });
}

function formFor(settings: ReaderSettings): HTMLFormElement {
    document.body.innerHTML = `<form>${renderSettingsForm(settings, 'https://jpdb.io/settings', undefined, { includeCatalogBrowse: false })}</form>`;
    return document.querySelector('form')!;
}

describe('Japanese translation language restoration (Discord 1564939563665854530)', () => {
    beforeEach(() => {
        resetGoogleTranslationCacheForTests();
        installGmStorageFixture();
    });
    afterEach(() => {
        document.body.innerHTML = '';
        resetGoogleTranslationCacheForTests();
        vi.unstubAllGlobals();
    });

    it('exposes the saved translation destination and persists a change without replacing other profiles', async () => {
        const current = koreanSettings();
        const form = formFor(current);
        activateSettingsPanel(form, 'dictionaries');
        const select = form.querySelector<HTMLSelectElement>('[name="translationLanguage"]');
        expect(select, 'Sources must offer a translation language choice').not.toBeNull();
        expect(select!.closest('[hidden]')).toBeNull();
        expect(select!.closest('label')).toHaveProperty('textContent', expect.stringContaining('Translation language'));
        expect(select!.value).toBe('ko');
        expect(Array.from(select!.options).map(option => option.value)).toContain('es');
        expect(Array.from(select!.options).map(option => option.value)).not.toContain('grc');
        select!.value = 'es';
        const changed = readFormSettings(new FormData(form), current);
        expect(changed.languageProfiles[0]?.outputLanguage).toBe('es');
        await saveSettings(changed, { explicitUserChoiceKeys: ['languageProfiles'] });
        const reloaded = await loadSettings();
        expect(reloaded.languageProfiles[0]).toMatchObject({ outputLanguage: 'es', learnerLanguage: 'es', targetLanguage: 'ja' });
        expect(reloaded.languageProfiles[1]).toEqual(current.languageProfiles[1]);
        expect(reloaded.interfaceLanguage).toBe('en');
        const reopened = formFor(reloaded);
        expect(reopened.querySelector<HTMLSelectElement>('[name="translationLanguage"]')?.value).toBe('es');
        localizeSettingsForm(reopened, 'ja');
        expect(reopened.querySelector('[name="translationLanguage"]')?.closest('label')?.textContent).toContain('翻訳先の言語');
        expect(reopened.textContent).not.toContain('未翻訳');
    });

    it('uses the persisted Korean destination in the actual popup translation request and result', async () => {
        await saveSettings(koreanSettings(), { explicitUserChoiceKeys: ['languageProfiles'] });
        const current = await loadSettings();
        expect(current.languageProfiles[0]?.outputLanguage).toBe('ko');
        const requested: URL[] = [];
        // Deterministic provider-response fixture; never calls a live translation service.
        vi.stubGlobal('GM_xmlhttpRequest', undefined);
        vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
            const url = new URL(String(input));
            requested.push(url);
            return new Response(JSON.stringify({ sentences: [{ trans: url.searchParams.get('tl') === 'ko' ? '이것은 일본어입니다.' : 'This is Japanese.' }] }), {
                status: 200, headers: { 'Content-Type': 'application/json' },
            });
        }));
        const controller = new StudySourceController({
            getSettings: () => current,
            dictionarySourceAttributes: () => 'open',
            parseJapanese: async () => [[]],
            parsePopoverJapanese: () => undefined,
            enrichPitchWords: () => undefined,
            enrichAnkiWords: () => undefined,
            isCurrentPopoverRoot: () => true,
        });
        const root = document.createElement('div');
        root.innerHTML = controller.renderTranslationSource('これは日本語です。');
        document.body.append(root);
        controller.installLoaders(root, 'これは日本語です。');
        await vi.waitFor(() => expect(requested.length).toBeGreaterThan(0));
        expect(requested[0]?.searchParams.get('sl')).toBe('ja');
        expect(requested[0]?.searchParams.get('tl')).toBe('ko');
        await vi.waitFor(() => expect(root.querySelector('[data-study-translation-result]')?.textContent).toBe('이것은 일본어입니다.'));
        expect(root.querySelector<HTMLElement>('[data-study-translation-result]')?.lang).toBe('ko');
    });

    it.each([
        { saved: 'ko-KR', output: 'ko-KR', label: 'ko-KR' },
        { saved: 'grc', output: 'en', label: 'grc · Unavailable' },
    ])('keeps the saved $saved profile on an untouched Save', ({ saved, output, label }) => {
        const base = koreanSettings();
        const current = normalizeReaderSettings({
            ...base,
            languageProfiles: base.languageProfiles.map(profile => profile.id === base.activeLanguageProfileId
                ? { ...profile, outputLanguage: saved, learnerLanguage: saved }
                : profile),
        });
        const form = formFor(current);
        expect(form.querySelector<HTMLSelectElement>('[name="translationLanguage"]')?.value).toBe(saved);
        const changed = readFormSettings(new FormData(form), current);
        expect(changed.languageProfiles[0]?.outputLanguage).toBe(saved);
        expect(changed.languageProfiles[1]).toEqual(current.languageProfiles[1]);
        expect(translationOutputLanguage(changed)).toBe(output);
        expect(form.querySelector(`option[value="${saved}"]`)).toHaveProperty('textContent', label);
    });

    it('translates provider examples into the chosen destination even when the provider supplies English', async () => {
        const fetchSpy = vi.fn(async (_input: RequestInfo | URL) => new Response(JSON.stringify({ sentences: [{ trans: '매일 복습합니다.' }] }), {
            status: 200, headers: { 'Content-Type': 'application/json' },
        }));
        vi.stubGlobal('GM_xmlhttpRequest', undefined);
        vi.stubGlobal('fetch', fetchSpy);
        document.body.innerHTML = renderProviderExamples('jiten', 'jiten', {
            availability: 'loaded', items: [{ id: 'fixture', sentence: '毎日復習する。', sentenceHtml: '毎日復習する。', translation: 'I review every day.' }],
        }, () => 'open', 'en');
        const root = document.querySelector<HTMLElement>('details')!;
        installProviderExampleBehaviors(root, {
            interfaceLanguage: 'en', outputLanguage: translationOutputLanguage(koreanSettings()), blurTranslations: false,
            translate: translateJapaneseSentence,
        });
        await vi.waitFor(() => expect(root.querySelector('[data-provider-example-translation]')?.textContent).toBe('매일 복습합니다.'));
        const url = new URL(String(fetchSpy.mock.calls[0]?.[0]));
        expect(url.searchParams.get('sl')).toBe('ja');
        expect(url.searchParams.get('tl')).toBe('ko');
        expect(root.querySelector<HTMLElement>('[data-provider-example-translation]')?.lang).toBe('ko');
    });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { OnboardingController } from '../../src/reader/app/onboarding';
import type { ReaderSettings } from '../../src/reader/app/types';
import { activeLanguageProfile } from '../../src/reader/languages';
import { LEARNER_LANGUAGE_IDS } from '../../src/reader/locales';
import { DEFAULT_SETTINGS, normalizeReaderSettings } from '../../src/reader/settings';
import {
    localizeSettingsForm,
    readFormSettings,
    renderSettingsForm,
} from '../../src/reader/settings/form';

function createOnboardingHarness(settings: ReaderSettings): {
    controller: OnboardingController;
    state: { current: ReaderSettings };
} {
    const state = { current: settings };
    return {
        state,
        controller: new OnboardingController({
            getSettings: () => state.current,
            setSettings: next => { state.current = next; },
            showSettings: vi.fn(),
            parseJapanese: vi.fn(),
        }),
    };
}

describe('Slice 1 multilingual onboarding and settings', () => {
    afterEach(() => {
        document.body.innerHTML = '';
        localStorage.clear();
        vi.restoreAllMocks();
    });

    it('lets a new learner choose a named target with an honest readiness label', async () => {
        const harness = createOnboardingHarness(normalizeReaderSettings({
            ...DEFAULT_SETTINGS,
            onboardingSeen: false,
            interfaceLanguage: 'en',
        }));

        await harness.controller.showIfNeeded();

        const learnerLanguage = document.querySelector<HTMLSelectElement>('select[name="learnerLanguage"]')!;
        expect(Array.from(learnerLanguage.options, option => option.value)).toEqual(LEARNER_LANGUAGE_IDS);
        const targetLanguage = document.querySelector<HTMLSelectElement>('select[name="targetLanguage"]')!;
        expect(targetLanguage.options).toHaveLength(33);
        expect(targetLanguage.querySelector<HTMLOptionElement>('option[value="ja"]')).toMatchObject({
            disabled: false,
            textContent: expect.stringContaining('Full Yomu support'),
        });
        expect(targetLanguage.querySelector<HTMLOptionElement>('option[value="es"]')).toMatchObject({
            disabled: false,
            textContent: expect.stringContaining('Español'),
            title: 'Reading, lookup, mining and review are ready.',
        });
        expect(targetLanguage.querySelector<HTMLOptionElement>('option[value="es"]')?.dataset.studyTargetReadiness)
            .toBe('reading-only');
        expect(document.querySelector<HTMLInputElement>('input[name="onboardingInstallOfflineDictionaries"]')?.checked).toBe(true);
        expect(document.querySelector<HTMLInputElement>('input[name="preferJapaneseSiteLanguage"]')).not.toBeNull();

        learnerLanguage.value = 'ko';
        targetLanguage.value = 'es';
        targetLanguage.dispatchEvent(new Event('change', { bubbles: true }));
        expect(document.querySelector<HTMLInputElement>('input[name="preferJapaneseSiteLanguage"]')).toBeNull();
        expect(document.querySelector<HTMLInputElement>('input[name="youtubeImmersionEnabled"]')?.checked)
            .toBe(false);
        document.querySelector<HTMLButtonElement>('[data-onboarding-action="without-api"]')?.click();
        await new Promise(resolve => setTimeout(resolve, 0));

        const settings = harness.state.current;
        const profile = activeLanguageProfile(settings.languageProfiles, settings.activeLanguageProfileId);
        expect(profile).toMatchObject({
            learnerLanguage: 'ko',
            targetLanguage: 'es',
            uiLocale: 'en',
        });
        expect(settings.interfaceLanguage).toBe('en');
        expect(settings.youtubeImmersionEnabled).toBe(true);
        expect(settings.youtubeImmersionEnabledChosen).toBe(false);
    });

    it('uses the pending target for live onboarding copy before that target is saved', async () => {
        const harness = createOnboardingHarness(normalizeReaderSettings({
            ...DEFAULT_SETTINGS,
            onboardingSeen: false,
            interfaceLanguage: 'en',
        }));
        await harness.controller.showIfNeeded();

        const target = document.querySelector<HTMLSelectElement>('select[name="targetLanguage"]')!;
        target.value = 'es';
        target.dispatchEvent(new Event('change', { bubbles: true }));
        expect(document.querySelector('.jpdb-reader-onboarding-eyebrow')!.textContent)
            .toBe('Spanish, wherever it appears');
        expect(document.querySelector('.jpdb-reader-onboarding p')!.textContent)
            .toBe('Make Spanish text, subtitles, and images tappable.');
        expect(document.querySelector('.jpdb-reader-onboarding-features li span')!.textContent)
            .toBe('Hover or tap scanned Spanish.');

        const interfaceLanguage = document.querySelector<HTMLSelectElement>('select[name="interfaceLanguage"]')!;
        interfaceLanguage.value = 'ja';
        interfaceLanguage.dispatchEvent(new Event('change', { bubbles: true }));
        expect(document.querySelector('.jpdb-reader-onboarding-eyebrow')!.textContent)
            .toBe('スペイン語がある場所ならどこでも');
        expect(document.querySelector('[data-onboarding-mode-label="pageScanMode.manual"]')!.textContent)
            .toContain('スペイン語');
    });

    it('resolves automatic interface copy through the browser locale', async () => {
        vi.spyOn(navigator, 'languages', 'get').mockReturnValue(['ja-JP']);
        vi.spyOn(navigator, 'language', 'get').mockReturnValue('ja-JP');
        const harness = createOnboardingHarness(normalizeReaderSettings({
            ...DEFAULT_SETTINGS,
            onboardingSeen: false,
            interfaceLanguage: 'auto',
        }));

        await harness.controller.showIfNeeded();

        expect(document.querySelector('[data-onboarding-multilingual-copy="learnerLanguage"]')?.textContent)
            .toBe('定義・翻訳の言語（出力）');
        expect(document.querySelector('[data-onboarding-multilingual-copy="targetLanguage"]')?.textContent)
            .toBe('ページで読む言語（対象）');
    });

    it('uses the same readiness-labelled target options in Settings', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(multilingualSettings('en'), 'https://jpdb.io/settings');

        const targetLanguage = form.querySelector<HTMLSelectElement>('select[name="targetLanguage"]')!;
        expect(targetLanguage.options).toHaveLength(33);
        expect(targetLanguage.querySelector<HTMLOptionElement>('option[value="ja"]')?.dataset.studyTargetReadiness)
            .toBe('full');
        const spanish = targetLanguage.querySelector<HTMLOptionElement>('option[value="es"]')!;
        expect(spanish.dataset.studyTargetReadiness).toBe('reading-only');
        expect(spanish.textContent).toContain('Read, mine and review');
        expect(spanish.title).toBe('Reading, lookup, mining and review are ready.');
    });

    it('creates an independent profile when the learner language changes', () => {
        const current = multilingualSettings('fr');
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(current, 'https://jpdb.io/settings');
        localizeSettingsForm(form, 'en');

        const learnerLanguage = form.querySelector<HTMLSelectElement>('select[name="learnerLanguage"]')!;
        expect(learnerLanguage.options).toHaveLength(32);
        learnerLanguage.value = 'zh';
        learnerLanguage.dispatchEvent(new Event('change', { bubbles: true }));
        form.querySelector<HTMLSelectElement>('select[name="interfaceLanguage"]')!.value = 'ja';

        for (const id of ['__jiten__', 'JMdict (en)']) {
            const input = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="definitionTranslationProviderIds"]'))
                .find(item => item.value === id);
            expect(input?.disabled).toBe(false);
            if (input) input.checked = true;
        }

        const saved = readFormSettings(new FormData(form), current);
        const active = activeLanguageProfile(saved.languageProfiles, saved.activeLanguageProfileId);
        expect(active).toMatchObject({
            id: 'learner-zh-ja',
            learnerLanguage: 'zh-Hans',
            targetLanguage: 'ja',
            uiLocale: 'ja',
            definitionTranslationProviderIds: ['__jiten__', 'JMdict (en)'],
        });
        expect(saved.languageProfiles.find(profile => profile.id === 'primary')?.learnerLanguage).toBe('fr');
        expect(saved.languageProfiles.find(profile => profile.id === 'secondary')?.learnerLanguage).toBe('de');
        expect(saved.interfaceLanguage).toBe('ja');
    });

    it('restores each language profile parser and dictionary choices when switching back', () => {
        const baseProfile = DEFAULT_SETTINGS.languageProfiles[0]!;
        const current = normalizeReaderSettings({
            ...DEFAULT_SETTINGS,
            dictionaryPreferences: [
                { name: 'Korean terms', alias: '', enabled: true, priority: 0, type: 'terms' },
                { name: 'French terms', alias: '', enabled: false, priority: 1, type: 'terms' },
            ],
            languageProfiles: [
                {
                    ...baseProfile,
                    id: 'korean-ja',
                    outputLanguage: 'ko',
                    parserProvider: 'local',
                    dictionaries: {
                        installed: ['Korean terms', 'French terms'],
                        enabled: ['Korean terms'],
                        order: ['Korean terms', 'French terms'],
                    },
                },
                {
                    ...baseProfile,
                    id: 'french-ja',
                    outputLanguage: 'fr',
                    parserProvider: 'jpdb',
                    dictionaries: {
                        installed: ['Korean terms', 'French terms'],
                        enabled: ['French terms'],
                        order: ['French terms', 'Korean terms'],
                    },
                },
            ],
            activeLanguageProfileId: 'korean-ja',
        });

        const frenchForm = document.createElement('form');
        frenchForm.innerHTML = renderSettingsForm(current, 'https://jpdb.io/settings');
        frenchForm.querySelector<HTMLSelectElement>('select[name="learnerLanguage"]')!.value = 'fr';
        const french = readFormSettings(new FormData(frenchForm), current);
        expect(french.activeLanguageProfileId).toBe('french-ja');
        expect(french.parserProvider).toBe('jpdb');
        expect(french.dictionaryPreferences.map(item => [item.name, item.enabled])).toEqual([
            ['French terms', true],
            ['Korean terms', false],
        ]);

        const koreanForm = document.createElement('form');
        koreanForm.innerHTML = renderSettingsForm(french, 'https://jpdb.io/settings');
        koreanForm.querySelector<HTMLSelectElement>('select[name="learnerLanguage"]')!.value = 'ko';
        const korean = readFormSettings(new FormData(koreanForm), french);
        expect(korean.activeLanguageProfileId).toBe('korean-ja');
        expect(korean.parserProvider).toBe('local');
        expect(korean.dictionaryPreferences.map(item => [item.name, item.enabled])).toEqual([
            ['Korean terms', true],
            ['French terms', false],
        ]);
    });

    it('keeps translation default-off and omits sources already native to the learner', () => {
        const current = multilingualSettings('fr');
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(current, 'https://jpdb.io/settings');
        localizeSettingsForm(form, 'en');

        const inputs = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="definitionTranslationProviderIds"]'));
        expect(inputs.every(input => !input.checked)).toBe(true);
        const french = inputs.find(input => input.value === 'JMdict (fr)')!;
        const english = inputs.find(input => input.value === 'JMdict (en)')!;
        expect(french.disabled).toBe(true);
        expect(french.closest('label')?.hidden).toBe(true);
        expect(english.disabled).toBe(false);
        expect(english.closest('label')?.textContent).toContain('Translate automatically into Français');
    });

    it('uses automatic source detection consistently for an unknown local dictionary', () => {
        const current = normalizeReaderSettings({
            ...multilingualSettings('en'),
            dictionaryPreferences: [
                { name: 'My private vocabulary notes', alias: '', enabled: true, priority: 0, type: 'terms' },
            ],
        });
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(current, 'https://jpdb.io/settings');

        const input = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="definitionTranslationProviderIds"]'))
            .find(item => item.value === 'My private vocabulary notes')!;
        expect(input.closest<HTMLElement>('[data-definition-translation-row]')?.dataset.definitionLanguages)
            .toBe('auto');
        expect(input.disabled).toBe(false);
    });

    it('keeps Ancient Greek dictionaries available without offering an unsupported Google target', () => {
        const current = multilingualSettings('grc');
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(current, 'https://jpdb.io/settings');
        localizeSettingsForm(form, 'en');

        const inputs = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="definitionTranslationProviderIds"]'));
        expect(inputs.length).toBeGreaterThan(0);
        expect(inputs.every(input => input.disabled && input.closest('label')?.hidden)).toBe(true);
        expect(form.querySelector<HTMLElement>('[data-definition-translation-unavailable]')?.hidden).toBe(false);
        expect(form.querySelector<HTMLElement>('[data-definition-translation-unavailable]')?.textContent)
            .toContain('does not support automatic translation into Ancient Greek');

        const saved = readFormSettings(new FormData(form), current);
        expect(activeLanguageProfile(saved.languageProfiles, saved.activeLanguageProfileId))
            .toMatchObject({ learnerLanguage: 'grc', definitionTranslationProviderIds: [] });
    });

    it('preserves supported script and region variants when the roster selection is unchanged', () => {
        for (const learnerLanguage of ['zh-Hant-TW', 'ko-KR', 'pt-BR']) {
            const current = multilingualSettings(learnerLanguage);
            const form = document.createElement('form');
            form.innerHTML = renderSettingsForm(current, 'https://jpdb.io/settings');

            const saved = readFormSettings(new FormData(form), current);
            expect(
                activeLanguageProfile(saved.languageProfiles, saved.activeLanguageProfileId)?.learnerLanguage,
            ).toBe(learnerLanguage);
        }
    });
});

function multilingualSettings(learnerLanguage: string): ReaderSettings {
    const baseProfile = DEFAULT_SETTINGS.languageProfiles[0]!;
    return normalizeReaderSettings({
        ...DEFAULT_SETTINGS,
        interfaceLanguage: 'en',
        dictionaryPreferences: [
            { name: 'JMdict (fr)', alias: '', enabled: true, priority: 0, type: 'terms' },
            { name: 'JMdict (en)', alias: '', enabled: true, priority: 1, type: 'terms' },
        ],
        languageProfiles: [
            { ...baseProfile, id: 'primary', outputLanguage: learnerLanguage },
            { ...baseProfile, id: 'secondary', outputLanguage: 'de' },
        ],
        activeLanguageProfileId: 'primary',
    });
}

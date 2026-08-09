import { describe, expect, it, vi } from 'vitest';

import type { ReaderSettings } from '../../../src/reader/app/types';
import {
    interfaceLanguageOf,
    outputLanguageOf,
    resolveLanguageSelection,
    targetLanguageOf,
} from '../../../src/reader/languages/selection';
import { LEARNING_TARGET_ROSTER } from '../../../src/reader/languages/roster';
import { registeredLearningTargetModules } from '../../../src/reader/languages/registry';
import { languageFamilyIncludes } from '../../../src/reader/settings/language-gating';
import { DEFAULT_SETTINGS, normalizeReaderSettings } from '../../../src/reader/settings';
import {
    installProviderExampleBehaviors,
    renderProviderExamples,
} from '../../../src/reader/sources/provider-examples';

/**
 * U105: TARGET (what is being read) is not OUTPUT (what definitions render in)
 * is not INTERFACE (what Yomu's own chrome says). These are three separately
 * addressable axes, and the canonical case is a Korean speaker studying
 * Japanese who wants Korean definitions and an English UI — not Yomu
 * translated into Korean.
 */
describe('the three language tiers', () => {
    it('resolves all three axes to different languages at once', () => {
        const settings = koreanOutputEnglishUiJapaneseTarget();

        expect(resolveLanguageSelection(settings)).toEqual({
            targetLanguage: 'ja',
            outputLanguage: 'ko-KR',
            interfaceLanguage: 'en',
        });
        expect(targetLanguageOf(settings)).toBe('ja');
        expect(outputLanguageOf(settings)).toBe('ko-KR');
        expect(interfaceLanguageOf(settings)).toBe('en');
    });

    it('changes one axis without moving the other two', () => {
        const base = koreanOutputEnglishUiJapaneseTarget();

        const spanishTarget = withActiveProfile(base, { targetLanguage: 'es' });
        expect(resolveLanguageSelection(spanishTarget)).toMatchObject({
            targetLanguage: 'es',
            outputLanguage: 'ko-KR',
            interfaceLanguage: 'en',
        });

        const japaneseUi = withActiveProfile(base, { uiLocale: 'ja' });
        expect(resolveLanguageSelection(japaneseUi)).toMatchObject({
            targetLanguage: 'ja',
            outputLanguage: 'ko-KR',
            interfaceLanguage: 'ja',
        });

        const greekOutput = withActiveProfile(base, { outputLanguage: 'el', learnerLanguage: 'el' });
        expect(resolveLanguageSelection(greekOutput)).toMatchObject({
            targetLanguage: 'ja',
            outputLanguage: 'el',
            interfaceLanguage: 'en',
        });
    });

    it('translates example sentences into OUTPUT while the chrome stays INTERFACE', async () => {
        document.body.innerHTML = renderProviderExamples(
            'jiten',
            'jiten',
            {
                availability: 'loaded',
                items: [{ id: 'e1', sentence: '毎日復習する。', sentenceHtml: '毎日復習する。', translation: '' }],
            },
            key => `data-source-state-key="${key}"`,
            'en',
        );
        const root = document.body.querySelector<HTMLElement>('details')!;
        const translation = root.querySelector<HTMLElement>('[data-provider-example-translation]')!;
        // The label is the INTERFACE axis. Before U105 the same value was also
        // the machine-translation destination, so this English label forced
        // English example translations.
        expect(translation.getAttribute('aria-label')).toBe('Reveal translation');
        const translate = vi.fn(async () => '매일 복습한다.');

        installProviderExampleBehaviors(root, {
            interfaceLanguage: 'en',
            outputLanguage: outputLanguageOf(koreanOutputEnglishUiJapaneseTarget()),
            blurTranslations: false,
            translate,
        });

        await vi.waitFor(() => expect(translation.hidden).toBe(false));
        expect(translate).toHaveBeenCalledWith('毎日復習する。', 'ko-KR');
        expect(translation.lang).toBe('ko-KR');
        expect(root.querySelector('.jpdb-reader-example-source')?.textContent).toBe('Example sentences');
        document.body.innerHTML = '';
    });

    it('keeps an English UI from leaking into the output axis and vice versa', () => {
        const englishUi = koreanOutputEnglishUiJapaneseTarget();
        const japaneseUi = withActiveProfile(englishUi, { uiLocale: 'ja' });

        expect(outputLanguageOf(englishUi)).toBe(outputLanguageOf(japaneseUi));
        expect(interfaceLanguageOf(englishUi)).not.toBe(interfaceLanguageOf(japaneseUi));
    });
});

describe('language profile migration onto the three tiers', () => {
    it('reads a revision-1 profile as OUTPUT and rewrites it at revision 2', () => {
        const settings = normalizeReaderSettings({
            activeLanguageProfileId: 'legacy',
            languageProfiles: [{
                schemaVersion: 1,
                id: 'legacy',
                learnerLanguage: 'ko_KR',
                targetLanguage: 'ja',
                uiLocale: 'en',
                parserProvider: 'local',
                dictionaries: { installed: [], enabled: [], order: [] },
                definitionTranslationProviderIds: [],
            }],
        } as unknown as Partial<ReaderSettings>);

        expect(settings.languageProfiles[0]).toMatchObject({
            schemaVersion: 2,
            id: 'legacy',
            outputLanguage: 'ko-KR',
            targetLanguage: 'ja',
            uiLocale: 'en',
        });
        expect(outputLanguageOf(settings)).toBe('ko-KR');
    });

    it('keeps writing the revision-1 name so a downgrade does not lose the choice', () => {
        const settings = normalizeReaderSettings({
            activeLanguageProfileId: 'legacy',
            languageProfiles: [{
                schemaVersion: 1,
                id: 'legacy',
                learnerLanguage: 'el',
                targetLanguage: 'ja',
                uiLocale: 'auto',
                parserProvider: 'local',
                dictionaries: { installed: [], enabled: [], order: [] },
                definitionTranslationProviderIds: [],
            }],
        } as unknown as Partial<ReaderSettings>);

        expect(settings.languageProfiles[0]?.learnerLanguage)
            .toBe(settings.languageProfiles[0]?.outputLanguage);
        expect(settings.languageProfiles[0]?.learnerLanguage).toBe('el');
    });

    it('lets a revision-1 downgrade win when the two field names disagree', () => {
        // A build that only knows revision 1 rewrites `learnerLanguage` and
        // re-stamps the version, leaving a stale `outputLanguage` beside it.
        // The stamped revision decides, so the older build's choice survives
        // rather than being silently reverted on the way back up.
        const settings = normalizeReaderSettings({
            activeLanguageProfileId: 'downgraded',
            languageProfiles: [{
                schemaVersion: 1,
                id: 'downgraded',
                outputLanguage: 'ko-KR',
                learnerLanguage: 'de',
                targetLanguage: 'ja',
                uiLocale: 'en',
                parserProvider: 'local',
                dictionaries: { installed: [], enabled: [], order: [] },
                definitionTranslationProviderIds: [],
            }],
        } as unknown as Partial<ReaderSettings>);

        expect(outputLanguageOf(settings)).toBe('de');
    });

    it('migrates root-only legacy settings that never had a profile', () => {
        const settings = normalizeReaderSettings({
            interfaceLanguage: 'ja',
            parserProvider: 'jpdb',
        } as Partial<ReaderSettings>);

        // A Japanese UI is not a claim about the definition language, so OUTPUT
        // stays English until onboarding asks.
        expect(resolveLanguageSelection(settings)).toEqual({
            targetLanguage: 'ja',
            outputLanguage: 'en',
            interfaceLanguage: 'ja',
        });
    });

    it('leaves an untouched Japanese install byte-identical', () => {
        const settings = normalizeReaderSettings(DEFAULT_SETTINGS);

        expect(settings.languageProfiles).toEqual(DEFAULT_SETTINGS.languageProfiles);
        expect(resolveLanguageSelection(settings)).toEqual({
            targetLanguage: 'ja',
            outputLanguage: 'en',
            interfaceLanguage: 'en',
        });
        expect(settings.interfaceLanguage).toBe(DEFAULT_SETTINGS.interfaceLanguage);
    });

    it('degrades a target no module implements without touching the other axes', () => {
        const settings = normalizeReaderSettings({
            activeLanguageProfileId: 'retired',
            languageProfiles: [{
                schemaVersion: 2,
                id: 'retired',
                outputLanguage: 'ko-KR',
                learnerLanguage: 'ko-KR',
                targetLanguage: 'xx-retired',
                uiLocale: 'ja',
                parserProvider: 'local',
                dictionaries: { installed: [], enabled: [], order: [] },
                definitionTranslationProviderIds: [],
            }],
        } as unknown as Partial<ReaderSettings>);

        expect(resolveLanguageSelection(settings)).toMatchObject({
            targetLanguage: 'ja',
            outputLanguage: 'ko-KR',
            interfaceLanguage: 'ja',
        });
    });
});

/**
 * Reading annotations are a core-delivered capability: every target can render
 * an exact dictionary reading when its installed bank supplies one. The legacy
 * language-family classes have the narrower job of gating script-specific UI;
 * they are not capability flags and must not hide the generic controls.
 */
describe('reading-annotation availability stays separate from script-family DOM gating', () => {
    it('declares generic dictionary-reading annotations for every registered target', () => {
        const modules = registeredLearningTargetModules();
        expect(modules.length).toBeGreaterThan(1);

        for (const module of modules) {
            expect(module.capabilities['reading-annotation'], module.language).toBe(true);
            expect(module.experiences.readingAnnotation, module.language).toBe('dictionary-reading');
        }
    });

    it('keeps a non-CJK target out of script-specific families without hiding its generic readings', () => {
        const albanian = registeredLearningTargetModules().find(module => module.language === 'sq');
        expect(albanian).toBeDefined();
        expect(albanian?.capabilities['reading-annotation']).toBe(true);
        expect(languageFamilyIncludes('jp-only', albanian!.language)).toBe(false);
        expect(languageFamilyIncludes('jpzhyue-only', albanian!.language)).toBe(false);
        expect(languageFamilyIncludes('jpzhyueko-only', albanian!.language)).toBe(false);
        expect(languageFamilyIncludes('not-jpzhyueko', albanian!.language)).toBe(true);
    });

    it('keeps Japanese, Han-reading, and Korean script families distinct', () => {
        expect(languageFamilyIncludes('jp-only', 'ja')).toBe(true);

        for (const language of ['zh-Hans', 'yue-Hant']) {
            expect(languageFamilyIncludes('jp-only', language), language).toBe(false);
            expect(languageFamilyIncludes('jpzhyue-only', language), language).toBe(true);
            expect(languageFamilyIncludes('jpzhyueko-only', language), language).toBe(true);
        }

        expect(languageFamilyIncludes('jpzhyue-only', 'ko')).toBe(false);
        expect(languageFamilyIncludes('jpzhyueko-only', 'ko')).toBe(true);
    });

    it('declares a pronunciation surface for every registered target', () => {
        for (const module of registeredLearningTargetModules()) {
            expect(module.capabilities.pronunciation, module.language).toBe(true);
            expect(module.featureSemantics.pronunciation, module.language).not.toBe('none');
        }
    });

    it('registers a module for every language the target picker offers', () => {
        const registered = new Set(registeredLearningTargetModules().map(module => module.language));
        const unaccounted = LEARNING_TARGET_ROSTER
            .map(entry => entry.runtimeLocale)
            .filter(locale => !registered.has(locale));

        expect(unaccounted).toEqual([]);
    });
});

function koreanOutputEnglishUiJapaneseTarget(): ReaderSettings {
    return normalizeReaderSettings({
        ...DEFAULT_SETTINGS,
        interfaceLanguage: 'en',
        activeLanguageProfileId: 'ko-output',
        languageProfiles: [{
            schemaVersion: 2,
            id: 'ko-output',
            outputLanguage: 'ko-KR',
            learnerLanguage: 'ko-KR',
            targetLanguage: 'ja',
            uiLocale: 'en',
            parserProvider: 'local',
            dictionaries: { installed: [], enabled: [], order: [] },
            definitionTranslationProviderIds: [],
        }],
    } as unknown as Partial<ReaderSettings>);
}

function withActiveProfile(
    settings: ReaderSettings,
    patch: Partial<ReaderSettings['languageProfiles'][number]>,
): ReaderSettings {
    return normalizeReaderSettings({
        ...settings,
        languageProfiles: settings.languageProfiles.map(profile =>
            profile.id === settings.activeLanguageProfileId ? { ...profile, ...patch } : profile),
    });
}

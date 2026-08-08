import { describe, expect, it } from 'vitest';

import { LEARNER_LANGUAGE_IDS } from '../../../src/reader/locales/types';
import { studyTargetOptions } from '../../../src/reader/app/study-target-picker';
import { activeContentLanguageAxes, targetLanguageDisplayName } from '../../../src/reader/app/target-language-name';
import { LEARNING_TARGET_ROSTER } from '../../../src/reader/languages';
import { activeTargetLanguageId, readFormSettings } from '../../../src/reader/settings/form';
import { syncLanguageFamilyDom } from '../../../src/reader/settings/language-gating';
import { changedSettingsKeys, coupledSettingsIntentKeys } from '../../../src/reader/settings/index';
import { syncYoutubeImmersionTarget } from '../../../src/reader/settings/youtube-panel';
import { resetActiveLearningTargetLanguage, setActiveLearningTargetLanguage } from '../../../src/reader/languages/active';
import { DEFAULT_SETTINGS, renderSettingsTestForm } from './fixtures';

describe('target-language settings', () => {
    it('renders Japanese plus every language in the frozen 32-language roster', () => {
        const form = renderSettingsTestForm(DEFAULT_SETTINGS);
        const picker = form.elements.namedItem('targetLanguage') as HTMLSelectElement;

        expect(Array.from(picker.options, option => option.value)).toEqual([
            'ja',
            ...LEARNER_LANGUAGE_IDS,
        ]);
        expect(picker.value).toBe('ja');
        expect(picker.selectedOptions[0]?.textContent).toContain('日本語');
        expect(picker.querySelector<HTMLOptionElement>('option[value="ja"]')?.dataset.studyTargetReadiness)
            .toBe('full');
        const spanish = picker.querySelector<HTMLOptionElement>('option[value="es"]')!;
        expect(spanish.dataset.studyTargetReadiness).toBe('reading-only');
        expect(spanish.textContent).toContain('Español');
        expect(spanish.textContent).toContain('Read, mine and review');
        expect(spanish.title).toContain('Reading, lookup, mining and review');
    });

    it('keeps a planned target visible, named, and unavailable with a reason', () => {
        const plannedTarget = {
            ...LEARNING_TARGET_ROSTER.find(target => target.id === 'es')!,
            studyTargetReadiness: 'planned' as const,
        };

        expect(studyTargetOptions('en', [plannedTarget])).toEqual([
            expect.objectContaining({
                id: 'es',
                label: expect.stringContaining('Español'),
                readiness: 'planned',
                reason: 'Support is planned.',
                disabled: true,
            }),
        ]);
    });

    it('persists the selected target through the active language profile', () => {
        const form = renderSettingsTestForm(DEFAULT_SETTINGS);
        const picker = form.elements.namedItem('targetLanguage') as HTMLSelectElement;
        picker.value = 'es';

        const saved = readFormSettings(new FormData(form), DEFAULT_SETTINGS);

        expect(activeTargetLanguageId(saved)).toBe('es');
        expect(saved.languageProfiles.find(profile => profile.id === saved.activeLanguageProfileId)?.targetLanguage)
            .toBe('es');
    });

    // b20: the product's MASTER SWITCH read "Japanese text on webpages" with "Scan
    // Japanese automatically" whatever the learner had chosen, while the probe behind
    // it asks the ACTIVE target whether text is its language. So the first settings
    // screen a Russian learner opened told them this product reads Japanese, which
    // reads as "my language is not supported" -- the exact churn the 32-language
    // roster exists to prevent. These labels are target-generic, not Japanese-scoped,
    // so they name the target.
    it('names the language the learner is studying on the master switch', () => {
        const japanese = renderSettingsTestForm(DEFAULT_SETTINGS);
        expect(labelText(japanese, 'pageScanMode')).toContain('Japanese');

        setActiveLearningTargetLanguage('ru');
        try {
            const russian = renderSettingsTestForm(DEFAULT_SETTINGS);
            const legend = labelText(russian, 'pageScanMode');
            expect(legend).toContain('Russian');
            expect(legend).not.toContain('Japanese');
            // And no un-substituted token leaks here. A blanket brace scan over the whole
            // dialog would be wrong: `audioHelp` deliberately documents "URL tokens:
            // {term}, {reading}, {language}" for the learner to type, so braces are
            // legitimate copy in this surface. The onboarding panel has no such copy and
            // does carry a blanket guard, which is what caught it leaking one.
            expect(legend).not.toContain('{language}');
            expect(labelText(russian, 'pageScanMode')).not.toContain('{');
        } finally {
            resetActiveLearningTargetLanguage();
        }
    });

    it('keeps settings-shaped labels aligned with the adopted runtime target', () => {
        setActiveLearningTargetLanguage('ru');
        try {
            // DEFAULT_SETTINGS still names Japanese. The runtime target is the
            // authority for live behaviour and its labels after startup adopts
            // persisted settings, so a stale object cannot make the copy lie.
            expect(targetLanguageDisplayName(DEFAULT_SETTINGS)).toBe('Russian');
        } finally {
            resetActiveLearningTargetLanguage();
        }
    });

    it.each([
        { target: 'sh', english: 'Serbo-Croatian', japanese: 'セルボ・クロアチア語' },
        { target: 'tl', english: 'Tagalog', japanese: 'タガログ語' },
    ])('preserves the $english roster identity across picker, puck, and popup copy', ({
        target,
        english,
        japanese,
    }) => {
        setActiveLearningTargetLanguage(target);
        try {
            expect(studyTargetOptions('en').find(option => option.id === target)?.label).toContain(english);
            expect(targetLanguageDisplayName(DEFAULT_SETTINGS)).toBe(english);
            expect(activeContentLanguageAxes(DEFAULT_SETTINGS).targetName).toBe(english);
            expect(targetLanguageDisplayName({ ...DEFAULT_SETTINGS, interfaceLanguage: 'ja' })).toBe(japanese);
        } finally {
            resetActiveLearningTargetLanguage();
        }
    });

    it('keeps pronunciation and reading controls universal, and restores Japanese-only nodes', () => {
        const form = renderSettingsTestForm(DEFAULT_SETTINGS);
        // Japanese-only means the data/adapter behind it is Japanese. The YouTube
        // immersion filter follows the active target, while site redirects and
        // channel suggestions still own Japanese-only adapters/corpora.
        const japaneseOnlySelectors = [
            '[data-language-family="pitch-colouring"]',
            '[data-language-family="pitch-legend"]',
            '[data-language-family="provider-pills"]',
            'input[name="youtubeShowChannelRecommendations"]',
            'input[name="preferJapaneseSiteLanguage"]',
        ] as const;
        const everyTargetSelectors = [
            'input[name="youtubeImmersionEnabled"]',
            'input[name="youtubeShowFilterNotice"]',
        ] as const;
        const japaneseNodes = japaneseOnlySelectors.map(selector => form.querySelector(selector));
        const reading = form.querySelector('[data-language-family="reading-annotation"]');
        const furiganaMode = form.querySelector('select[name="furiganaMode"]');
        const pronunciation = form.querySelector('[data-language-family="pronunciation"]');
        const pronunciationToggle = form.querySelector('input[name="showPitchAccent"]');

        syncLanguageFamilyDom(form, 'ja');
        expect(form.dataset.language).toBe('ja');
        expect(japaneseNodes.every(Boolean)).toBe(true);
        expect(reading).not.toBeNull();
        expect(pronunciation).not.toBeNull();

        syncLanguageFamilyDom(form, 'ko');
        expect(form.dataset.language).toBe('ko');
        expect(japaneseOnlySelectors.map(selector => form.querySelector(selector))).toEqual(
            japaneseOnlySelectors.map(() => null),
        );
        expect(form.querySelectorAll('.jp-only')).toHaveLength(0);
        // ...and the target-following controls survive, so 31 targets can reach a
        // filter that works for them.
        expect(everyTargetSelectors.map(selector => Boolean(form.querySelector(selector))))
            .toEqual(everyTargetSelectors.map(() => true));
        expect(form.querySelector('[data-language-family="reading-annotation"]')).toBe(reading);
        expect(form.querySelector('select[name="furiganaMode"]')).toBe(furiganaMode);
        expect(form.querySelector('[data-language-family="pronunciation"]')).toBe(pronunciation);
        expect(form.querySelector('input[name="showPitchAccent"]')).toBe(pronunciationToggle);

        syncLanguageFamilyDom(form, 'es');
        expect(form.querySelector('[data-language-family="reading-annotation"]')).toBe(reading);
        expect(form.querySelector('select[name="furiganaMode"]')).toBe(furiganaMode);
        expect(form.querySelector('[data-language-family="pronunciation"]')).toBe(pronunciation);
        expect(form.querySelector('input[name="showPitchAccent"]')).toBe(pronunciationToggle);

        syncLanguageFamilyDom(form, 'ja');
        expect(form.dataset.language).toBe('ja');
        expect(japaneseOnlySelectors.map(selector => form.querySelector(selector))).toEqual(japaneseNodes);
        expect(form.querySelector('[data-language-family="reading-annotation"]')).toBe(reading);
    });

    it('uses the shared Japanese, Chinese, Cantonese, and Korean family vocabulary', () => {
        const root = document.createElement('section');
        root.innerHTML = `
            <span class="jp-only">ja</span>
            <span class="jpzhyue-only">ja/zh/yue</span>
            <span class="jpzhyueko-only">ja/zh/yue/ko</span>
            <span class="not-jpzhyueko">other</span>
        `;

        syncLanguageFamilyDom(root, 'ko');
        expect(root.textContent?.trim()).toBe('ja/zh/yue/ko');

        syncLanguageFamilyDom(root, 'en');
        expect(root.textContent?.trim()).toBe('other');

        syncLanguageFamilyDom(root, 'zh');
        expect(root.textContent?.replace(/\s+/g, ' ').trim()).toBe('ja/zh/yue ja/zh/yue/ko');
    });

    it('gates language-family nodes added after a reader root was first stamped', () => {
        const root = document.createElement('section');
        syncLanguageFamilyDom(root, 'es');
        root.innerHTML = '<span class="jp-only">pitch</span>';

        syncLanguageFamilyDom(root, 'es');
        expect(root.querySelector('.jp-only')).toBeNull();

        syncLanguageFamilyDom(root, 'ja');
        expect(root.querySelector('.jp-only')?.textContent).toBe('pitch');
    });

    // A48 made the YouTube immersion filter ask the ACTIVE target whether text is its
    // language, but its control stayed `jp-only` DETACHED, so 31 of 32 targets could
    // not reach a feature that worked for them. Availability follows the capability;
    // only the channel suggestions stay Japanese, because their corpus is.
    it('offers the immersion filter to a non-Japanese target, with its own label', () => {
        setActiveLearningTargetLanguage('ru');
        try {
            const russianSettings = {
                ...DEFAULT_SETTINGS,
                languageProfiles: DEFAULT_SETTINGS.languageProfiles.map(profile =>
                    profile.id === DEFAULT_SETTINGS.activeLanguageProfileId
                        ? { ...profile, targetLanguage: 'ru' }
                        : profile),
            };
            const form = renderSettingsTestForm(russianSettings);
            syncLanguageFamilyDom(form, 'ru');

            const filter = form.querySelector<HTMLInputElement>('input[name="youtubeImmersionEnabled"]');
            expect(filter).not.toBeNull();
            expect(filter?.checked).toBe(false);
            expect(labelFor(form, 'youtubeImmersionEnabled')).toContain('Russian');
            expect(labelFor(form, 'youtubeImmersionEnabled')).not.toContain('Japanese');
            // The suggestion corpus is 100 JLPT-graded Japanese channels, so it goes.
            expect(form.querySelector('input[name="youtubeShowChannelRecommendations"]')).toBeNull();
            // And a save must not read the detached checkbox as a deliberate uncheck.
            const saved = readFormSettings(new FormData(form), russianSettings);
            expect(saved.youtubeImmersionEnabled).toBe(true);
            expect(saved.youtubeImmersionEnabledChosen).toBe(false);
            expect(saved.youtubeShowChannelRecommendations)
                .toBe(DEFAULT_SETTINGS.youtubeShowChannelRecommendations);
            expect(saved.youtubeShowChannelRecommendationsChosen).toBe(false);

            filter!.checked = true;
            const optedIn = readFormSettings(new FormData(form), russianSettings);
            expect(optedIn.youtubeImmersionEnabled).toBe(true);
            expect(optedIn.youtubeImmersionEnabledChosen).toBe(true);
            // The form read declares the flag it changed; the intent ledger
            // couples it to the value it qualifies from the key NAME, so the
            // stale raw value cannot be replayed underneath the flag. No
            // hand-maintained list of pairs is involved any more.
            expect(changedSettingsKeys(russianSettings, optedIn))
                .toEqual(expect.arrayContaining(['youtubeImmersionEnabledChosen']));
            expect(coupledSettingsIntentKeys(changedSettingsKeys(russianSettings, optedIn)))
                .toEqual(expect.arrayContaining([
                    'youtubeImmersionEnabled',
                    'youtubeImmersionEnabledChosen',
                ]));
        } finally {
            resetActiveLearningTargetLanguage();
        }
    });

    it('resyncs an untouched YouTube default when the target changes in an open form', () => {
        const form = renderSettingsTestForm(DEFAULT_SETTINGS);
        const picker = form.elements.namedItem('targetLanguage') as HTMLSelectElement;
        const filter = form.elements.namedItem('youtubeImmersionEnabled') as HTMLInputElement;
        const initial = form.elements.namedItem('youtubeImmersionEnabledInitial') as HTMLInputElement;
        expect(filter.checked).toBe(true);
        expect(initial.value).toBe('on');

        picker.value = 'ru';
        syncYoutubeImmersionTarget(form, DEFAULT_SETTINGS, picker.value);
        expect(filter.checked).toBe(false);
        expect(initial.value).toBe('off');

        const saved = readFormSettings(new FormData(form), DEFAULT_SETTINGS);
        expect(saved.youtubeImmersionEnabled).toBe(true);
        expect(saved.youtubeImmersionEnabledChosen).toBe(false);
        expect(activeTargetLanguageId(saved)).toBe('ru');

        // Once touched, another target sync must preserve the learner's edit.
        filter.checked = true;
        syncYoutubeImmersionTarget(form, DEFAULT_SETTINGS, 'ja');
        expect(filter.checked).toBe(true);
        expect(initial.value).toBe('off');
    });

    it('does not overwrite detached Japanese settings while saving another target', () => {
        const current = {
            ...DEFAULT_SETTINGS,
            furiganaMode: 'hover' as const,
            clampedRowReadings: 'hover' as const,
            showPitchAccent: true,
            showLookupPillFrequency: true,
            wordUnderlineColorSource: 'pitch' as const,
            youtubeImmersionEnabled: true,
            youtubeImmersionEnabledChosen: false,
            youtubeShowChannelRecommendations: true,
            youtubeShowChannelRecommendationsChosen: false,
            youtubeShowFilterNotice: false,
            preferJapaneseSiteLanguage: true,
        };
        const form = renderSettingsTestForm(current);
        const picker = form.elements.namedItem('targetLanguage') as HTMLSelectElement;
        picker.value = 'ko';
        syncLanguageFamilyDom(form, 'ko');

        const saved = readFormSettings(new FormData(form), current);

        expect(activeTargetLanguageId(saved)).toBe('ko');
        expect(saved).toMatchObject({
            furiganaMode: 'hover',
            clampedRowReadings: 'hover',
            showPitchAccent: true,
            showLookupPillFrequency: true,
            wordUnderlineColorSource: 'pitch',
            youtubeImmersionEnabled: true,
            youtubeImmersionEnabledChosen: false,
            youtubeShowChannelRecommendations: true,
            youtubeShowChannelRecommendationsChosen: false,
            youtubeShowFilterNotice: false,
            preferJapaneseSiteLanguage: true,
        });
    });
});

function labelText(form: HTMLFormElement, controlName: string): string {
    const control = form.elements.namedItem(controlName);
    const group = (control instanceof RadioNodeList ? control[0] : control) as HTMLElement | null;
    return group?.closest('.jpdb-reader-radio-group')?.querySelector('legend')?.textContent ?? '';
}

function labelFor(form: HTMLFormElement, controlName: string): string {
    const control = form.elements.namedItem(controlName) as HTMLElement | null;
    return control?.closest('label')?.textContent ?? '';
}

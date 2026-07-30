import { describe, expect, it } from 'vitest';

import { LEARNER_LANGUAGE_IDS } from '../../../src/reader/locales/types';
import { activeTargetLanguageId, readFormSettings } from '../../../src/reader/settings/form';
import { syncLanguageFamilyDom } from '../../../src/reader/settings/language-gating';
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

    it('physically removes Japanese-only controls and restores the same nodes', () => {
        const form = renderSettingsTestForm(DEFAULT_SETTINGS);
        const selectors = [
            'select[name="furiganaMode"]',
            '[data-language-family="reading-annotation"]',
            '[data-language-family="pitch-colouring"]',
            '[data-language-family="pitch-legend"]',
            '[data-language-family="provider-pills"]',
        ] as const;
        const japaneseNodes = selectors.map(selector => form.querySelector(selector));

        syncLanguageFamilyDom(form, 'ja');
        expect(form.dataset.language).toBe('ja');
        expect(japaneseNodes.every(Boolean)).toBe(true);

        syncLanguageFamilyDom(form, 'ko');
        expect(form.dataset.language).toBe('ko');
        expect(selectors.map(selector => form.querySelector(selector))).toEqual(
            selectors.map(() => null),
        );
        expect(form.querySelectorAll('.jp-only')).toHaveLength(0);

        syncLanguageFamilyDom(form, 'ja');
        expect(form.dataset.language).toBe('ja');
        expect(selectors.map(selector => form.querySelector(selector))).toEqual(japaneseNodes);
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

    it('does not overwrite detached Japanese settings while saving another target', () => {
        const current = {
            ...DEFAULT_SETTINGS,
            furiganaMode: 'hover' as const,
            clampedRowReadings: 'hover' as const,
            showPitchAccent: true,
            showLookupPillFrequency: true,
            wordUnderlineColorSource: 'pitch' as const,
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
        });
    });
});

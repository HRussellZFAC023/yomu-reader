import { describe, expect, it } from 'vitest';
import {
    DEFAULT_SETTINGS,
    findRecommendedDictionary,
    localizeSettingsForm,
    recommendedDictionaryButton,
    recommendedDictionaryGuideOrNull,
    recommendedDictionaryHelp,
    registerSettingsFormCleanup,
    renderSettingsTestForm,
    settingsText,
} from './fixtures';

describe('recommended dictionary settings buttons', () => {
    registerSettingsFormCleanup();

    it('does not claim a recommended dictionary is installed from synced preferences alone', () => {
        const form = renderSettingsTestForm({
            ...DEFAULT_SETTINGS,
            dictionaryPreferences: [
                { name: 'Jitendex.org [2025-12-02]', alias: 'Jitendex', enabled: true, priority: 0, type: 'terms' },
                { name: 'Kanjium Pitch Accents', alias: 'Pitch', enabled: true, priority: 1, type: 'metadata' },
                { name: 'JPDB v2.2 Frequency Kana', alias: 'JPDB Frequency', enabled: true, priority: 1, type: 'frequency' },
            ],
        });

        expect(recommendedDictionaryButton(form, 'jitendex').textContent?.trim()).toBe('Install');
        expect(recommendedDictionaryButton(form, 'kanjium-pitch').textContent?.trim()).toBe('Install');
        expect(recommendedDictionaryGuideOrNull(form, 'kanjium-pitch')).toBeNull();
        expect(recommendedDictionaryButton(form, 'jpdbv2-kana').textContent?.trim()).toBe('Install');
    });

    it('shows pitch dictionaries as their own recommended group before frequency dictionaries', () => {
        const form = renderSettingsTestForm(DEFAULT_SETTINGS);
        // The mirrored-catalogue browse list below carries its own category
        // titles; this assertion is about the curated recommendations.
        const groupTitles = Array.from(
            form.querySelectorAll<HTMLElement>('.jpdb-reader-recommended-group-title:not([data-catalog-browse-category])'),
            title => title.textContent,
        );

        expect(groupTitles).toEqual(['Term dictionaries', 'Kanji dictionaries', 'Pitch dictionaries', 'Frequency dictionaries']);
        expect(settingsText(form, '[data-recommended-dictionary-help]')).toContain('Install a term dictionary first');
        expect(settingsText(form, '[data-recommended-dictionary-help]')).toContain('not normal definition text');
        expect(recommendedDictionaryHelp(form, 'kanjium-pitch')).toContain('Pitch accents only');
        expect(recommendedDictionaryHelp(form, 'jpdbv2-kana')).toContain('frequency badges');
        expect(recommendedDictionaryButton(form, 'kanjium-pitch').textContent?.trim()).toBe('Install');
        expect(findRecommendedDictionary('kanjium-pitch')?.downloadUrl).toBe('https://raw.githubusercontent.com/FooSoft/yomichan/dictionaries/kanjium_pitch_accents.zip');
        expect(recommendedDictionaryButton(form, 'jpdbv2-kana').compareDocumentPosition(recommendedDictionaryButton(form, 'jiten')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('localizes guide-only pitch help and clarifies frequency dictionaries are badges', () => {
        const form = renderSettingsTestForm(DEFAULT_SETTINGS);
        localizeSettingsForm(form, 'ja');

        expect(settingsText(form, '[data-recommended-dictionary-help]')).toContain('通常の定義文は追加しません');
        expect(recommendedDictionaryHelp(form, 'kanjium-pitch')).toContain('ピッチアクセント専用');
        expect(recommendedDictionaryHelp(form, 'jpdbv2-kana')).toContain('頻度バッジ');
        expect(settingsText(form, '#jpdb-reader-settings-panel-backup [data-import-status]')).toContain('語句/ピッチ/頻度辞書');
    });

    it('does not treat Jitendex as the Jiten frequency dictionary', () => {
        const form = renderSettingsTestForm({
            ...DEFAULT_SETTINGS,
            dictionaryPreferences: [
                { name: 'Jitendex.org [2025-12-02]', alias: 'Jitendex', enabled: true, priority: 0, type: 'terms' },
            ],
        });

        expect(recommendedDictionaryButton(form, 'jitendex').textContent?.trim()).toBe('Install');
        expect(recommendedDictionaryButton(form, 'jiten').textContent?.trim()).toBe('Install');
    });
});

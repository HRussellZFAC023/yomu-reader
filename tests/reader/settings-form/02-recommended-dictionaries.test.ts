import { describe, expect, it } from 'vitest';
import {
    RECOMMENDED_JAPANESE_DICTIONARIES,
    catalogBrowseLanguageSectionsForLearnerLanguage,
    catalogRecommendedDictionaryId,
    recommendedDictionaryImportOptions,
} from '../../../src/reader/dictionaries/recommended';
import type { YomitanDictionaryInfo } from '../../../src/reader/dictionaries/yomitan';
import { renderRecommendedDictionaries } from '../../../src/reader/settings/dictionary-recommendations-view';
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
        expect(recommendedDictionaryButton(form, JPDB_KANA_SEED).textContent?.trim()).toBe('Install');
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
        expect(recommendedDictionaryHelp(form, 'jiten')).toContain('Frequency badges');
        expect(recommendedDictionaryButton(form, 'kanjium-pitch').textContent?.trim()).toBe('Install');
        expect(findRecommendedDictionary('kanjium-pitch')?.downloadUrl).toBe('https://raw.githubusercontent.com/FooSoft/yomichan/dictionaries/kanjium_pitch_accents.zip');
        expect(recommendedDictionaryButton(form, 'kanjium-pitch').compareDocumentPosition(recommendedDictionaryButton(form, 'jiten')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('localizes guide-only pitch help and clarifies frequency dictionaries are badges', () => {
        const form = renderSettingsTestForm(DEFAULT_SETTINGS);
        localizeSettingsForm(form, 'ja');

        expect(settingsText(form, '[data-recommended-dictionary-help]')).toContain('通常の定義文は追加しません');
        expect(recommendedDictionaryHelp(form, 'kanjium-pitch')).toContain('ピッチアクセント専用');
        expect(recommendedDictionaryHelp(form, 'jiten')).toContain('頻度バッジ');
        // The backup panel's import line is a live status region now, not help copy.
        const importStatus = form.querySelector<HTMLElement>('#jpdb-reader-settings-panel-backup [data-import-status]');
        expect(importStatus?.getAttribute('role')).toBe('status');
        expect(importStatus?.hidden).toBe(true);
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

const JPDB_KANA_SEED = catalogRecommendedDictionaryId('en', 'ja', 'drive-japanese-ja-freq-jpdb-v2-2-frequency-kana-2024-10-13-p5yytox4s0');
const MIRROR = 'https://dictionaries.yomureader.com/objects/sha256/';

// Hosts without CORS (GitHub releases, api.jiten.moe) cannot be read by Study
// on its own, and a 51 MB archive does not fit through the Reader bridge.
describe('the hand-picked Japanese dictionary shelf', () => {
    it('leaves JMdict, JMnedict, KANJIDIC and JPDBv2㋕ to the seed above it', () => {
        expect(RECOMMENDED_JAPANESE_DICTIONARIES.map(dictionary => dictionary.id))
            .toEqual(['jitendex', 'wty-ja-ja', 'pixiv-light', 'jpdb-kanji', 'kanjium-pitch', 'jiten', 'bccwj']);
    });

    it('installs from the mirror with its digest, except the two upstream-only cards', () => {
        const upstream = RECOMMENDED_JAPANESE_DICTIONARIES.filter(dictionary => !dictionary.downloadUrl?.startsWith(MIRROR));
        expect(upstream.map(dictionary => dictionary.id)).toEqual(['wty-ja-ja', 'kanjium-pitch']);
        expect(upstream.map(dictionary => recommendedDictionaryImportOptions(dictionary))).toEqual([undefined, undefined]);
        for (const dictionary of RECOMMENDED_JAPANESE_DICTIONARIES.filter(item => !upstream.includes(item))) {
            expect(recommendedDictionaryImportOptions(dictionary)).toEqual({
                integrity: { sha256: expect.stringMatching(/^[0-9a-f]{64}$/u), bytes: dictionary.bytes },
            });
            expect(dictionary.downloadUrl).toBe(`${MIRROR}${dictionary.sha256}.zip`);
        }
        expect(findRecommendedDictionary('pixiv-light')?.bytes).toBe(51_170_783);
    });

    it('does not list the same archives again in the mirror browse below it', () => {
        const curated = new Set(RECOMMENDED_JAPANESE_DICTIONARIES.map(dictionary => dictionary.downloadUrl));
        for (const learnerLanguage of ['en', 'es'] as const) {
            const browsed = catalogBrowseLanguageSectionsForLearnerLanguage(learnerLanguage, 'ja')
                .flatMap(section => section.groups.flatMap(group => group.dictionaries));
            expect(browsed.length).toBeGreaterThan(0);
            expect(browsed.filter(dictionary => curated.has(dictionary.downloadUrl)).map(dictionary => dictionary.id)).toEqual([]);
        }
    });

    it('still counts a dictionary installed from a retired or upstream card as installed', () => {
        const installed = (title: string, downloadUrl: string): YomitanDictionaryInfo => ({ title, alias: title, enabled: true, priority: 0, downloadUrl });
        const host = document.createElement('div');
        // The titles are the archives' own index.json titles, as installed.
        host.innerHTML = renderRecommendedDictionaries([
            installed('Jitendex.org [2026-10-03]', 'https://github.com/stephenmk/stephenmk.github.io/releases/latest/download/jitendex-yomitan.zip'),
            installed('JMdict [2026-10-04]', 'https://github.com/yomidevs/jmdict-yomitan/releases/latest/download/JMdict_english.zip'),
            installed('JMnedict [2026-10-04]', 'https://github.com/yomidevs/jmdict-yomitan/releases/latest/download/JMnedict.zip'),
            installed('KANJIDIC [2026-277]', 'https://github.com/yomidevs/jmdict-yomitan/releases/latest/download/KANJIDIC_english.zip'),
            installed('PixivLight [2023-11-24]', 'https://raw.githubusercontent.com/MarvNC/yomitan-dictionaries/master/dl/%5BMonolingual%5D%20PixivLight.zip'),
            installed('JPDBv2㋕', 'https://github.com/Kuuuube/yomitan-dictionaries/releases/download/yomitan-permalink/JPDB_v2.2_Frequency_Kana.zip'),
            installed('Jiten', 'https://api.jiten.moe/api/frequency-list/download?downloadType=yomitan'),
        ], 'en', false, 'ja');
        const button = (id: string) => host.querySelector<HTMLButtonElement>(`[data-dictionary-id="${id}"]`);

        for (const id of ['jmdict-en', 'jmnedict', 'kanjidic-en', 'drive-japanese-ja-freq-jpdb-v2-2-frequency-kana-2024-10-13-p5yytox4s0']) {
            expect(button(catalogRecommendedDictionaryId('en', 'ja', id))?.dataset.installed, id).toBe('true');
        }
        for (const id of ['jitendex', 'pixiv-light', 'jiten']) expect(button(id)?.dataset.installed, id).toBe('true');
        expect(button('bccwj')?.dataset.installed).toBe('false');
        expect(button(catalogRecommendedDictionaryId('en', 'ja', 'drive-japanese-pitch-nhk-lpvpeu-xlu'))?.dataset.installed).toBe('false');
    });
});

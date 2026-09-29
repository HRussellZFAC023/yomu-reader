import { describe, expect, it, vi } from 'vitest';
import { SLICE1_LEARNER_LANGUAGES, SLICE1_TARGET_LANGUAGES } from '../../src/reader/dictionaries/catalog/types';
import { findRecommendedDictionary, recommendedDictionariesForLanguageProfile, recommendedDictionaryImportOptions } from '../../src/reader/dictionaries/recommended';
import { installOfflineParsingDictionaries } from '../../src/reader/dictionaries/offline-setup';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { ReaderSettings } from '../../src/reader/app/types';

describe('offline starter profile characterization', () => {
    it('preserves the ordered install requests and integrity for all 1056 profiles', async () => {
        let profiles = 0;
        for (const learner of SLICE1_LEARNER_LANGUAGES) {
            for (const target of SLICE1_TARGET_LANGUAGES) {
                const expected = recommendedDictionariesForLanguageProfile(learner, target)
                    .filter(dictionary => dictionary.selectedByDefault !== false && Boolean(dictionary.downloadUrl));
                if (target === 'ja') expected.push(findRecommendedDictionary('kanjium-pitch')!);
                const base = DEFAULT_SETTINGS.languageProfiles[0]!;
                let settings: ReaderSettings = {
                    ...DEFAULT_SETTINGS,
                    activeLanguageProfileId: base.id,
                    languageProfiles: [{ ...base, outputLanguage: learner, targetLanguage: target }],
                    dictionaryPreferences: [],
                };
                const onProgress = vi.fn();
                const importFromUrl = vi.fn(async () => ({ dictionaries: [], entries: 0, terms: 0, kanji: 0, termMeta: 0, kanjiMeta: 0 }));
                const result = await installOfflineParsingDictionaries({
                    dictionaries: { importFromUrl, summary: async () => ({ dictionaries: [], terms: 0, kanji: 0, termMeta: 0, kanjiMeta: 0 }) },
                    getSettings: () => settings,
                    applySettings: next => { settings = next; },
                    onProgress,
                });
                expect(importFromUrl.mock.calls, `${learner}/${target}`).toEqual(expected.map(dictionary => {
                    const options = recommendedDictionaryImportOptions(dictionary);
                    return options ? [dictionary.downloadUrl, undefined, onProgress, options] : [dictionary.downloadUrl, undefined, onProgress];
                }));
                expect(result).toEqual({ installed: expected.map(dictionary => dictionary.name), skipped: [], failed: [] });
                profiles++;
            }
        }
        expect(profiles).toBe(1056);
    }, 30_000);
});

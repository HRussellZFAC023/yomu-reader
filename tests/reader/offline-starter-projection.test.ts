import { describe, expect, it } from 'vitest';
import projection from '../../config/dictionaries/published/v1/offline-starters.json';
import { SLICE1_LEARNER_LANGUAGES, SLICE1_TARGET_LANGUAGES } from '../../src/reader/dictionaries/catalog/types';
import { offlineStartersForProfile } from '../../src/reader/dictionaries/offline-starters';
import { offlineStartersForProfile as projectedStarters } from '../../src/reader/dictionaries/offline-starters-projection';
import { findRecommendedDictionary, recommendedDictionariesForLanguageProfile, recommendedDictionaryImportOptions, recommendedDictionaryInstalledIdentity } from '../../src/reader/dictionaries/recommended';

describe('generated offline starter projection', () => {
    it('matches authoritative archive identities and integrity for every profile with no stale entries', () => {
        const archives = new Set<string>();
        const profiles: string[] = [];
        for (const learner of SLICE1_LEARNER_LANGUAGES) {
            for (const target of SLICE1_TARGET_LANGUAGES) {
                const expected = recommendedDictionariesForLanguageProfile(learner, target)
                    .filter(dictionary => dictionary.selectedByDefault !== false && Boolean(dictionary.downloadUrl));
                if (target === 'ja') expected.push(findRecommendedDictionary('kanjium-pitch')!);
                const key = `${learner}-${target}`;
                profiles.push(key);
                const ids = expected.map(dictionary => dictionary.catalogDictionaryId ?? dictionary.id);
                ids.forEach(id => archives.add(id));
                expect(Reflect.get(projection.profiles, key), key).toEqual(ids);
                expect(offlineStartersForProfile(learner, target), key).toEqual(expected.map(dictionary => ({
                    name: dictionary.name,
                    downloadUrl: dictionary.downloadUrl,
                    installedIdentity: recommendedDictionaryInstalledIdentity(dictionary),
                    ...recommendedDictionaryImportOptions(dictionary),
                })));
                expect(projectedStarters(learner, target), `${key}: aggregate/full parity`)
                    .toEqual(offlineStartersForProfile(learner, target));
            }
        }
        expect(Object.keys(projection.profiles)).toEqual(profiles);
        expect(Object.keys(projection.dictionaries).sort()).toEqual([...archives].sort());
    });
});

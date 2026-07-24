import { describe, expect, it } from 'vitest';

import {
    activeLanguageProfile,
    createDefaultLanguageProfile,
    normalizeLanguageProfiles,
    resolveLanguageProfile,
    resolvedLearnerLanguage,
} from '../../../src/reader/languages/profiles';
import { normalizeSlice1LearnerLanguage } from '../../../src/reader/languages/roster';

describe('language profile normalization', () => {
    it('creates the Slice 1 Japanese target with privacy-preserving defaults', () => {
        expect(createDefaultLanguageProfile({
            learnerLanguage: 'ko_KR',
            uiLocale: 'ko_KR',
            parserProvider: 'local',
        })).toEqual({
            schemaVersion: 1,
            id: 'default-ja',
            learnerLanguage: 'ko-KR',
            targetLanguage: 'ja',
            uiLocale: 'ko-KR',
            parserProvider: 'local',
            dictionaries: { installed: [], enabled: [], order: [] },
            definitionTranslationProviderIds: [],
        });
    });

    it('normalizes profiles, dictionary invariants, and duplicate IDs', () => {
        const normalized = normalizeLanguageProfiles([
            {
                schemaVersion: 1,
                id: 'work',
                learnerLanguage: 'pt_BR',
                targetLanguage: 'en',
                uiLocale: 'pt_BR',
                parserProvider: 'jiten',
                dictionaries: {
                    installed: ['jitendex', 'jitendex'],
                    enabled: ['jitendex', 'names'],
                    order: ['names', 'pitch'],
                },
                definitionTranslationProviderIds: ['jpdb', 'jpdb', 'jiten'],
            },
            {
                schemaVersion: 1,
                id: 'work',
                learnerLanguage: 'ko',
                targetLanguage: 'ja',
                uiLocale: 'auto',
                parserProvider: 'local',
                dictionaries: {},
            },
        ], 'work-2');

        expect(normalized.activeProfileId).toBe('work-2');
        expect(normalized.profiles.map(profile => profile.id)).toEqual(['work', 'work-2']);
        expect(normalized.profiles[0]).toMatchObject({
            learnerLanguage: 'pt-BR',
            targetLanguage: 'ja',
            uiLocale: 'pt-BR',
            parserProvider: 'jiten',
            dictionaries: {
                installed: ['jitendex', 'names', 'pitch'],
                enabled: ['jitendex', 'names'],
                order: ['names', 'pitch', 'jitendex'],
            },
            definitionTranslationProviderIds: ['jpdb', 'jiten'],
        });
    });

    it('drops unsupported profile versions and repairs an invalid active ID', () => {
        const normalized = normalizeLanguageProfiles([
            { schemaVersion: 2, id: 'future', learnerLanguage: 'ko' },
            null,
        ], 'missing', {
            uiLocale: 'ja',
            parserProvider: 'auto',
        });

        expect(normalized.profiles).toHaveLength(1);
        expect(normalized.activeProfileId).toBe('default-ja');
        expect(normalized.profiles[0]).toMatchObject({
            learnerLanguage: 'en',
            targetLanguage: 'ja',
            uiLocale: 'ja',
            parserProvider: 'auto',
        });
    });

    it('resolves an active profile with a safe first-profile fallback', () => {
        const first = createDefaultLanguageProfile();
        const second = { ...first, id: 'second', learnerLanguage: 'ko' };
        expect(activeLanguageProfile([first, second], 'second')).toBe(second);
        expect(activeLanguageProfile([first, second], 'missing')).toBe(first);
        expect(activeLanguageProfile([], 'missing')).toBeNull();
    });

    it('exposes the active learner language without leaking settings storage details', () => {
        const profiles = [
            { ...createDefaultLanguageProfile(), id: 'english' },
            { ...createDefaultLanguageProfile(), id: 'korean', learnerLanguage: 'ko-KR' },
        ];
        const settingsShape = {
            languageProfiles: profiles,
            activeLanguageProfileId: 'korean',
            interfaceLanguage: 'en',
            parserProvider: 'local',
        };

        expect(resolveLanguageProfile(settingsShape).id).toBe('korean');
        expect(resolvedLearnerLanguage(settingsShape)).toBe('ko-KR');
        expect(resolvedLearnerLanguage(profiles[0])).toBe('en');
        expect(resolvedLearnerLanguage(null)).toBe('en');
    });

    it('canonicalizes every Serbo-Croatian alias to the same Latin-script runtime identity', () => {
        expect(['sh', 'sr', 'sr-Latn', 'hr', 'bs'].map(value => normalizeSlice1LearnerLanguage(value)))
            .toEqual(Array(5).fill('sr-Latn'));
    });
});

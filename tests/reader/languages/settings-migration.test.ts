import { describe, expect, it } from 'vitest';

import type { ReaderSettings } from '../../../src/reader/app/types';
import { DEFAULT_SETTINGS, normalizeReaderSettings } from '../../../src/reader/settings';
import { activeLanguageProfile, createDefaultLanguageProfile, normalizeLanguageProfiles, resolveLanguageProfile } from "../../../src/reader/languages/profiles";

describe('Reader settings language-profile migration', () => {
    it('ships a fresh Japanese target profile without changing current parser defaults', () => {
        expect(DEFAULT_SETTINGS.activeLanguageProfileId).toBe('default-ja');
        expect(DEFAULT_SETTINGS.languageProfiles).toEqual([
            expect.objectContaining({
                schemaVersion: 2,
                id: 'default-ja',
                outputLanguage: 'en',
                learnerLanguage: 'en',
                targetLanguage: 'ja',
                uiLocale: 'en',
                parserProvider: 'local',
            }),
        ]);
    });

    it('migrates legacy interface/parser settings into an independent profile', () => {
        const settings = normalizeReaderSettings({
            interfaceLanguage: 'ja',
            parserProvider: 'jpdb',
        });

        expect(settings.interfaceLanguage).toBe('ja');
        expect(settings.parserProvider).toBe('jpdb');
        expect(settings.languageProfiles).toEqual([
            expect.objectContaining({
                outputLanguage: 'en',
                learnerLanguage: 'en',
                targetLanguage: 'ja',
                uiLocale: 'ja',
                parserProvider: 'jpdb',
            }),
        ]);
    });

    it('treats a newly added untouched default profile as migration state', () => {
        const settings = normalizeReaderSettings({
            ...DEFAULT_SETTINGS,
            interfaceLanguage: 'ja',
            parserProvider: 'jpdb',
            dictionaryPreferences: [
                { name: 'Legacy dictionary', alias: '', enabled: true, priority: 0, type: 'terms' },
            ],
        });

        expect(settings.interfaceLanguage).toBe('ja');
        expect(settings.parserProvider).toBe('jpdb');
        expect(settings.languageProfiles[0]).toMatchObject({
            uiLocale: 'ja',
            parserProvider: 'jpdb',
            dictionaries: {
                installed: ['Legacy dictionary'],
                enabled: ['Legacy dictionary'],
                order: ['Legacy dictionary'],
            },
        });
    });

    it('normalizes persisted profiles and derives compatibility mirrors from the active profile', () => {
        const raw = {
            ...DEFAULT_SETTINGS,
            parserProvider: 'auto',
            activeLanguageProfileId: 'korean-ja',
            dictionaryPreferences: [
                { name: 'Korean terms', alias: 'Korean terms', enabled: false, priority: 0, type: 'terms' },
                { name: 'English terms', alias: 'English terms', enabled: true, priority: 1, type: 'terms' },
            ],
            languageProfiles: [{
                schemaVersion: 1,
                id: 'korean-ja',
                learnerLanguage: 'ko_KR',
                targetLanguage: 'en',
                uiLocale: 'ja',
                parserProvider: 'local',
                dictionaries: {
                    installed: ['Korean terms'],
                    enabled: ['Korean terms'],
                    order: ['Korean terms'],
                },
                definitionTranslationProviderIds: [],
            }],
        } as unknown as Partial<ReaderSettings>;

        const settings = normalizeReaderSettings(raw);
        expect(settings.activeLanguageProfileId).toBe('korean-ja');
        expect(settings.languageProfiles[0]).toMatchObject({
            schemaVersion: 2,
            outputLanguage: 'ko-KR',
            learnerLanguage: 'ko-KR',
            targetLanguage: 'en',
            uiLocale: 'ja',
            parserProvider: 'local',
        });
        expect(settings.parserProvider).toBe('local');
        expect(settings.interfaceLanguage).toBe('ja');
        expect(settings.dictionaryPreferences.map(preference => [
            preference.name,
            preference.enabled,
        ])).toEqual([
            ['Korean terms', true],
            ['English terms', false],
        ]);
    });
});

describe('language profile normalization', () => {
    it('creates the Slice 1 Japanese target with privacy-preserving defaults', () => {
        expect(createDefaultLanguageProfile({
            learnerLanguage: 'ko_KR',
            uiLocale: 'ko_KR',
            parserProvider: 'local',
        })).toEqual({
            schemaVersion: 2,
            id: 'default-ja',
            outputLanguage: 'ko-KR',
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
            outputLanguage: 'pt-BR',
            learnerLanguage: 'pt-BR',
            targetLanguage: 'en',
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
            { schemaVersion: 3, id: 'future', outputLanguage: 'ko' },
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

    it('keeps a stored target and definition language verbatim', () => {
        const [profile] = normalizeLanguageProfiles([{
            schemaVersion: 2,
            id: 'learner-de-es',
            outputLanguage: 'de',
            learnerLanguage: 'de',
            targetLanguage: 'es',
            uiLocale: 'en',
            parserProvider: 'local',
            dictionaries: { installed: [], enabled: [], order: [] },
            definitionTranslationProviderIds: ['jpdb'],
        }], 'learner-de-es').profiles;

        expect(profile).toMatchObject({
            id: 'learner-de-es',
            outputLanguage: 'de',
            learnerLanguage: 'de',
            targetLanguage: 'es',
            definitionTranslationProviderIds: ['jpdb'],
        });
        expect(resolveLanguageProfile({ languageProfiles: [profile], activeLanguageProfileId: profile!.id }).targetLanguage).toBe('es');
    });
});

import { describe, expect, it } from 'vitest';

import type { ReaderSettings } from '../../../src/reader/app/types';
import { DEFAULT_SETTINGS, normalizeReaderSettings } from '../../../src/reader/settings';

describe('Reader settings language-profile migration', () => {
    it('ships a fresh Japanese target profile without changing current parser defaults', () => {
        expect(DEFAULT_SETTINGS.activeLanguageProfileId).toBe('default-ja');
        expect(DEFAULT_SETTINGS.languageProfiles).toEqual([
            expect.objectContaining({
                schemaVersion: 1,
                id: 'default-ja',
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
            learnerLanguage: 'ko-KR',
            targetLanguage: 'ja',
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

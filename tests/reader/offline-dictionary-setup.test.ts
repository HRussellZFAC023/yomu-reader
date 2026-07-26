import { describe, expect, it, vi } from 'vitest';
import { installOfflineParsingDictionaries } from '../../src/reader/dictionaries/offline-setup';
import {
    findRecommendedDictionary,
    recommendedDictionariesForLearnerLanguage,
} from '../../src/reader/dictionaries/recommended';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { DictionaryImportOptions, ImportSummary } from '../../src/reader/dictionaries/yomitan';
import type { ReaderSettings } from '../../src/reader/app/types';

const KANJIUM_URL = findRecommendedDictionary('kanjium-pitch')!.downloadUrl!;
// Offline setup installs the preselected part of a learner language's
// recommendation. The rest of the shelf is opt-in from Settings, so it must not
// appear in these download plans.
const preselected = (learnerLanguage: 'en' | 'de' | 'ko') =>
    recommendedDictionariesForLearnerLanguage(learnerLanguage).filter(dictionary => dictionary.selectedByDefault !== false);
const ENGLISH_STARTER = [
    ...preselected('en'),
    findRecommendedDictionary('kanjium-pitch')!,
];
const STARTER_BY_URL = new Map(
    [
        ...ENGLISH_STARTER,
        ...recommendedDictionariesForLearnerLanguage('de'),
    ].map(dictionary => [dictionary.downloadUrl!, dictionary]),
);

function importSummary(dictionary: string): ImportSummary {
    return { dictionaries: [dictionary], dictionaryTypes: {}, entries: 5, terms: 5, kanji: 0, termMeta: 0, kanjiMeta: 0 };
}

interface HarnessOverrides {
    installedUrls?: string[];
    installedTitles?: string[];
    failUrl?: string;
}

function setupHarness(
    { installedUrls = [], installedTitles = [], failUrl }: HarnessOverrides = {},
    initialSettings: ReaderSettings = { ...DEFAULT_SETTINGS, localDictionariesEnabled: false },
) {
    let settings: ReaderSettings = initialSettings;
    const importFromUrl = vi.fn(async (
        url: string,
        _filename?: string,
        _onProgress?: (message: string) => void,
        _options?: DictionaryImportOptions,
    ) => {
        if (url === failUrl) throw new Error('download failed');
        return importSummary(STARTER_BY_URL.get(url)?.name ?? 'Imported starter');
    });
    const store = {
        importFromUrl,
        summary: vi.fn(async () => ({
            dictionaries: [
                ...installedUrls.map(downloadUrl => ({
                    title: STARTER_BY_URL.get(downloadUrl)?.name ?? downloadUrl,
                    alias: '',
                    enabled: true,
                    priority: 0,
                    downloadUrl,
                })),
                ...installedTitles.map(title => ({ title, alias: '', enabled: true, priority: 0 })),
            ],
            terms: 0,
            kanji: 0,
            termMeta: 0,
            kanjiMeta: 0,
        })),
    };
    const applySettings = vi.fn((next: ReaderSettings) => {
        settings = next;
    });
    return {
        store,
        importFromUrl,
        applySettings,
        getSettings: () => settings,
        run: () => installOfflineParsingDictionaries({ dictionaries: store, getSettings: () => settings, applySettings }),
    };
}

describe('offline dictionary setup', () => {
    it('installs the language starter set and pitch dictionary on a fresh profile', async () => {
        const harness = setupHarness();

        const result = await harness.run();

        expect(harness.importFromUrl.mock.calls.map(([url]) => url)).toEqual(
            ENGLISH_STARTER.map(dictionary => dictionary.downloadUrl),
        );
        expect(result.installed).toEqual(ENGLISH_STARTER.map(dictionary => dictionary.name));
        expect(result.failed).toEqual([]);
        expect(harness.getSettings().localDictionariesEnabled).toBe(true);
        expect(harness.getSettings().languageProfiles[0]?.dictionaries.installed)
            .toEqual(ENGLISH_STARTER.map(dictionary => dictionary.name));
        ENGLISH_STARTER.slice(0, ENGLISH_STARTER.length - 1).forEach((dictionary, index) => {
            expect(harness.importFromUrl.mock.calls[index]?.[3]).toEqual({
                integrity: {
                    sha256: dictionary.sha256,
                    bytes: dictionary.bytes,
                },
            });
        });
        expect(harness.importFromUrl.mock.calls.at(-1)?.[3]).toBeUndefined();
    });

    it('does not let an unrelated installed terms dictionary suppress the profile starter', async () => {
        const harness = setupHarness({ installedTitles: ['My private Japanese terms'] });

        const result = await harness.run();

        expect(harness.importFromUrl.mock.calls.map(([url]) => url))
            .toEqual(ENGLISH_STARTER.map(dictionary => dictionary.downloadUrl));
        expect(result.skipped).toEqual([]);
    });

    it('skips dictionaries already installed from the same download URL', async () => {
        const harness = setupHarness({
            installedUrls: ENGLISH_STARTER.map(dictionary => dictionary.downloadUrl!),
        });

        const result = await harness.run();

        expect(harness.importFromUrl).not.toHaveBeenCalled();
        expect(result.skipped).toEqual(ENGLISH_STARTER.map(dictionary => dictionary.name));
        expect(harness.getSettings().localDictionariesEnabled).toBe(true);
        expect(harness.getSettings().languageProfiles[0]?.dictionaries.enabled)
            .toEqual(ENGLISH_STARTER.map(dictionary => dictionary.name));
    });

    it('skips only the matching revision-independent catalogue identity', async () => {
        const profile = DEFAULT_SETTINGS.languageProfiles[0]!;
        const settings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            languageProfiles: [{ ...profile, learnerLanguage: 'de' }],
            localDictionariesEnabled: false,
        };
        const german = preselected('de');
        const harness = setupHarness({
            installedTitles: ['JMdict (German) [2026-07-20]'],
        }, settings);

        const result = await harness.run();

        expect(result.skipped).toEqual([german[0]?.name]);
        expect(harness.importFromUrl.mock.calls.map(([url]) => url)).toEqual([
            ...german.slice(1).map(dictionary => dictionary.downloadUrl),
            KANJIUM_URL,
        ]);
    });

    it('records a failed download and still installs the rest', async () => {
        const failed = ENGLISH_STARTER[0]!;
        const harness = setupHarness({ failUrl: failed.downloadUrl });

        const result = await harness.run();

        expect(result.failed).toEqual([failed.name]);
        expect(result.installed).toEqual(
            ENGLISH_STARTER.slice(1).map(dictionary => dictionary.name),
        );
        expect(harness.getSettings().localDictionariesEnabled).toBe(true);
    });

    it('never auto-downloads the opt-in half of the shelf', async () => {
        const harness = setupHarness();

        await harness.run();

        const requested = new Set(harness.importFromUrl.mock.calls.map(([url]) => url));
        const optIn = recommendedDictionariesForLearnerLanguage('en').filter(dictionary => dictionary.selectedByDefault === false);

        expect(optIn.map(dictionary => dictionary.role).sort()).toEqual(['examples', 'grammar', 'monolingual']);
        optIn.forEach(dictionary => {
            expect(requested.has(dictionary.downloadUrl!), dictionary.name).toBe(false);
        });
    });

    it('uses the active Korean profile recommendations instead of the English curated default', async () => {
        const profile = DEFAULT_SETTINGS.languageProfiles[0]!;
        const settings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            languageProfiles: [{ ...profile, learnerLanguage: 'ko' }],
            localDictionariesEnabled: false,
        };
        const harness = setupHarness({}, settings);

        await harness.run();

        const koreanUrls = preselected('ko').map(dictionary => dictionary.downloadUrl);
        expect(harness.importFromUrl.mock.calls.map(([url]) => url).slice(0, koreanUrls.length))
            .toEqual(koreanUrls);
        expect(koreanUrls.every(url => url?.startsWith('https://dictionaries.yomureader.com/objects/sha256/')))
            .toBe(true);
        expect(harness.importFromUrl.mock.calls.at(-1)?.[0]).toBe(KANJIUM_URL);
    });

    it('captures imported names only into the active language profile', async () => {
        const base = DEFAULT_SETTINGS.languageProfiles[0]!;
        const english = {
            ...base,
            id: 'english-ja',
            dictionaries: {
                installed: ['Existing English'],
                enabled: ['Existing English'],
                order: ['Existing English'],
            },
        };
        const korean = {
            ...base,
            id: 'korean-ja',
            learnerLanguage: 'ko',
        };
        const settings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            activeLanguageProfileId: korean.id,
            languageProfiles: [english, korean],
            dictionaryPreferences: [],
            localDictionariesEnabled: false,
        };
        const harness = setupHarness({}, settings);

        await harness.run();

        expect(harness.getSettings().languageProfiles.find(profile => profile.id === english.id)?.dictionaries)
            .toEqual(english.dictionaries);
        expect(harness.getSettings().languageProfiles.find(profile => profile.id === korean.id)?.dictionaries.installed)
            .toEqual(ENGLISH_STARTER.map(dictionary => dictionary.name));
    });

    it('adopts already-installed starter names when a new profile needs the same archives', async () => {
        const base = DEFAULT_SETTINGS.languageProfiles[0]!;
        const starterNames = ENGLISH_STARTER.map(dictionary => dictionary.name);
        const english = {
            ...base,
            id: 'english-ja',
            dictionaries: {
                installed: starterNames,
                enabled: starterNames,
                order: starterNames,
            },
        };
        const korean = {
            ...base,
            id: 'korean-ja',
            learnerLanguage: 'ko',
        };
        const settings: ReaderSettings = {
            ...DEFAULT_SETTINGS,
            activeLanguageProfileId: korean.id,
            languageProfiles: [english, korean],
            dictionaryPreferences: starterNames.map((name, priority) => ({
                name,
                alias: name,
                enabled: false,
                priority,
                type: 'terms',
            })),
            localDictionariesEnabled: true,
        };
        const harness = setupHarness({
            installedUrls: ENGLISH_STARTER.map(dictionary => dictionary.downloadUrl!),
        }, settings);

        await harness.run();

        expect(harness.importFromUrl).not.toHaveBeenCalled();
        expect(harness.getSettings().languageProfiles.find(profile => profile.id === english.id)?.dictionaries)
            .toEqual(english.dictionaries);
        expect(harness.getSettings().languageProfiles.find(profile => profile.id === korean.id)?.dictionaries.enabled)
            .toEqual(starterNames);
    });
});

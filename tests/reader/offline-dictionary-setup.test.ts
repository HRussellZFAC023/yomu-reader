import { describe, expect, it, vi } from 'vitest';
import { installOfflineParsingDictionaries } from '../../src/reader/dictionaries/offline-setup';
import { findRecommendedDictionary } from '../../src/reader/dictionaries/recommended';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';
import type { ImportSummary } from '../../src/reader/dictionaries/yomitan';
import type { ReaderSettings } from '../../src/reader/app/types';

const JITENDEX_URL = findRecommendedDictionary('jitendex')!.downloadUrl!;
const KANJIUM_URL = findRecommendedDictionary('kanjium-pitch')!.downloadUrl!;

function importSummary(dictionary: string): ImportSummary {
    return { dictionaries: [dictionary], dictionaryTypes: {}, entries: 5, terms: 5, kanji: 0, termMeta: 0, kanjiMeta: 0 };
}

interface HarnessOverrides {
    installedUrls?: string[];
    hasTermDictionaries?: boolean;
    failUrl?: string;
}

function setupHarness({ installedUrls = [], hasTermDictionaries = false, failUrl }: HarnessOverrides = {}) {
    let settings: ReaderSettings = { ...DEFAULT_SETTINGS, localDictionariesEnabled: false };
    const importFromUrl = vi.fn(async (url: string) => {
        if (url === failUrl) throw new Error('download failed');
        return importSummary(url === JITENDEX_URL ? 'Jitendex' : 'Kanjium');
    });
    const store = {
        importFromUrl,
        summary: vi.fn(async () => ({
            dictionaries: installedUrls.map(downloadUrl => ({ title: downloadUrl, alias: '', enabled: true, priority: 0, downloadUrl })),
            terms: 0,
            kanji: 0,
            termMeta: 0,
            kanjiMeta: 0,
        })),
        hasTermDictionaries: vi.fn(async () => hasTermDictionaries),
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
    it('installs the terms and pitch dictionaries on a fresh profile and enables local dictionaries', async () => {
        const harness = setupHarness();

        const result = await harness.run();

        expect(harness.importFromUrl.mock.calls.map(([url]) => url)).toEqual([JITENDEX_URL, KANJIUM_URL]);
        expect(result.installed).toEqual(['Jitendex', 'Kanjium pitch accents']);
        expect(result.failed).toEqual([]);
        expect(harness.getSettings().localDictionariesEnabled).toBe(true);
        expect(harness.getSettings().dictionaryPreferences.map(preference => preference.name)).toEqual(expect.arrayContaining(['Jitendex', 'Kanjium']));
    });

    it('skips the terms download when term dictionaries are already imported', async () => {
        const harness = setupHarness({ hasTermDictionaries: true });

        const result = await harness.run();

        expect(harness.importFromUrl.mock.calls.map(([url]) => url)).toEqual([KANJIUM_URL]);
        expect(result.skipped).toEqual(['Jitendex']);
    });

    it('skips dictionaries already installed from the same download URL', async () => {
        const harness = setupHarness({ installedUrls: [JITENDEX_URL, KANJIUM_URL] });

        const result = await harness.run();

        expect(harness.importFromUrl).not.toHaveBeenCalled();
        expect(result.skipped).toEqual(['Jitendex', 'Kanjium pitch accents']);
    });

    it('records a failed download and still installs the rest', async () => {
        const harness = setupHarness({ failUrl: JITENDEX_URL });

        const result = await harness.run();

        expect(result.failed).toEqual(['Jitendex']);
        expect(result.installed).toEqual(['Kanjium pitch accents']);
        expect(harness.getSettings().localDictionariesEnabled).toBe(true);
    });
});

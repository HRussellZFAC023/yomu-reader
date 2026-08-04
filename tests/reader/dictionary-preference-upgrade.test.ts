import { describe, expect, it } from 'vitest';
import {
    captureActiveLanguageProfileDictionaries,
    mergeDictionaryPreferences,
    retireStaleDictionaryPreferences,
} from '../../src/reader/settings/dictionary';
import { DEFAULT_SETTINGS, normalizeReaderSettings } from '../../src/reader/settings/index';
import type { DictionaryPreference, ReaderSettings } from '../../src/reader/app/types';

function preference(overrides: Partial<DictionaryPreference> & Pick<DictionaryPreference, 'name'>): DictionaryPreference {
    return {
        alias: overrides.name,
        enabled: true,
        priority: 0,
        allowSecondarySearches: false,
        type: 'terms',
        ...overrides,
    };
}

// Importing "Jitendex.org [2026-06-06]" deletes the data of same-identity
// "Jitendex.org [2026-05-05]" (revision upgrade), so the old preference row
// must retire with it and hand its customization to the new revision. The
// user-visible failure was a settings list showing both revisions enabled
// while the popover could only ever render one.
describe('dictionary preference revision upgrade', () => {
    it('retires the replaced revision row and inherits its customization', () => {
        const current = [
            preference({ name: 'Jitendex.org [2026-05-05]', alias: 'Jitendex', enabled: false, priority: 3 }),
            preference({ name: 'Kanjium Pitch', priority: 7, type: 'frequency' }),
        ];
        const merged = mergeDictionaryPreferences(current, ['Jitendex.org [2026-06-06]'], { 'Jitendex.org [2026-06-06]': 'terms' }, ['Jitendex.org [2026-05-05]']);
        expect(merged.map(row => row.name)).toEqual(['Jitendex.org [2026-06-06]', 'Kanjium Pitch']);
        expect(merged[0]).toMatchObject({ alias: 'Jitendex', enabled: false, priority: 3, type: 'terms' });
    });

    it('does not carry a default alias (the old title) onto the new revision', () => {
        const current = [preference({ name: 'Jitendex.org [2026-05-05]', priority: 2 })];
        const merged = mergeDictionaryPreferences(current, ['Jitendex.org [2026-06-06]'], {}, ['Jitendex.org [2026-05-05]']);
        expect(merged[0].alias).toBe('Jitendex.org [2026-06-06]');
    });

    it('keeps unrelated rows and existing rows untouched when nothing was replaced', () => {
        const current = [preference({ name: 'JMdict [2026-01-01]', priority: 1 })];
        const merged = mergeDictionaryPreferences(current, ['JMnedict [2026-01-01]'], {}, []);
        expect(merged.map(row => row.name)).toEqual(['JMdict [2026-01-01]', 'JMnedict [2026-01-01]']);
    });
});

describe('retireStaleDictionaryPreferences', () => {
    const may = preference({ name: 'Jitendex.org [2026-05-05]', priority: 0 });
    const june = preference({ name: 'Jitendex.org [2026-06-06]', priority: 4 });
    const kanjium = preference({ name: 'Kanjium Pitch', priority: 7, type: 'frequency' });

    it('drops a data-less row whose same-identity sibling is installed', () => {
        const healed = retireStaleDictionaryPreferences([may, june, kanjium], ['Jitendex.org [2026-06-06]', 'Kanjium Pitch']);
        expect(healed.map(row => row.name)).toEqual(['Jitendex.org [2026-06-06]', 'Kanjium Pitch']);
    });

    it('keeps rows without an installed sibling — this origin may not hold the data', () => {
        const healed = retireStaleDictionaryPreferences([may, kanjium], ['Kanjium Pitch']);
        expect(healed.map(row => row.name)).toEqual(['Jitendex.org [2026-05-05]', 'Kanjium Pitch']);
    });

    it('is a no-op when nothing is installed here', () => {
        const rows = [may, june, kanjium];
        expect(retireStaleDictionaryPreferences(rows, [])).toBe(rows);
    });
});

// An active profile that owns dictionary state is authoritative: normalization
// rewrites every root preference row's enabled flag and priority from the
// profile's snapshot. Any writer that merges a newly discovered dictionary into
// the root rows WITHOUT also capturing it into that snapshot therefore persists
// it disabled and behind everything the profile already knew — and a disabled
// row is filtered out of every lookup, which is the reported "Yomu will not
// load local dictionary terms" with the dictionary plainly listed in Settings.
describe('profile-authoritative dictionary snapshot', () => {
    const profile = (dictionaries: { installed: string[]; enabled: string[]; order: string[] }) => ({
        ...DEFAULT_SETTINGS.languageProfiles[0],
        dictionaries,
    });

    function settingsWithProfileSnapshot(rows: DictionaryPreference[], snapshotNames: string[]): ReaderSettings {
        return {
            ...DEFAULT_SETTINGS,
            localDictionariesEnabled: true,
            dictionaryPreferences: rows,
            languageProfiles: [profile({ installed: snapshotNames, enabled: snapshotNames, order: snapshotNames })],
        };
    }

    it('force-disables a merged row the snapshot has never seen', () => {
        // Guards the defect itself: without capture, this is what persists.
        const known = preference({ name: 'JMdict [2026-01-01]', priority: 0 });
        const discovered = preference({ name: 'Jitendex.org [2026-06-06]', priority: 1 });
        const settings = settingsWithProfileSnapshot([known, discovered], [known.name]);
        const normalized = normalizeReaderSettings(settings);
        const row = normalized.dictionaryPreferences.find(item => item.name === discovered.name);
        expect(row).toMatchObject({ enabled: false });
    });

    it('keeps a captured row enabled and in place across a save/normalize round trip', () => {
        const known = preference({ name: 'JMdict [2026-01-01]', priority: 0 });
        const discovered = preference({ name: 'Jitendex.org [2026-06-06]', priority: 1 });
        const rows = [known, discovered];
        const captured = captureActiveLanguageProfileDictionaries(
            settingsWithProfileSnapshot(rows, [known.name]),
            rows,
        );
        const normalized = normalizeReaderSettings(captured);
        expect(normalized.dictionaryPreferences.map(row => ({ name: row.name, enabled: row.enabled })))
            .toEqual([
                { name: known.name, enabled: true },
                { name: discovered.name, enabled: true },
            ]);
    });

    it('preserves a learner-disabled row through capture', () => {
        // Capture must reflect the rows it is given, not re-enable everything.
        const rows = [
            preference({ name: 'JMdict [2026-01-01]', priority: 0 }),
            preference({ name: 'Kanjium Pitch', priority: 1, enabled: false, type: 'frequency' }),
        ];
        const captured = captureActiveLanguageProfileDictionaries(
            settingsWithProfileSnapshot(rows, ['JMdict [2026-01-01]']),
            rows,
        );
        const normalized = normalizeReaderSettings(captured);
        expect(normalized.dictionaryPreferences.map(row => ({ name: row.name, enabled: row.enabled })))
            .toEqual([
                { name: 'JMdict [2026-01-01]', enabled: true },
                { name: 'Kanjium Pitch', enabled: false },
            ]);
    });
});

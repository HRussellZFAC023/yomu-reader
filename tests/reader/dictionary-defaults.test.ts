import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, normalizeReaderSettings } from '../../src/reader/settings';
import { defaultDictionaryLookupLinks } from '../../src/reader/settings/dictionary';

// User directive (2026-07-11): JPDB, Jiten, and Bunpro dictionaries stay
// default-ON for new users — never an either/or pick. Users can still disable
// any of them in settings.
describe('dictionary source defaults for new users', () => {
    it('keeps the JPDB, Jiten, and Bunpro definition sources enabled by default', () => {
        expect(DEFAULT_SETTINGS.jpdbDefinitionsEnabled).toBe(true);
        expect(DEFAULT_SETTINGS.jitenDefinitionsEnabled).toBe(true);
        expect(DEFAULT_SETTINGS.bunproDefinitionsEnabled).toBe(true);
    });

    it('keeps them enabled when settings are normalized from an empty store', () => {
        const settings = normalizeReaderSettings({});
        expect(settings.jpdbDefinitionsEnabled).toBe(true);
        expect(settings.jitenDefinitionsEnabled).toBe(true);
        expect(settings.bunproDefinitionsEnabled).toBe(true);
    });

    it('keeps the JPDB, Jiten, and Bunpro lookup pills enabled in both default modes', () => {
        for (const mode of ['local', 'jpdb'] as const) {
            const links = defaultDictionaryLookupLinks(mode);
            for (const id of ['jpdb', 'jiten', 'bunpro']) {
                expect(links.find(link => link.id === id)?.enabled, `${mode}:${id}`).toBe(true);
            }
        }
    });
});

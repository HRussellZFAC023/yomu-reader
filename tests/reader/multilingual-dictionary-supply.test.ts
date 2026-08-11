import { describe, expect, it } from 'vitest';
import {
    FROZEN_DICTIONARY_CATALOG,
    SLICE1_LEARNER_LANGUAGES,
    dictionaryEntryDownload,
    parseDictionaryCatalogManifest,
} from '../../src/reader/dictionaries/catalog';
import { catalogBrowseLanguageSections } from '../../src/reader/dictionaries/catalog-browse';
import { recommendedDictionaryImportOptions } from '../../src/reader/dictionaries/recommended';
import { applyCatalogBrowseFilter } from '../../src/reader/settings/catalog-browse-filter';
import { renderSettingsForm } from '../../src/reader/settings/form';
import { DEFAULT_SETTINGS, normalizeReaderSettings } from '../../src/reader/settings';

/**
 * The catalogue's binding constraint was supply, not code: every row in it had
 * CJK headwords, so a learner of any other language opened Settings and found
 * nothing they could install for what they read. These are the languages the
 * Wiktionary-derived shelves now answer for.
 */
const SUPPLIED_LANGUAGES = SLICE1_LEARNER_LANGUAGES;

const sectionsByLanguage = new Map(
    catalogBrowseLanguageSections().map(section => [section.headwordLanguage, section]),
);

describe('multilingual dictionary supply', () => {
    it('gives every supplied language an installable terms dictionary on its own shelf', () => {
        for (const language of SUPPLIED_LANGUAGES) {
            const section = sectionsByLanguage.get(language);
            expect(section, language).toBeDefined();
            expect(section!.isTargetLanguage, language).toBe(false);

            const terms = section!.groups.find(group => group.category === 'terms')?.dictionaries ?? [];
            const definitionLanguages = new Set(terms.map(dictionary => dictionary.definitionLanguage));

            expect(definitionLanguages.size, language).toBeGreaterThan(0);
            expect(terms.every(dictionary => Boolean(dictionary.downloadUrl)), language).toBe(true);
            expect(terms.every(dictionary => Boolean(dictionary.sha256)), language).toBe(true);
            expect(terms.every(dictionary => dictionary.headwordLanguage === language), language).toBe(true);
        }
    });

    it('offers pronunciation data for every supplied language too', () => {
        for (const language of SUPPLIED_LANGUAGES) {
            const pronunciation = sectionsByLanguage.get(language)!.groups
                .find(group => group.category === 'pronunciation')?.dictionaries ?? [];

            expect(pronunciation.length, language).toBeGreaterThan(0);
            expect(pronunciation.every(dictionary => Boolean(dictionary.downloadUrl)), language).toBe(true);
        }
    });

    /**
     * WTY rows install from Yomu's immutable mirror after acquisition verified
     * their frozen upstream digest.
     */
    it('installs every WTY archive from the content-addressed mirror', () => {
        const wty = FROZEN_DICTIONARY_CATALOG.entries.filter(entry => entry.id.startsWith('wty-'));

        expect(wty).toHaveLength(1_440);
        for (const entry of wty) {
            const download = dictionaryEntryDownload(entry, FROZEN_DICTIONARY_CATALOG.objectsBaseUrl)!;

            expect(download.mirrored, entry.id).toBe(true);
            expect(download.sha256, entry.id).toMatch(/^[a-f0-9]{64}$/u);
            expect(download.url, entry.id).toContain('dictionaries.yomureader.com/objects/sha256/');
            expect(entry.source.projectUrl, entry.id).toBeTruthy();
        }

        const cards = catalogBrowseLanguageSections()
            .flatMap(section => section.groups)
            .flatMap(group => group.dictionaries)
            .filter(dictionary => dictionary.catalogDictionaryId?.startsWith('wty-'));

        expect(cards.length).toBe(wty.length);
        for (const card of cards) {
            expect(recommendedDictionaryImportOptions(card), card.id).toEqual({
                integrity: { sha256: card.sha256, bytes: card.bytes },
            });
        }
    });

    it('renders a working install button for a Spanish dictionary in the Settings dialog', () => {
        const profile = DEFAULT_SETTINGS.languageProfiles[0]!;
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(
            normalizeReaderSettings({
                ...DEFAULT_SETTINGS,
                interfaceLanguage: 'en',
                languageProfiles: [{ ...profile, outputLanguage: 'es' }],
                activeLanguageProfileId: profile.id,
            }),
            'https://jpdb.io/settings',
            undefined,
            { expandCatalogBrowse: true },
        );
        const browse = form.querySelector<HTMLElement>('[data-catalog-browse]')!;
        expect(browse.querySelector('[data-catalog-recommendation="wty-es-es"]')).toBeNull();
        expect(applyCatalogBrowseFilter(browse, 'wty-es-es')).toBeGreaterThan(0);
        const shelf = browse.querySelector<HTMLElement>('[data-catalog-browse-language="es"]');

        expect(shelf).not.toBeNull();
        // The panel is written in the learner's own language, so the shelf a
        // Spanish reader finds their dictionaries under is headed "español" —
        // never the bare tag.
        expect(shelf!.querySelector('[data-catalog-browse-language-title]')?.textContent).toBe('español');

        const card = [...shelf!.querySelectorAll<HTMLElement>('[data-catalog-recommendation]')]
            .find(item => item.dataset.catalogRecommendation === 'wty-es-es');

        expect(card).toBeDefined();
        expect(card!.dataset.headwordLanguage).toBe('es');
        expect(card!.dataset.definitionLanguage).toBe('es');
        expect(card!.querySelector('button[data-action="download-recommended-dictionary"]')).not.toBeNull();
    });

    it('refuses an upstream row that names no archive it can install', () => {
        const manifest = structuredClone(
            JSON.parse(JSON.stringify(FROZEN_DICTIONARY_CATALOG)),
        ) as { entries: Array<Record<string, unknown>> };
        const victim = manifest.entries.find(entry => String(entry.id).startsWith('wty-'));

        expect(victim).toBeDefined();
        victim!.distribution = { state: 'upstream', archive: { url: 'http://example.test/dict.zip' } };

        expect(() => parseDictionaryCatalogManifest(manifest)).toThrow(/must use HTTPS/);
    });
});

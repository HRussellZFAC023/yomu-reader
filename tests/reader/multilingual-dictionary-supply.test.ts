import { describe, expect, it } from 'vitest';
import {
    FROZEN_DICTIONARY_CATALOG,
    dictionaryEntryDownload,
    parseDictionaryCatalogManifest,
} from '../../src/reader/dictionaries/catalog';
import { catalogBrowseLanguageSections } from '../../src/reader/dictionaries/catalog-browse';
import { recommendedDictionaryImportOptions } from '../../src/reader/dictionaries/recommended';
import { renderSettingsForm } from '../../src/reader/settings/form';
import { DEFAULT_SETTINGS, normalizeReaderSettings } from '../../src/reader/settings';

/**
 * The catalogue's binding constraint was supply, not code: every row in it had
 * CJK headwords, so a learner of any other language opened Settings and found
 * nothing they could install for what they read. These are the languages the
 * Wiktionary-derived shelves now answer for.
 */
const SUPPLIED_LANGUAGES = ['es', 'fr', 'de', 'ru', 'ko', 'vi'] as const;

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

            // Both shelf slots a reader needs: definitions they can already
            // read, and the monolingual dictionary they graduate to.
            expect([...definitionLanguages].sort(), language).toEqual(['en', language].sort());
            expect(terms.every(dictionary => Boolean(dictionary.downloadUrl)), language).toBe(true);
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
     * An upstream row installs on the same terms as the hand-curated cards
     * above it: straight from the publishing project, with no integrity claim.
     * Claiming one would be a lie — the URL names the project's current build,
     * so any digest frozen here fails on its next rebuild.
     */
    it('installs upstream archives from their own project and promises no digest', () => {
        const upstream = FROZEN_DICTIONARY_CATALOG.entries.filter(entry => entry.distribution.state === 'upstream');

        expect(upstream.length).toBeGreaterThan(0);
        for (const entry of upstream) {
            const download = dictionaryEntryDownload(entry, FROZEN_DICTIONARY_CATALOG.objectsBaseUrl)!;

            expect(download.mirrored, entry.id).toBe(false);
            expect(download.sha256, entry.id).toBeUndefined();
            expect(download.url, entry.id).not.toContain('dictionaries.yomureader.com');
            expect(download.url.startsWith('https://'), entry.id).toBe(true);
            // Every unmirrored row still has somewhere to go for a reader who
            // wants to know what they are downloading.
            expect(entry.source.projectUrl, entry.id).toBeTruthy();
        }

        const cards = catalogBrowseLanguageSections()
            .flatMap(section => section.groups)
            .flatMap(group => group.dictionaries)
            .filter(dictionary => dictionary.downloadUrl && !dictionary.sha256);

        expect(cards.length).toBe(upstream.length);
        for (const card of cards) {
            expect(recommendedDictionaryImportOptions(card), card.id).toBeUndefined();
        }
    });

    it('renders a working install button for a Spanish dictionary in the Settings dialog', () => {
        const profile = DEFAULT_SETTINGS.languageProfiles[0]!;
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm(
            normalizeReaderSettings({
                ...DEFAULT_SETTINGS,
                interfaceLanguage: 'en',
                languageProfiles: [{ ...profile, learnerLanguage: 'es' }],
                activeLanguageProfileId: profile.id,
            }),
            'https://jpdb.io/settings',
        );
        const shelf = form.querySelector<HTMLElement>('[data-catalog-browse-language="es"]');

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
        const victim = manifest.entries.find(entry => (entry.distribution as { state: string }).state === 'upstream');

        expect(victim).toBeDefined();
        victim!.distribution = { state: 'upstream', archive: { url: 'http://example.test/dict.zip' } };

        expect(() => parseDictionaryCatalogManifest(manifest)).toThrow(/must use HTTPS/);
    });
});

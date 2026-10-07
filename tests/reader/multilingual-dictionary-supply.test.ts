import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    FROZEN_DICTIONARY_CATALOG,
    dictionaryEntryDownload,
    parseDictionaryCatalogManifest,
} from '../../src/reader/dictionaries/catalog';
import { catalogBrowseLanguageSections } from '../../src/reader/dictionaries/catalog-browse';
import { recommendedDictionaryImportOptions } from '../../src/reader/dictionaries/recommended';
import { applyCatalogBrowseFilter } from '../../src/reader/settings/catalog-browse-filter';
import { renderSettingsForm } from '../../src/reader/settings/form';
import { DEFAULT_SETTINGS } from '../../src/reader/settings';

const publishedManifest = () => JSON.parse(readFileSync('config/dictionaries/published/v1/catalog.json', 'utf8'));

describe('Japanese runtime and published dictionary supply', () => {
    it('offers installable Japanese terms while preserving non-English definitions and archive integrity', () => {
        const sections = catalogBrowseLanguageSections();
        expect(sections.map(section => section.headwordLanguage)).toEqual(['ja']);
        expect(sections[0]!.isTargetLanguage).toBe(true);
        const terms = sections[0]!.groups.find(group => group.category === 'terms')!.dictionaries;
        expect(terms.length).toBeGreaterThan(0);
        const definitionLanguages = new Set(terms.map(dictionary => dictionary.definitionLanguage));
        for (const language of ['ja', 'en', 'de', 'es']) expect(definitionLanguages.has(language), language).toBe(true);
        expect(terms.every(dictionary => dictionary.headwordLanguage === 'ja' && Boolean(dictionary.downloadUrl))).toBe(true);
        const mirrored = terms.filter(dictionary => dictionary.sha256);
        expect(mirrored.length).toBeGreaterThan(0);
        for (const card of mirrored) {
            expect(recommendedDictionaryImportOptions(card), card.id).toEqual({
                integrity: { sha256: card.sha256, bytes: card.bytes },
            });
        }
    });

    it('keeps Japanese pronunciation archives installable', () => {
        const pronunciation = catalogBrowseLanguageSections()[0]!.groups
            .find(group => group.category === 'pronunciation')!.dictionaries;
        expect(pronunciation.length).toBeGreaterThan(0);
        expect(pronunciation.every(dictionary => dictionary.headwordLanguage === 'ja' && Boolean(dictionary.downloadUrl))).toBe(true);
    });

    it('preserves the published WTY archive identities and licences outside the Japanese runtime', () => {
        // The public mirror retains its frozen archives. Runtime filtering must
        // not erase their source provenance or promise they are Japanese cards.
        const published = parseDictionaryCatalogManifest(publishedManifest());
        const wty = published.entries.filter(entry => entry.id.startsWith('wty-'));
        expect(wty).toHaveLength(1_440);
        for (const entry of wty) {
            const download = dictionaryEntryDownload(entry, published.objectsBaseUrl)!;
            expect(download.mirrored, entry.id).toBe(true);
            expect(download.sha256, entry.id).toMatch(/^[a-f0-9]{64}$/u);
            expect(download.url, entry.id).toContain(`objects/sha256/${download.sha256}.zip`);
            expect(entry.source.projectUrl, entry.id).toBeTruthy();
            expect(entry.source.url, entry.id).toMatch(/^https:\/\//u);
            expect(entry.license.spdx, entry.id).toBe('CC-BY-SA-4.0');
            expect(entry.license.attribution, entry.id).toContain('Wiktionary');
            expect(entry.license.redistribution, entry.id).toBe('allowed');
        }
        expect(FROZEN_DICTIONARY_CATALOG.entries.every(entry => entry.headwordLanguages.includes('ja'))).toBe(true);
    });

    it('renders an install button for Japanese headwords with Spanish definitions', () => {
        const form = document.createElement('form');
        form.innerHTML = renderSettingsForm({ ...DEFAULT_SETTINGS, interfaceLanguage: 'en' }, 'https://jpdb.io/settings', undefined, {
            expandCatalogBrowse: true,
        });
        const browse = form.querySelector<HTMLElement>('[data-catalog-browse]')!;
        expect(applyCatalogBrowseFilter(browse, 'jmdict-es')).toBeGreaterThan(0);
        const shelf = browse.querySelector<HTMLElement>('[data-catalog-browse-language="ja"]')!;
        const card = shelf.querySelector<HTMLElement>('[data-catalog-recommendation="jmdict-es"]')!;
        expect(card).not.toBeNull();
        expect(card.dataset.headwordLanguage).toBe('ja');
        expect(card.dataset.definitionLanguage).toBe('es');
        expect(card.querySelector('button[data-action="download-recommended-dictionary"]')).not.toBeNull();
        expect(browse.querySelector('[data-catalog-browse-language="es"]')).toBeNull();
    });

    it('refuses an upstream row without a safe install archive', () => {
        const manifest = publishedManifest();
        const victim = manifest.entries.find((entry: { id: string }) => entry.id === 'jmdict-en');
        expect(victim).toBeDefined();
        victim.distribution = { state: 'upstream', archive: { url: 'http://example.test/dict.zip' } };
        expect(() => parseDictionaryCatalogManifest(manifest)).toThrow(/must use HTTPS/);
    });
});

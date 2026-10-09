import { describe, expect, it } from 'vitest';

import {
    normalizeDexieTermMetaRow,
    normalizeDexieTermRow,
} from '../../../src/reader/dictionaries/yomitan/dexie-normalize';
import {
    normalizeZipTermMetaRow,
    normalizeZipTermRow,
} from '../../../src/reader/dictionaries/yomitan/zip-normalize';
import { JAPANESE_LEARNING_TARGET } from '../../../src/reader/languages/japanese';
import {
    normalizeGenericLookupText,
    normalizeImportedLookupMeta,
    normalizeImportedLookupTerm,
} from '../../../src/reader/languages/lookup-normalization';

describe('generic lookup normalization', () => {
    it('uses one canonical function at every dictionary import and query door', () => {
        const source = 'Cafe\u0301';
        const expected = normalizeGenericLookupText(source);
        const zip = normalizeZipTermRow(
            [source, source, '', '', 0, ['coffee shop'], 1, ''],
            'ZIP fixture',
        );
        const dexie = normalizeDexieTermRow({
            expression: source,
            reading: source,
            glossary: ['coffee shop'],
            dictionary: 'Dexie fixture',
        });
        const readerExport = normalizeImportedLookupTerm({
            expression: source,
            reading: source,
            glossary: ['coffee shop'],
            dictionary: 'Reader export fixture',
        });
        const zipMeta = normalizeZipTermMetaRow([source, 'freq', 1], 'ZIP fixture');
        const dexieMeta = normalizeDexieTermMetaRow({
            expression: source,
            mode: 'freq',
            data: 1,
            dictionary: 'Dexie fixture',
        });
        const readerExportMeta = normalizeImportedLookupMeta({
            expression: source,
            mode: 'freq',
            data: 1,
            dictionary: 'Reader export fixture',
        });

        expect(zip?.expression).toBe(expected);
        expect(zip?.reading).toBe(expected);
        expect(dexie?.expression).toBe(expected);
        expect(dexie?.reading).toBe(expected);
        expect(readerExport.expression).toBe(expected);
        expect(readerExport.reading).toBe(expected);
        expect(zipMeta?.expression).toBe(expected);
        expect(dexieMeta?.expression).toBe(expected);
        expect(readerExportMeta.expression).toBe(expected);
    });

    it('preserves Thai and Lao SARA AM instead of compatibility-decomposing it', () => {
        const thai = 'ทำ';
        const lao = 'ຄຳ';

        expect([...normalizeGenericLookupText(thai)]).toEqual([...thai]);
        expect([...normalizeGenericLookupText(lao)]).toEqual([...lao]);
        expect(normalizeGenericLookupText(thai)).toContain('\u0e33');
        expect(normalizeGenericLookupText(lao)).toContain('\u0eb3');
    });

    it('keeps Japanese kana and kanji byte-identical', () => {
        const text = 'かな漢字';
        const bytes = (value: string) => [...new TextEncoder().encode(value)];

        expect(bytes(normalizeGenericLookupText(text))).toEqual(bytes(text));
        expect(bytes(JAPANESE_LEARNING_TARGET.normalizeText(text))).toEqual(bytes(text));
        expect(bytes(JAPANESE_LEARNING_TARGET.lookupCandidates(text)[0]!.term)).toEqual(bytes(text));
    });
});

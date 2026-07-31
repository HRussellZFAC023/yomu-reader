import { afterEach, describe, expect, it } from 'vitest';

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
    resetActiveLearningTargetLanguage,
    setActiveLearningTargetLanguage,
} from '../../../src/reader/languages/active';
import { createLearningTargetModule } from '../../../src/reader/languages/module';
import {
    normalizeGenericLookupText,
    normalizeImportedLookupMeta,
    normalizeImportedLookupTerm,
} from '../../../src/reader/languages/lookup-normalization';
import { learningTargetModuleFor } from '../../../src/reader/languages/registry';
import { jpdbPointerLookupCandidates } from '../../../src/reader/lookup/pointer-text-lookup';

afterEach(() => {
    resetActiveLearningTargetLanguage();
});

function genericTarget(language: string) {
    return createLearningTargetModule({
        id: `lookup-correctness-${language}`,
        language,
        featureSemantics: {
            characterSystem: 'test',
            phoneticScripts: [],
            pronunciation: 'none',
            readingAnnotation: 'none',
        },
        detectsText: /\S/u,
    });
}

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

        expect(genericTarget('es').normalizeText(source)).toBe(expected);
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

describe('bounded generic lookup candidates', () => {
    it('orders the surface before its case fold and then target-data rewrites', () => {
        const spanish = learningTargetModuleFor('es')!;
        const candidates = spanish.lookupCandidates('Paellas');

        expect(candidates.slice(0, 3).map(candidate => candidate.term))
            .toEqual(['Paellas', 'paellas', 'paella']);
        expect(candidates[0]?.depth).toBe(0);
        expect(candidates[1]?.reasons).toEqual(['case fold']);
        expect(candidates[2]?.reasons).toEqual(['case fold', 'plural suffix']);
        expect(candidates.length).toBeLessThanOrEqual(12);
    });

    it('applies Arabic clitic rules as data and gives Han targets an exact dictionary sweep', () => {
        const arabic = learningTargetModuleFor('ar')!;
        expect(arabic.lookupCandidates('بالقطار').map(candidate => candidate.term))
            .toEqual(['بالقطار', 'قطار', 'القطار']);
        expect(arabic.lookupCandidates('أسرتها').map(candidate => candidate.term))
            .toEqual(['أسرتها', 'أسرة']);

        for (const language of ['zh', 'yue']) {
            const chinese = learningTargetModuleFor(language)!;
            expect(chinese.lookupStartsAtSegmentBoundary).toBe(false);
            expect(chinese.lookupSweepMode).toBe('left-to-right-longest-exact');
            expect(chinese.lookupRunSegments?.('我去，study 好𡃁').map(segment => segment.text))
                .toEqual(['我去', '好𡃁']);
            expect(chinese.lookupCandidates('我去').map(candidate => candidate.term)).toEqual(['我去']);
        }
    });

    it('enables a bounded subsegment sweep only for the Korean target', () => {
        expect(learningTargetModuleFor('ko')?.lookupStartsAtSegmentBoundary).toBe(false);
        expect(learningTargetModuleFor('es')?.lookupStartsAtSegmentBoundary).toBe(true);
        expect(learningTargetModuleFor('ru')?.lookupStartsAtSegmentBoundary).toBe(true);

        setActiveLearningTargetLanguage('ko');
        expect(jpdbPointerLookupCandidates('학생이', 0).map(candidate => candidate.term))
            .toEqual(['학생이', '학생']);
        expect(jpdbPointerLookupCandidates('학생이', 2).map(candidate => candidate.term))
            .toEqual(['학생이']);
        expect(jpdbPointerLookupCandidates('학생', 0).map(candidate => candidate.term))
            .toEqual(['학생']);
    });

    it('builds longest-first Han pointer candidates on code-point boundaries', () => {
        setActiveLearningTargetLanguage('yue');
        const candidates = jpdbPointerLookupCandidates('我鍾意𡃁', 1);

        expect(candidates[0]).toEqual({ term: '我鍾意𡃁', start: 0, end: 5 });
        expect(candidates).toContainEqual({ term: '鍾意', start: 1, end: 3 });
        expect(candidates.every(candidate => Array.from(candidate.term).every(character => {
            const codePoint = character.codePointAt(0) ?? 0;
            return codePoint < 0xd800 || codePoint > 0xdfff;
        }))).toBe(true);

        const supplementary = jpdbPointerLookupCandidates('我𡃁好', 2);
        expect(supplementary[0]).toEqual({ term: '我𡃁好', start: 0, end: 4 });
        expect(supplementary).toContainEqual({ term: '𡃁', start: 1, end: 3 });

        const longRun = '天地玄黃宇宙洪荒日月盈昃辰宿列張寒來';
        const exhaustive = jpdbPointerLookupCandidates(longRun, 1);
        expect(exhaustive.length).toBeGreaterThan(24);
        expect(exhaustive).toContainEqual({ term: '地玄', start: 1, end: 3 });
        expect(exhaustive).toContainEqual({ term: '地', start: 1, end: 2 });
    });
});

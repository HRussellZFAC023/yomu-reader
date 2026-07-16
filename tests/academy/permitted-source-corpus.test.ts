// @vitest-environment node
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
// @ts-expect-error Plain-JS corpus tooling is exercised directly.
import { resolveCorpusRoots, SOURCE_SCOPES } from '../../scripts/academy-source-pipeline/corpus/paths.mjs';
// @ts-expect-error Plain-JS corpus tooling is exercised directly.
import { validateCorpusOutputs } from '../../scripts/academy-source-pipeline/corpus/validate.mjs';
// @ts-expect-error Plain-JS corpus tooling is exercised directly.
import { parseVocabularyTable } from '../../scripts/academy-source-pipeline/corpus/vocabulary.mjs';

const ROOTS = resolveCorpusRoots();

describe('permitted source corpus', () => {
    it('is closed to the approved scopes and carries the full course beyond the N4 foundation', () => {
        const manifest = read(ROOTS.publicFiles.manifest);
        expect(manifest.sources.map((source: any) => source.id)).toEqual(SOURCE_SCOPES.map((source: any) => source.id));
        expect(manifest.policy.progressionOrder).toEqual([
            'moodle-raw',
            'japanese-minna',
            'japanese-genki',
            'japanese-library',
            'soya-research',
            'provided-stories',
        ]);
        expect(manifest.policy.advancedProgressionScopes).toEqual([
            'japanese-library',
            'soya-research',
            'provided-stories',
        ]);
        expect(manifest.policy.answerGate).toBe('after-attempt');
        expect(manifest.sources.filter((source: any) => source.sequenceAuthority !== null)
            .map((source: any) => source.id)).toEqual(manifest.policy.progressionOrder);
    });

    it('maps every lesson to Moodle chronology and declares every missing Minna/Genki anchor', () => {
        const crosswalk = read(ROOTS.publicFiles.curriculum);
        const lessonFiles = fs.readdirSync(ROOTS.lessonsRoot).filter(name => /^\d{3}-l[12]-l\d{2}\.json$/u.test(name));
        expect(crosswalk.lessons).toHaveLength(lessonFiles.length);
        expect(new Set(crosswalk.lessons.map((lesson: any) => lesson.lessonId)).size).toBe(lessonFiles.length);
        expect(crosswalk.lessons.map((lesson: any) => lesson.lessonOrder))
            .toEqual([...crosswalk.lessons.map((lesson: any) => lesson.lessonOrder)].sort((a, b) => a - b));
        for (const lesson of crosswalk.lessons) {
            expect(lesson.moodle?.sourceId, lesson.lessonId).toMatch(/^moodle-module:\d+$/u);
            expect(lesson.enrichmentPolicy).toBe('introduced-prerequisites-only');
            if (!lesson.minna) expect(lesson.gaps).toContain('missing-minna-prerequisite-anchor');
            if (!lesson.genki) expect(lesson.gaps).toContain('missing-genki-prerequisite-anchor');
            if (lesson.status !== 'anchored') expect(lesson.gaps.length).toBeGreaterThan(0);
        }

        const progressionGroups = [...new Set(crosswalk.lessons.map((lesson: any) => lesson.progressionGroup))];
        expect(progressionGroups).toEqual(['level-1', 'level-2-plus', 'level-3-2', 'level-3-plus']);
        for (const progressionGroup of progressionGroups) {
            const chronology = crosswalk.lessons
                .filter((lesson: any) => lesson.progressionGroup === progressionGroup)
                .map((lesson: any) => lesson.moodle.classOrder);
            expect(chronology).toEqual([...chronology].sort((a, b) => a - b));
        }
    });

    it('makes exact vocabulary order/readings/meanings/media a hard gate with honest gaps', () => {
        const parity = read(ROOTS.publicFiles.vocabulary);
        expect(parity.contract.comparedFields).toEqual(['surface', 'reading', 'meaning', 'order', 'media']);
        expect(parity.contract.sourceAnswerGate).toBe('after-attempt');
        for (const lesson of parity.lessons) {
            if (lesson.parityStatus === 'exact') {
                const source = lesson.sheets.find((sheet: any) => sheet.sourceId === lesson.matchedSourceId);
                expect(source?.orderedRowFingerprints, lesson.lessonId).toEqual(lesson.orderedLessonRowFingerprints);
                expect(lesson.gaps).toEqual([]);
            } else {
                expect(lesson.gaps.length, lesson.lessonId).toBeGreaterThan(0);
            }
            for (const sheet of lesson.sheets) {
                if (sheet.modelAnswerCount > 0) expect(sheet.answerGate).toBe('after-attempt');
                if (sheet.extractionStatus === 'complete') expect(sheet.completeRowCount).toBe(sheet.rowCount);
            }
        }
    });

    it('keeps all Soya answers gated and all non-anchor media enrichment-only', () => {
        const media = read(ROOTS.publicFiles.media);
        expect(media.reusePolicy.answerGate).toBe('after-attempt');
        expect(media.scopes.soya.rightsReviewRequired).toBe(media.scopes.soya.mappingCount);
        expect(media.scopes.soya.answerGated).toBeGreaterThan(0);
        expect(media.scopes.moodle.unresolvedCount).toBe(0);
    });

    it('passes the public privacy and consistency validator', () => {
        expect(validateCorpusOutputs(ROOTS)).toEqual([]);
    });
});

describe('vocabulary sheet text extraction', () => {
    it('preserves table order and distinguishes source-provided cells from blanks', () => {
        const text = [
            `${'No'.padEnd(5)}${'Words (with accent)'.padEnd(30)}${'Pronunciation'.padEnd(20)}Meaning`,
            `${'1'.padEnd(5)}${'\u304c\u304f\u305b\u3044'.padEnd(30)}${'gakusei'.padEnd(20)}student`,
            `${'2'.padEnd(5)}\u305b\u3093\u305b\u3044`,
            '\f',
        ].join('\n');
        const rows = parseVocabularyTable(text);
        expect(rows).toHaveLength(2);
        expect(rows.map((row: any) => row.order)).toEqual([1, 2]);
        expect(rows[0]).toMatchObject({
            surface: '\u304c\u304f\u305b\u3044',
            reading: 'gakusei',
            meaning: 'student',
            readingProvenance: 'source-provided',
            meaningProvenance: 'source-provided',
            answerGate: 'after-attempt',
        });
        expect(rows[1]).toMatchObject({
            surface: '\u305b\u3093\u305b\u3044',
            reading: null,
            meaning: null,
            readingProvenance: 'source-blank',
            meaningProvenance: 'source-blank',
            answerGate: null,
        });
    });
});

function read(filePath: string): any {
    return JSON.parse(fs.readFileSync(path.resolve(filePath), 'utf8'));
}

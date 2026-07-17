import { readFileSync } from 'node:fs';
import {
    PLAYABLE_SENSEI_VOCABULARY_LESSON_IDS,
    loadSenseiVocabularyPrerequisite,
    validateSenseiVocabularyLinkage,
} from '../../src/academy/content/lesson-vocabulary-prerequisite';
import {
    createLibraryVocabularySheetFromPackage,
    libraryStudyVocabulary,
    libraryVocabularyReviewSeeds,
} from '../../src/academy/content/library-vocabulary-sheet';
import { EXACT_LIBRARY_VOCABULARY_PACKAGE_IDS } from '../../src/academy/content/lesson-27-31-library-vocabulary';
import { ACADEMY_LESSON_CONTENT_REGISTRY } from '../../src/academy/content/lesson-content-registry';
import { committedAuthoredWeekFetcher } from './helpers/authored-week-package';

describe('Sensei vocabulary prerequisites', () => {
    it('catalogues Lesson 0 and every registered authored lesson without a second hand-maintained range', () => {
        const authoredLessonIds = ACADEMY_LESSON_CONTENT_REGISTRY.flatMap(registration =>
            registration.kind === 'authored-week' ? [`authored-week:${registration.packageId}`] : []);

        expect(PLAYABLE_SENSEI_VOCABULARY_LESSON_IDS).toEqual([
            'lesson:foundation-00',
            ...authoredLessonIds,
        ]);
    });

    it('maps a preserved teacher sheet only to one of its recorded Moodle source candidates', async () => {
        const prerequisite = await loadSenseiVocabularyPrerequisite('authored-week:l1-l01');

        expect(prerequisite.sheet).toMatchObject({ lessonId: 'l1-l01', sourceStatus: 'exact-source' });
        expect(prerequisite.evidence.status).toBe('gap-declared');
        expect(prerequisite.evidence.sourceSheets.map(source => source.sourceId)).toContain(prerequisite.sheet.sourceId);
        expect(prerequisite.evidence.gaps).toContain('source-sheet-extraction-incomplete');
    });

    it('keeps an absent Moodle sheet explicit instead of projecting new vocabulary', async () => {
        const registration = ACADEMY_LESSON_CONTENT_REGISTRY.find(candidate =>
            candidate.kind === 'authored-week' && candidate.packageId === 'l1-l11')!;
        const prerequisite = await loadSenseiVocabularyPrerequisite(
            'authored-week:l1-l11',
            committedAuthoredWeekFetcher(registration),
        );

        expect(prerequisite.sheet).toMatchObject({ lessonId: 'l1-l11', sourceStatus: 'not-provided', items: [] });
        expect(prerequisite.evidence).toMatchObject({
            status: 'gap-declared',
            sourceSheets: [],
            gaps: ['no-exact-source-vocabulary-sheet'],
        });
    });

    it.each([
        ['l2-l02', 14],
        ['l2-l03', 20],
        ['l2-l04', 29],
        ['l2-l05', 19],
        ['l2-l06', 35],
        ['l2-l07', 15],
        ['l2-l08', 18],
        ['l2-l09', 20],
    ] as const)('loads each delivered exact L2 prerequisite through %s', async (packageId, count) => {
        const registration = ACADEMY_LESSON_CONTENT_REGISTRY.find(candidate =>
            candidate.kind === 'authored-week' && candidate.packageId === packageId)!;
        const prerequisite = await loadSenseiVocabularyPrerequisite(
            `authored-week:${packageId}`,
            committedAuthoredWeekFetcher(registration),
        );

        expect(prerequisite.sheet).toMatchObject({ lessonId: packageId, sourceStatus: 'exact-source' });
        expect(prerequisite.sheet.items).toHaveLength(count);
        expect(prerequisite.evidence.sourceSheets.map(item => item.sourceId)).toContain(prerequisite.sheet.sourceId);
    });

    it('keeps every registered exact projection linked to package evidence and evidence-only SRS rows', () => {
        expect(EXACT_LIBRARY_VOCABULARY_PACKAGE_IDS).toEqual([
            'l2-l02', 'l2-l03', 'l2-l04', 'l2-l05', 'l2-l06', 'l2-l07', 'l2-l08', 'l2-l09', 'l2-l10', 'l2-l11',
        ]);
        for (const packageId of EXACT_LIBRARY_VOCABULARY_PACKAGE_IDS) {
            const registration = ACADEMY_LESSON_CONTENT_REGISTRY.find(candidate =>
                candidate.kind === 'authored-week' && candidate.packageId === packageId);
            expect(registration?.kind, packageId).toBe('authored-week');
            if (!registration || registration.kind !== 'authored-week') continue;
            const source = JSON.parse(readFileSync(
                `public/academy/content/lessons/${registration.filename}`,
                'utf8',
            )) as unknown;
            const sheet = createLibraryVocabularySheetFromPackage(source, packageId);
            const study = libraryStudyVocabulary(sheet);
            const seeds = libraryVocabularyReviewSeeds(sheet);
            const eligibleItems = sheet.items.filter(item => item.studyStatus !== 'quarantined-source-ambiguity'
                && item.studyStatus !== 'quarantined-source-gap');

            expect(sheet.sourceStatus, packageId).toBe('exact-source');
            expect(sheet.items.length, packageId).toBeGreaterThan(0);
            expect(new Set(sheet.items.map(item => item.source.id)).size, packageId).toBe(sheet.items.length);
            expect(sheet.items.every(item => item.source.id.startsWith(`${sheet.sourceId}:`)), packageId).toBe(true);
            expect(study, packageId).toHaveLength(eligibleItems.length);
            expect(seeds.map(seed => seed.sourceQuestionId), packageId)
                .toEqual(eligibleItems.map(item => item.source.id));
            expect(seeds.every(seed => seed.reason === 'new-learning' && seed.content.sentence === undefined), packageId)
                .toBe(true);
        }
    });

    it('rejects a delivered package whose exact vocabulary linkage is omitted', () => {
        expect(() => validateSenseiVocabularyLinkage('l2-l07', {
            id: 'l2-l07:no-exact-source-vocabulary',
            lessonId: 'l2-l07',
            title: 'L2 lesson 7 vocabulary',
            sourceId: 'academy:l2-l07:no-exact-source-vocabulary',
            sourceStatus: 'not-provided',
            items: [],
        }, [{
            sourceId: `moodle-vocabulary:future:${'a'.repeat(64)}`,
            payloadSha256: 'a'.repeat(64),
            extractionStatus: 'complete',
            rowCount: 1,
            completeRowCount: 1,
        }], [])).toThrow(/inside the delivered vocabulary frontier but has no exact Library projection/i);
    });

    it('records Lesson 0 as a Moodle-free prerequisite without inventing a source row', async () => {
        const prerequisite = await loadSenseiVocabularyPrerequisite('lesson:foundation-00');

        expect(prerequisite.sheet).toMatchObject({ sourceStatus: 'not-provided', items: [] });
        expect(prerequisite.evidence).toEqual({
            status: 'no-moodle-vocabulary-sheet',
            gaps: ['lesson-zero-has-no-moodle-vocabulary-sheet'],
            sourceSheets: [],
        });
    });
});

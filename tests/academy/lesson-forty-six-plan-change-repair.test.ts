import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createLessonFortySixPlanChangeRepairBeat } from '../../src/academy/content/lesson-forty-six-plan-change-repair';
import {
    createLibraryVocabularySheetFromPackage,
    libraryStudyVocabulary,
    libraryVocabularyReviewSeeds,
} from '../../src/academy/content/library-vocabulary-sheet';
import { loadReachableLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import { stateInspectionPlugin, type StateInspectionModel } from '../../src/academy/minigames/state-inspection';

function model(): StateInspectionModel {
    return createLessonFortySixPlanChangeRepairBeat().activity as StateInspectionModel;
}

function correctAnswers(activity: StateInspectionModel) {
    return activity.payload.rounds.map(round => ({ roundId: round.id, value: round.answerValue }));
}

function runtime() {
    return createActivityRuntime([stateInspectionPlugin]);
}

describe('Lesson 46 Sensei Chapter 31 plan-change repair', () => {
    it('pins the exact order, source pages, and all-source audio quarantine', () => {
        const activity = model();
        expect(runtime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            id: 'activity:l2-l21-sensei-plan-change-repair',
            responseKind: 'moodle-chapter-31-plan-change-repair',
            provenance: {
                packageId: 'l2-l21',
                packageOrder: 48,
                answerVisibility: 'after-attempt',
                moodle: {
                    moduleId: 8121277,
                    archiveId: 'archive-000010',
                    media: {
                        status: 'audio-members-quarantined-unpaired',
                        sourceAudioMembers: 6,
                        sourceAudioTracksDelivered: 0,
                    },
                },
                support: {
                    minna: { reference: 'Minna no Nihongo II · Lesson 31', reuse: 'chronology-and-scope-only' },
                    genki: { crosswalk: '≈ Genki II · Volitional form and intentions', reuse: 'sequence-only' },
                },
            },
        });
        expect(activity.provenance.moodle.sourceSheets).toHaveLength(9);
        expect(activity.provenance.moodle.media.audio).toBeUndefined();
        expect(activity.payload.rounds.map(round => round.interaction)).toEqual([
            'action-choice', 'state-select', 'typed-report', 'action-choice',
            'typed-report', 'state-select', 'action-choice', 'typed-report',
        ]);
        expect(activity.payload.rounds.every(round => round.hints.length === 3)).toBe(true);
    });

    it('grades the eight source loci and repairs only the missed row', () => {
        const activity = model();
        expect(runtime().evaluate(activity, { answers: correctAnswers(activity) }).result)
            .toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });

        const lapse = runtime().evaluate(activity, {
            answers: correctAnswers(activity).map((answer, index) => index === 4
                ? { ...answer, value: 'はい、9月から大学院に行くつもりです。' }
                : answer),
        });
        expect(lapse.result).toMatchObject({
            outcome: 'lapse', score: 7 / 8, errorTags: ['l2-l21-plan-change-repair-5'],
        });
        expect(lapse.reviewSeeds).toHaveLength(1);
        expect(lapse.reviewSeeds[0]?.sourceQuestionId).toContain(':pdf-p3:task-grammar:q5');
    });

    it('routes all printed vocabulary rows to Library and local study in source order', () => {
        const lessonPackage = JSON.parse(readFileSync(path.resolve('public/academy/content/lessons/048-l2-l21.json'), 'utf8')) as unknown;
        const sheet = createLibraryVocabularySheetFromPackage(lessonPackage, 'l2-l21');
        expect(sheet.sourceStatus).toBe('exact-source');
        expect(sheet.items).toHaveLength(24);
        expect(sheet.items[0]).toMatchObject({ expression: 'よてい（予定）', studyExpression: '予定', source: { page: 1, row: 1 } });
        expect(sheet.items[2]).toMatchObject({ sourceMeaning: 'Energy surcharge', fieldProvenance: { meaning: 'source-provided' } });
        expect(sheet.items[20]).toMatchObject({ expression: 'じつは 〜んです。（実は、〜んです。）', source: { page: 2, row: 22 } });
        expect(sheet.items[23]).toMatchObject({ studyExpression: '月に2、3回', source: { page: 2, row: 25 } });
        expect(libraryStudyVocabulary(sheet)).toHaveLength(24);
        expect(libraryVocabularyReviewSeeds(sheet)).toHaveLength(24);
    });

    it('is reachable as one runtime activity with all original pages before assessment', async () => {
        const chapter = await loadReachableLessonActivityChapter('l2-l21', { lookup: async () => null });
        expect(chapter?.lessonPackageId).toBe('l2-l21');
        expect(chapter?.canonicalEpisodeId).toBe('s1e07-no-spoilers');
        expect(chapter?.introduction.en).toContain('Henry');
        expect(chapter?.beats.map(beat => beat.activity.kind)).toEqual(['academy-state-inspection']);
    });

    it('pins mirrored source pages and offline delivery without precaching unverified audio', () => {
        const activity = model();
        for (const visual of activity.provenance.moodle.sourceSheets) {
            const filename = path.basename(visual.url);
            const source = readFileSync(path.resolve('public/academy/content/lessons/l2-l21', filename));
            const hosted = readFileSync(path.resolve('docs/public/academy/content/lessons/l2-l21', filename));
            expect(createHash('sha256').update(source).digest('hex')).toBe(visual.sha256);
            expect(hosted).toEqual(source);
        }
        const sourcePackage = readFileSync(path.resolve('public/academy/content/lessons/048-l2-l21.json'));
        expect(readFileSync(path.resolve('docs/public/academy/content/lessons/048-l2-l21.json'))).toEqual(sourcePackage);
        const ledger = JSON.parse(readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json'), 'utf8')) as {
            worksheetDigitisation: { additionalSlices: Array<Record<string, unknown>> };
        };
        expect(ledger.worksheetDigitisation.additionalSlices.find(slice => slice.lessonId === 'l2-l21')).toMatchObject({
            sourcePackage: { sha256: '8f0468b15ecc934fa007cd19d7dd1a6e40d31fc0545b0e671a07adcc48c6ed4c' },
            audio: { sourceAudioMembers: 6, sourceAudioTracksDelivered: 0 },
            claims: { worksheetPagesRendered: 9, sourceVocabularyRowsProjected: 24, sourceLociAssessed: 8 },
            offline: { precache: expect.not.arrayContaining([expect.stringMatching(/\.mp3$/u)]) },
        });
        expect(readFileSync(path.resolve('docs/public/academy/content/RESOURCE-LEDGER.json')))
            .toEqual(readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json')));
        for (const workerPath of ['public/academy/sw.js', 'docs/public/academy/sw.js']) {
            const worker = readFileSync(path.resolve(workerPath), 'utf8');
            expect(worker).toContain("'/academy/content/lessons/048-l2-l21.json'");
            activity.provenance.moodle.sourceSheets
                .forEach(visual => expect(worker).toContain(`'${visual.url}'`));
            expect(worker).not.toMatch(/l2-l21\/[^']+\.mp3/u);
        }
    });
});

import { describe, expect, it } from 'vitest';

import {
    academyContentGraph,
    academyResponseKinds,
    assertValidAcademyContentGraph,
    placementsForUnit,
    resolvedAssetsForActivity,
    unitsForActivity,
    validateAcademyContentGraph,
    type AcademyContentGraph,
    type ActivityAssetUse,
} from '../../src/academy/content';

describe('Yomu Academy content graph', () => {
    it('ships a valid, rights-cleared vertical-slice catalogue', () => {
        expect(validateAcademyContentGraph(academyContentGraph)).toEqual([]);
        expect(() => assertValidAcademyContentGraph(academyContentGraph)).not.toThrow();
        expect(academyContentGraph.assets.every(asset => (
            asset.rights.status === 'cleared'
            && asset.rights.rightsHolder === 'Yomu Academy'
            && asset.rights.permittedUses.length > 0
        ))).toBe(true);
    });

    it('covers every UI response kind and keeps the transcript optional after a listening attempt', () => {
        const responseKinds = new Set(
            academyContentGraph.activities.flatMap(activity => activity.responses.map(response => response.kind)),
        );
        expect(Array.from(responseKinds).sort()).toEqual([...academyResponseKinds].sort());

        const listeningAssets = resolvedAssetsForActivity(academyContentGraph, 'activity-listen-weekend-plan');
        expect(listeningAssets).toEqual(expect.arrayContaining([
            expect.objectContaining({
                use: expect.objectContaining({ role: 'audio', availability: 'always' }),
                asset: expect.objectContaining({ kind: 'audio' }),
            }),
            expect.objectContaining({
                use: expect.objectContaining({ role: 'transcript', availability: 'optional-after-first-attempt' }),
                asset: expect.objectContaining({
                    kind: 'transcript',
                    transcriptOfAssetId: 'asset-weekend-plan-audio',
                }),
            }),
        ]));
    });

    it('places the same activities in the lesson and reusable skill strands', () => {
        const lessonPlacements = placementsForUnit(academyContentGraph, 'unit-level-3-plus-lesson-09');
        expect(lessonPlacements.map(item => item.activity.id)).toEqual([
            'activity-listen-weekend-plan',
            'activity-nara-suggestion',
            'activity-polite-negative-question',
            'activity-purpose-youni',
            'activity-solo-dialogue-adaptation',
            'activity-write-shared-plan',
            'activity-kanji-7',
            'activity-lesson-reflection',
        ]);

        expect(unitsForActivity(academyContentGraph, 'activity-listen-weekend-plan').map(unit => unit.id)).toEqual([
            'unit-level-3-plus-lesson-09',
            'unit-strand-listening-interaction',
        ]);
    });

    it('keeps the seven requested kanji in a structured reference asset', () => {
        const reference = academyContentGraph.assets.find(asset => asset.id === 'asset-kanji-7-reference');
        expect(reference?.kind).toBe('kanji-reference');
        if (!reference || reference.kind !== 'kanji-reference') throw new Error('Kanji reference asset is missing.');

        expect(reference.entries.map(entry => entry.character)).toEqual(['肉', '料', '理', '野', '半', '大', '小']);
    });

    it('uses the requested ありませんか negative-question pattern in the lesson dialogue and controlled practice', () => {
        const variant = academyContentGraph.conceptVariants.find(item => item.id === 'variant-arimasenka-polite-question');
        const transcript = academyContentGraph.assets.find(asset => asset.id === 'asset-weekend-plan-transcript');
        const activity = academyContentGraph.activities.find(item => item.id === 'activity-polite-negative-question');

        expect(variant?.form).toBe('noun + は ありませんか');
        expect(transcript?.kind).toBe('transcript');
        expect(transcript?.kind === 'transcript' && transcript.body).toContain('野菜の料理はありませんか。');
        expect(activity?.responses.find(response => response.kind === 'short-text')).toMatchObject({
            grading: { kind: 'exact', acceptedAnswers: ['野菜の料理はありませんか。', '野菜の料理はありませんか'] },
        });
    });

    it('contains the complete original Level 3+ Lesson 9 vertical slice', () => {
        const lesson = academyContentGraph.curriculumUnits.find(unit => unit.id === 'unit-level-3-plus-lesson-09');
        const activityIds = new Set(academyContentGraph.activities.map(activity => activity.id));
        const variantIds = new Set(academyContentGraph.conceptVariants.map(variant => variant.id));
        const writingActivity = academyContentGraph.activities.find(activity => activity.id === 'activity-write-shared-plan');

        expect(lesson?.alignments?.map(alignment => alignment.reference)).toEqual([
            'UCL Level 3+ Lesson 9',
            'Minna 35-36',
            'Genki 22-23',
        ]);
        for (const variantId of [
            'variant-nara-suggestion',
            'variant-youni-enabling-purpose',
            'variant-nai-youni-preventing-purpose',
        ] as const) {
            expect(variantIds.has(variantId)).toBe(true);
        }
        for (const activityId of [
            'activity-listen-weekend-plan',
            'activity-solo-dialogue-adaptation',
            'activity-write-shared-plan',
            'activity-kanji-7',
        ] as const) {
            expect(activityIds.has(activityId)).toBe(true);
        }
        expect(writingActivity?.responses.find(response => response.kind === 'long-text')).toMatchObject({
            modelAssetId: 'asset-weekend-plan-writing-model',
            rubricAssetId: 'asset-weekend-plan-writing-rubric',
            reviewMode: 'self-review',
        });
    });

    it('reports broken asset links, response answers, and duplicate placements', () => {
        const missingReference: ActivityAssetUse = {
            assetId: 'asset-not-in-catalogue',
            role: 'reference',
            availability: 'always',
        };
        const invalidGraph: AcademyContentGraph = {
            ...academyContentGraph,
            activities: academyContentGraph.activities.map(activity => {
                if (activity.id !== 'activity-listen-weekend-plan') return activity;
                return {
                    ...activity,
                    assetUses: [...activity.assetUses, missingReference],
                    responses: activity.responses.map(response => (
                        response.kind === 'select-one'
                            ? { ...response, correctOptionIds: ['missing-option'] }
                            : response
                    )),
                };
            }),
            placements: [
                ...academyContentGraph.placements,
                {
                    ...academyContentGraph.placements[0],
                    id: 'placement-duplicate-lesson-position',
                    activityId: 'activity-lesson-reflection',
                },
            ],
        };

        const issues = validateAcademyContentGraph(invalidGraph);
        expect(issues).toEqual(expect.arrayContaining([
            expect.objectContaining({
                code: 'unknown-reference',
                path: expect.stringContaining('assetUses'),
            }),
            expect.objectContaining({
                code: 'unknown-reference',
                path: expect.stringContaining('correctOptionIds'),
            }),
            expect.objectContaining({
                code: 'duplicate-placement',
                path: expect.stringContaining('placements'),
            }),
        ]));
        expect(() => assertValidAcademyContentGraph(invalidGraph)).toThrow('Invalid Yomu Academy content graph');
    });
});

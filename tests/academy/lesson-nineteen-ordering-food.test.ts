import path from 'node:path';
import { createLessonNineteenOrderingFoodBeat } from '../../src/academy/content/lesson-nineteen-ordering-food';
import { loadLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { createAcademyActivityRuntime, type SentenceBuilderModel } from '../../src/academy/minigames';
import { filesHaveSameContent, sha256File } from './helpers/hash-memo';

function model(): SentenceBuilderModel {
    return createLessonNineteenOrderingFoodBeat().activity as SentenceBuilderModel;
}

describe('Lesson 19 Moodle ordering-food source slice', () => {
    it('delivers the exact Chapter 11-2 model line with Moodle-first provenance and support-only references', () => {
        const activity = model();
        expect(createAcademyActivityRuntime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            id: 'activity:l1-l19-moodle-ordering-food',
            kind: 'academy-sentence-builder',
            sourceQuestionId: 'moodle:6223185:chapter-11-2-ordering-food:p2:dialogue:drink-order',
            payload: {
                sourceSentence: 'なまビールをふたつください。',
                correctOrder: ['drink', 'object', 'quantity', 'request'],
                source: {
                    payloadSha256: 'e316f2b99ea18663277b112f99680efee75a9dfe60d5ef5e00246e4498e27d6b',
                    relativePath: 'Handouts/Chapter 11-2 ordering food.pdf',
                    lineLocus: { start: 15, end: 16 },
                    rights: 'moodle-teaching-material',
                    reuse: 'verbatim-rendered-teaching-sentence',
                },
                mapping: {
                    moodleModuleId: 6223185,
                    curriculum: expect.arrayContaining([
                        expect.stringMatching(/^Moodle /),
                        expect.stringMatching(/^Minna /),
                        expect.stringMatching(/^Genki /),
                    ]),
                },
            },
        });
    });

    it('grades only the source order and writes one source-grounded review seed', () => {
        const runtime = createAcademyActivityRuntime();
        const passed = runtime.evaluate(model(), { order: ['drink', 'object', 'quantity', 'request'] });
        expect(passed.result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        expect(passed.reviewSeeds).toEqual([expect.objectContaining({
            id: 'review:l1-l19:moodle-food-order',
            sourceQuestionId: 'moodle:6223185:chapter-11-2-ordering-food:p2:dialogue:drink-order',
            content: expect.objectContaining({ expression: 'なまビールをふたつください。' }),
        })]);

        const reversed = runtime.evaluate(model(), { order: ['request', 'quantity', 'object', 'drink'] });
        expect(reversed.result).toMatchObject({ outcome: 'lapse', score: 0, errorTags: ['l1-l19-food-order-word-order'] });
    });

    it('ships byte-verified source image and Moodle MP3s in both public trees', () => {
        const assets = [
            ['moodle-chapter-11-2-ordering-food-page-2.png', '8bac804fa76d47a526f2b6d270a2492e656d72c2990ae1e67b7de2878883246a'],
            ['moodle-43-a-43.mp3', '75b031947b395f44f614a544897b2c4f8d5cca0885b8b1a525360dd07cdf0372'],
            ['moodle-44-a-44.mp3', 'b076fb0e90d9e1b2cdfe7caab6687b22b0eb354c3ee1b0b2b498154c084979bd'],
        ] as const;
        for (const [filename, sha256] of assets) {
            const publicAsset = path.resolve('public/academy/content/lessons/l1-l19', filename);
            const docsAsset = path.resolve('docs/public/academy/content/lessons/l1-l19', filename);
            expect(sha256File(publicAsset)).toBe(sha256);
            expect(filesHaveSameContent(docsAsset, publicAsset)).toBe(true);
        }
    });

    it('places the Moodle-first order activity in the established menu story', async () => {
        const chapter = await loadLessonActivityChapter('l1-l19', { lookup: async () => null });
        expect(chapter).toMatchObject({
            lessonPackageId: 'l1-l19',
            canonicalEpisodeId: 's1e08-menu-without-pictures',
            host: { id: 'shin' },
            beats: [
                { id: 'moodle-ordering-food', activity: { kind: 'academy-sentence-builder' } },
                { id: 'moodle-listening-grid', activity: { kind: 'academy-moodle-listening-grid' } },
            ],
        });
    });
});

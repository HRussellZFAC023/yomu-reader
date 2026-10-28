import { createMegaPackLessonOneBeats } from '../../src/academy/content/mega-pack-lesson-one';
import { loadLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import type { KanjiWritingService } from '../../src/academy/integration/yomu-bridge';
import { createAcademyActivityRuntime } from '../../src/academy/minigames';
import type { SentenceBuilderModel } from '../../src/academy/minigames/sentence-builder';

describe('Mega Pack Lesson 1 playable slice', () => {
    it('maps every verbatim Genki sentence to Academy week, curriculum, skill, and JLPT', () => {
        const beats = createMegaPackLessonOneBeats();
        expect(beats).toHaveLength(2);
        for (const beat of beats) {
            const activity = beat.activity as SentenceBuilderModel;
            expect(createAcademyActivityRuntime().validate(activity)).toEqual([]);
            expect(activity.payload.source).toMatchObject({
                relativePath: 'lessons/lesson-1/workbook-5/index.html',
                payloadSha256: 'b909643450ead83af08d8dd22f717f9d320b165e5accf790514a31212d155451',
                rights: 'permitted-mit',
            });
            expect(activity.payload.mapping).toMatchObject({
                academyWeek: 'l1-l01',
                moodleModuleId: 5777762,
                jlpt: 'N5',
                skills: ['grammar', 'reading', 'sentence-construction'],
            });
            expect(activity.payload.correctOrder.map(id =>
                activity.payload.tokens.find(token => token.id === id)!.label).join(''),
            ).toBe(activity.payload.sourceSentence);
        }
        expect((beats[0].activity as SentenceBuilderModel).payload.source.lineLocus).toEqual({ start: 83, end: 84 });
        expect((beats[1].activity as SentenceBuilderModel).payload.source.lineLocus).toEqual({ start: 88, end: 89 });
    });

    it('keeps the Genki exercises after the Moodle greeting worksheet and before the class activity', async () => {
        const chapter = await loadLessonActivityChapter('l1-l01', {
            lookup: async () => null,
        } satisfies KanjiWritingService);
        expect(chapter?.beats.map(beat => beat.activity.kind)).toEqual([
            'academy-greeting-worksheet',
            'academy-sentence-builder',
            'academy-sentence-builder',
            'academy-class-simulator',
        ]);
        expect(chapter?.beats.slice(1, 3).map(beat => beat.activity.sourceQuestionId)).toEqual([
            'genki-2e:l1-l01:workbook-5:ogawa-japanese',
            'genki-2e:l1-l01:workbook-5:takeda-teacher',
        ]);
    });
});

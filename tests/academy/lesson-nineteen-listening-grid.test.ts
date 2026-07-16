import { createLessonNineteenListeningGridBeat } from '../../src/academy/content/lesson-nineteen-listening-grid';
import { loadLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import {
    createAcademyActivityRuntime,
    moodleListeningGridPlugin,
    type MoodleListeningGridModel,
} from '../../src/academy/minigames';

function model(): MoodleListeningGridModel {
    return createLessonNineteenListeningGridBeat().activity as MoodleListeningGridModel;
}

function response(activity = model(), incorrect = false) {
    return {
        values: activity.payload.tracks.flatMap(track => track.tasks.flatMap(task => task.fields.map(field => ({
            taskId: task.id,
            fieldId: field.id,
            value: incorrect && task.id === 'a44-cars' && field.id === 'total' ? '5' : field.answer,
        })))),
    };
}

afterEach(() => document.body.replaceChildren());

describe('Lesson 19 exact Moodle listening grids', () => {
    it('binds only the five A-43/A-44 worksheet grids to byte-verified audio', () => {
        const activity = model();
        expect(createAcademyActivityRuntime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            kind: 'academy-moodle-listening-grid',
            answerSupport: { id: 'academy-assessed-v1' },
            provenance: {
                packageId: 'l1-l19',
                answerVisibility: 'after-attempt',
                moodle: {
                    moduleId: 6223185,
                    handout: { payloadSha256: '797c858bc8070541ec31bae8e631ac03d7c3a28a3409602f331020e1192002e8' },
                },
            },
        });
        expect(activity.payload.tracks.map(track => [track.id, track.audio.payloadSha256, track.audio.url])).toEqual([
            ['a43', '75b031947b395f44f614a544897b2c4f8d5cca0885b8b1a525360dd07cdf0372', '/academy/content/listening/media/academy-listening-75b031947b395f44.mp3'],
            ['a44', 'b076fb0e90d9e1b2cdfe7caab6687b22b0eb354c3ee1b0b2b498154c084979bd', '/academy/content/listening/media/academy-listening-b076fb0e90d9e1b2.mp3'],
        ]);
        expect(activity.payload.tracks.flatMap(track => track.tasks).map(task => task.sourceQuestionId)).toEqual([
            'l1-l19/ex-l19-a43-order-1',
            'l1-l19/ex-l19-a43-order-2',
            'l1-l19/ex-l19-a44-family-total',
            'l1-l19/ex-l19-a44-trip-total',
            'l1-l19/ex-l19-a44-car-total',
        ]);
    });

    it('grades every exact blank and creates repair only for the missed source grid', () => {
        const runtime = createAcademyActivityRuntime();
        const passed = runtime.evaluate(model(), response());
        expect(passed.result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        expect(passed.reviewSeeds).toHaveLength(5);

        const lapsed = runtime.evaluate(model(), response(model(), true));
        expect(lapsed.result).toMatchObject({ outcome: 'lapse', score: 0, errorTags: ['l1-l19-listening-total-cars'] });
        expect(lapsed.reviewSeeds).toEqual([expect.objectContaining({
            sourceQuestionId: 'l1-l19/ex-l19-a44-car-total',
            reason: 'repair',
        })]);
    });

    it('keeps transcript and values out of the DOM until an attempt is submitted', async () => {
        const runtime = createAcademyActivityRuntime();
        const host = document.createElement('main');
        document.body.append(host);
        const activity = model();
        const controller = moodleListeningGridPlugin.render(activity, {
            language: 'en', replace(view) { host.replaceChildren(view); }, announce() {},
        }, async submitted => runtime.evaluate(activity, submitted));

        expect(host.querySelector('[data-listening-support]')).toBeNull();
        expect(host.textContent).not.toContain('いいえ、ジュースは二つです。');

        host.querySelector<HTMLFormElement>('form')!.requestSubmit();
        await vi.waitFor(() => expect(host.querySelector('[data-listening-support]')).not.toBeNull());

        expect(host.textContent).toContain('いいえ、ジュースは二つです。');
        expect([...host.querySelectorAll('.academy-moodle-listening-grid-answers')].map(node => node.textContent).join('')).toContain('11');
        controller.dispose();
    });

    it('adds the listening grid beside the existing Level 19 food-order beat', async () => {
        const chapter = await loadLessonActivityChapter('l1-l19', { lookup: async () => null });
        expect(chapter?.beats.map(beat => beat.id)).toEqual(['moodle-ordering-food', 'moodle-listening-grid']);
    });
});

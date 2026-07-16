import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createLessonThirtyB25DiaryListeningBeat } from '../../src/academy/content/lesson-thirty-b25-diary-listening';
import { loadLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { createAcademyActivityRuntime, type DiaryListeningClozeModel, type DiaryListeningClozeResponse } from '../../src/academy/minigames';

function model(): DiaryListeningClozeModel { return createLessonThirtyB25DiaryListeningBeat().activity as DiaryListeningClozeModel; }
function perfectResponse(): DiaryListeningClozeResponse {
    return { values: model().payload.tasks.flatMap(task => task.fields.map(field => ({ taskId: task.id, fieldId: field.id, value: field.answer }))) };
}

afterEach(() => document.body.replaceChildren());

describe('Lesson 30 Sensei B-25 picture-diary listening', () => {
    it('pins one exact worksheet locus, byte-verified B-25, and three source-order diary items', () => {
        const activity = model();
        expect(createAcademyActivityRuntime().validate(activity)).toEqual([]);
        expect(activity.provenance).toMatchObject({
            packageId: 'l2-l05',
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: 6974651,
                worksheet: {
                    payloadSha256: 'a671cfd9822df09775a5e7834f0bd70a222d9d86e4ab0134f1fba6f08ba43edd',
                    page: 1,
                    sha256: 'f14322b70639277f686d7ebffec147e04fa99687e21b61795d2a3d4fb9cce975',
                },
                audio: {
                    payloadSha256: '2e5d1ee1e18a31b72e826670a3f6aec1c0f513a6e2f05b654e04b199ad4939f3',
                    locator: 'academy/content/moodle/audio/l2-l05-b25.mp3',
                    url: '/academy/content/listening/media/academy-listening-2e5d1ee1e18a31b7.mp3',
                    durationSeconds: 89.453333,
                },
            },
        });
        expect(activity.payload.tasks.map(task => [task.sourceOrder, task.sourceQuestionId, task.fields.map(field => field.answer)])).toEqual([
            [1, expect.stringContaining(':b25-diary:item-1'), ['飲んだ', '散歩した']],
            [2, expect.stringContaining(':b25-diary:item-2'), ['カレーだった', 'からかった']],
            [3, expect.stringContaining(':b25-diary:item-3'), ['行きたかった']],
        ]);
        expect(activity.payload.transcript).toContainEqual({ speaker: '１・けん', text: '（赤ちゃんの声）' });
    });

    it('grades all five exact Japanese blanks and repairs only the missed diary item', () => {
        const activity = model();
        const runtime = createAcademyActivityRuntime();
        expect(runtime.evaluate(activity, perfectResponse()).result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        const response = perfectResponse();
        const lapse: DiaryListeningClozeResponse = {
            values: response.values.map(value => value.taskId === 'dinner' && value.fieldId === 'taste' ? { ...value, value: 'おいしかった' } : value),
        };
        const evaluation = runtime.evaluate(activity, lapse);
        expect(evaluation.result).toMatchObject({ outcome: 'lapse', score: 2 / 3, errorTags: ['l2-l05-b25-dinner'] });
        expect(evaluation.reviewSeeds.map(seed => seed.sourceQuestionId)).toEqual([
            'moodle:6974651:a671cfd9822df09775a5e7834f0bd70a222d9d86e4ab0134f1fba6f08ba43edd:pdf-p1:b25-diary:item-2',
        ]);
        expect(() => runtime.evaluate(activity, { values: [] })).toThrow('Every exact B-25 blank');
    });

    it('reveals neither transcript nor answers before an attempt, then reveals both', async () => {
        const host = document.createElement('main');
        const onEvaluation = vi.fn();
        const runtime = createAcademyActivityRuntime();
        const controller = runtime.mount(model(), { replace(view) { host.replaceChildren(view); }, announce() {} }, onEvaluation);
        document.body.append(host);

        expect(host.querySelector('[data-listening-support]')).toBeNull();
        expect(host.textContent).not.toContain('カレーだった');
        expect(host.textContent).not.toContain('きょうはね、カレーよ');
        expect(host.querySelector('img')?.getAttribute('src')).toBe('/academy/content/lessons/l2-l05/moodle-chapter-20-listening-page-1.png');
        expect(host.querySelector('audio')?.getAttribute('src')).toBe('/academy/content/listening/media/academy-listening-2e5d1ee1e18a31b7.mp3');
        expect([...host.querySelectorAll<HTMLInputElement>('input')]).toHaveLength(5);
        expect([...host.querySelectorAll<HTMLInputElement>('input')].every(input => input.inputMode === 'text' && input.lang === 'ja')).toBe(true);

        perfectResponse().values.forEach(value => {
            const input = host.querySelector<HTMLInputElement>(`input[name$=":${value.taskId}:${value.fieldId}"]`)!;
            input.value = value.value;
        });
        host.querySelector<HTMLFormElement>('form')!.requestSubmit();
        await vi.waitFor(() => expect(onEvaluation).toHaveBeenCalledOnce());
        await vi.waitFor(() => expect(host.querySelector('[data-listening-support]')).not.toBeNull());
        expect(host.textContent).toContain('カレーだった');
        expect(host.textContent).toContain('きょうはね、カレーよ');
        controller.dispose();
    });

    it('keeps the exact offline bytes and adds B-25 after the existing B-24 beat', async () => {
        const central = path.resolve('public/academy/content/listening/media/academy-listening-2e5d1ee1e18a31b7.mp3');
        expect(createHash('sha256').update(readFileSync(central)).digest('hex')).toBe('2e5d1ee1e18a31b72e826670a3f6aec1c0f513a6e2f05b654e04b199ad4939f3');
        const chapter = await loadLessonActivityChapter('l2-l05', { lookup: async () => null });
        expect(chapter?.beats.map(beat => beat.id)).toEqual(['sensei-b24-listening-hinge', 'sensei-b25-diary-listening', 'sensei-minna-069-conversation']);
        const ledger = JSON.parse(readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json'), 'utf8')) as {
            worksheetDigitisation: { additionalSlices: Array<{ lessonId: string; audio: { status: string }; claims: Record<string, number> }> };
        };
        expect(ledger.worksheetDigitisation.additionalSlices.find(slice => slice.lessonId === 'l2-l05')).toMatchObject({
            audio: { status: 'original-moodle-b24-b25-and-minna-069-paired-and-reviewed' },
            claims: { sourceAudioClozePromptsDelivered: 3, sourceAudioClozeBlanksDelivered: 5, originalAudioTracksDelivered: 3 },
        });
        expect(readFileSync(path.resolve('public/academy/sw.js'), 'utf8')).toContain("'/academy/content/listening/media/academy-listening-2e5d1ee1e18a31b7.mp3'");
    });
});

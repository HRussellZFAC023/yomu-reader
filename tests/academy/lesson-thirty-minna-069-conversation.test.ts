import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createLessonThirtyMinna069ConversationBeat } from '../../src/academy/content/lesson-thirty-minna-069-conversation';
import { loadLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { createAcademyActivityRuntime, type ConversationListeningCheckModel, type ConversationListeningCheckResponse } from '../../src/academy/minigames';

function model(): ConversationListeningCheckModel {
    return createLessonThirtyMinna069ConversationBeat().activity as ConversationListeningCheckModel;
}

function perfectResponse(): ConversationListeningCheckResponse {
    return { answers: model().payload.tasks.map(task => ({ taskId: task.id, value: task.answer })) };
}

afterEach(() => document.body.replaceChildren());

describe('Lesson 30 exact Minna 069 conversation listening', () => {
    it('pins the exact worksheet, teacher script, audio bytes, and five source questions', () => {
        const activity = model();
        expect(createAcademyActivityRuntime().validate(activity)).toEqual([]);
        expect(activity.provenance).toMatchObject({
            packageId: 'l2-l05',
            answerVisibility: 'after-attempt',
            moodle: {
                moduleId: 6974651,
                worksheet: {
                    payloadSha256: '01d6d86ad59a1a4fc30891dcd14f2916387552c35802a025a289e622a5478280',
                    sha256: 'ad13d146b8e82ad147870d90a1e47c0f8a43b96ac306e6bc869410dc616f2cb1',
                },
                support: {
                    payloadSha256: '359fa7af358cf5bfbe429806569cc3d885369d23d03546809a65eec2dbdb63e8',
                    role: 'reviewed-transcript',
                },
                audio: {
                    payloadSha256: 'f423d074fd31d9efaf34b359c71fde870abc71b850379af3a526758cee9b5d30',
                    locator: 'academy/content/minna/audio/l2-l05-minna-069.mp3',
                    url: '/academy/content/listening/media/academy-listening-f423d074fd31d9ef.mp3',
                    durationSeconds: 32.1045,
                },
            },
        });
        expect(activity.payload.tasks.map(task => [task.sourceOrder, task.sourceQuestionId, task.answer])).toEqual([
            [1, expect.stringContaining(':minna069-conversation:item-1'), 'いいえ。帰りたいけど、帰りません。'],
            [2, expect.stringContaining(':minna069-conversation:item-2'), 'いいえ、ありません。'],
            [3, expect.stringContaining(':minna069-conversation:item-3'), 'はい、一緒に登りたいです。'],
            [4, expect.stringContaining(':minna069-conversation:item-4'), '８月の初めごろです。'],
            [5, expect.stringContaining(':minna069-conversation:item-5'), 'いろいろ調べて、また電話します。'],
        ]);
        expect(activity.payload.transcript).toContainEqual({ speaker: '小林', text: 'じゃ、いろいろ 調べて、また 電話するよ。' });
    });

    it('grades all five choices and repairs only missed source questions', () => {
        const activity = model();
        const runtime = createAcademyActivityRuntime();
        expect(runtime.evaluate(activity, perfectResponse()).result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        const lapse: ConversationListeningCheckResponse = {
            answers: perfectResponse().answers.map(answer => answer.taskId === 'when' ? { ...answer, value: '７月の終わりごろです。' } : answer),
        };
        const evaluation = runtime.evaluate(activity, lapse);
        expect(evaluation.result).toMatchObject({ outcome: 'lapse', score: 0.8, errorTags: ['l2-l05-minna069-when'] });
        expect(evaluation.reviewSeeds.map(seed => seed.sourceQuestionId)).toEqual([
            'moodle:6974651:01d6d86ad59a1a4fc30891dcd14f2916387552c35802a025a289e622a5478280:pdf-p1:minna069-conversation:item-4',
        ]);
        expect(() => runtime.evaluate(activity, { answers: [] })).toThrow('Every exact Minna conversation question');
    });

    it('reveals neither transcript nor answers before commitment, then reveals both', async () => {
        const host = document.createElement('main');
        const onEvaluation = vi.fn();
        const controller = createAcademyActivityRuntime().mount(model(), {
            replace(view) { host.replaceChildren(view); },
            announce() {},
        }, onEvaluation);
        document.body.append(host);

        expect(host.querySelector('[data-listening-support]')).toBeNull();
        expect(host.querySelector('.academy-conversation-listening-check-answers')).toBeNull();
        for (const task of model().payload.tasks) expect(host.textContent).not.toContain(task.answer);
        for (const line of model().payload.transcript) expect(host.textContent).not.toContain(line.text);
        expect(host.querySelector('img')?.getAttribute('src')).toBe('/academy/content/lessons/l2-l05/moodle-chapter-20-conversation-page-1.png');
        expect(host.querySelector('audio')?.getAttribute('src')).toBe('/academy/content/listening/media/academy-listening-f423d074fd31d9ef.mp3');
        expect(host.querySelectorAll<HTMLInputElement>('input[type="text"]')).toHaveLength(5);

        perfectResponse().answers.forEach(answer => {
            host.querySelector<HTMLInputElement>(`input[name$=":${answer.taskId}"]`)!.value = answer.value;
        });
        host.querySelector<HTMLFormElement>('form')!.requestSubmit();
        await vi.waitFor(() => expect(onEvaluation).toHaveBeenCalledOnce());
        await vi.waitFor(() => expect(host.querySelector('[data-listening-support]')).not.toBeNull());
        expect(host.textContent).toContain('帰りたいけど、帰りません');
        expect(host.textContent).toContain('また 電話するよ');
        controller.dispose();
    });

    it('mirrors exact bytes offline and leaves B-26/B-27 quarantined', async () => {
        const assets = [
            ['public/academy/content/listening/media/academy-listening-f423d074fd31d9ef.mp3', 'f423d074fd31d9efaf34b359c71fde870abc71b850379af3a526758cee9b5d30'],
            ['public/academy/content/lessons/l2-l05/moodle-chapter-20-conversation-page-1.png', 'ad13d146b8e82ad147870d90a1e47c0f8a43b96ac306e6bc869410dc616f2cb1'],
        ] as const;
        for (const [file, digest] of assets) {
            const publicBytes = readFileSync(path.resolve(file));
            const docsBytes = readFileSync(path.resolve('docs/public', file.replace(/^public\//u, '')));
            expect(createHash('sha256').update(publicBytes).digest('hex')).toBe(digest);
            expect(docsBytes).toEqual(publicBytes);
        }
        const chapter = await loadLessonActivityChapter('l2-l05', { lookup: async () => null });
        expect(chapter?.beats.map(beat => beat.id)).toEqual(['sensei-b24-listening-hinge', 'sensei-b25-diary-listening', 'sensei-minna-069-conversation']);
        const lesson = JSON.parse(readFileSync('public/academy/content/lessons/032-l2-l05.json', 'utf8'));
        expect(lesson.sourceQuestionNormalization.quarantine.unresolvedMedia.map((media: { payloadSha256: string }) => media.payloadSha256)).toEqual([
            '7467e6195f851cc97a70a72878a855fadf982ba093b6577132ffc8f0031a86c2',
            '70090e8bccce580f3262fccf58cd67b6c4ae1e81d8e67c9ee81d49d2d452afc8',
        ]);
        const worker = readFileSync('public/academy/sw.js', 'utf8');
        for (const asset of assets.map(([file]) => `/${file.replace(/^public\//u, '')}`)) expect(worker).toContain(`'${asset}'`);
    });
});

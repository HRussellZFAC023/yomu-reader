import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createLessonThirtyFourMinna075ConversationBeat } from '../../src/academy/content/lesson-thirty-four-minna-075-conversation';
import { loadLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { createAcademyActivityRuntime, type ConversationListeningCheckModel, type ConversationListeningCheckResponse } from '../../src/academy/minigames';

const AUDIO_SHA256 = '360cef1923b1e824f22ec5ebdaf18896e87846c8c9019f25228da60675c79834';
const WORKSHEET_SHA256 = 'c52c08bd27d6ed7d2c29eafbecaca8b83e14a4a0d35dc9139f4003c6718bb2f0';

function model(): ConversationListeningCheckModel {
    return createLessonThirtyFourMinna075ConversationBeat().activity as ConversationListeningCheckModel;
}

function perfectResponse(activity = model()): ConversationListeningCheckResponse {
    return { answers: activity.payload.tasks.map(task => ({ taskId: task.id, value: task.answer })) };
}

afterEach(() => document.body.replaceChildren());

describe('Lesson 34 exact Minna 075 room-search listening', () => {
    it('pins the Moodle worksheet, official-identical recording, four questions, and reviewed transcript', () => {
        const activity = model();
        expect(createAcademyActivityRuntime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            id: 'activity:l2-l09-sensei-minna-075-conversation',
            responseKind: 'minna-075-conversation-comprehension',
            provenance: {
                packageId: 'l2-l09',
                answerVisibility: 'after-attempt',
                moodle: {
                    moduleId: 6974657,
                    worksheet: {
                        payloadSha256: WORKSHEET_SHA256,
                        sha256: 'b28a169dac64414fd20e35345e9f5f4e8f5d4261c1a78b396f35542de9c12105',
                    },
                    support: { payloadSha256: WORKSHEET_SHA256, role: 'worksheet-and-audio-review' },
                    audio: {
                        payloadSha256: AUDIO_SHA256,
                        locator: 'academy/content/minna/audio/l2-l09-minna-075.mp3',
                        url: '/academy/content/listening/media/academy-listening-360cef1923b1e824.mp3',
                        durationSeconds: 43.232667,
                    },
                    answerKeyBasis: 'source-worksheet-questions-and-audio-reviewed-exact-minna-075-recording',
                },
            },
        });
        expect(activity.payload.tasks.map(task => [task.sourceOrder, task.prompt, task.answer])).toEqual([
            [1, 'ワンさんは どんな 部屋を 探していますか。', '家賃は８万円ぐらいで、駅から遠くない所です。'],
            [2, 'この 部屋の 家賃は いくらですか。', '８万３千円です。'],
            [3, '駅から 何分 かかりますか。', '１０分です。'],
            [4, '今日 この 部屋を 見る ことが できますか。', 'はい、できます。'],
        ]);
        expect(activity.payload.transcript).toHaveLength(13);
        expect(activity.payload.transcript).toContainEqual({ speaker: '不動産屋', text: '駅から １０分で、家賃は ８万３千円です。' });
    });

    it('grades reviewed Japanese forms deterministically and seeds only missed questions for repair', () => {
        const activity = model();
        const runtime = createAcademyActivityRuntime();
        expect(runtime.evaluate(activity, {
            answers: [
                { taskId: 'room-request', value: '８万円ぐらいで、駅から遠くない所です。' },
                { taskId: 'rent', value: '83000円' },
                { taskId: 'station-time', value: '10分' },
                { taskId: 'view-today', value: 'ええ。' },
            ],
        }).result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        const evaluation = runtime.evaluate(activity, {
            answers: perfectResponse(activity).answers.map(answer => (
                answer.taskId === 'rent' ? { ...answer, value: '８万円です。' } : answer
            )),
        });
        expect(evaluation.result).toMatchObject({ outcome: 'lapse', score: 0.75, errorTags: ['l2-l09-minna075-rent'] });
        expect(evaluation.reviewSeeds.map(seed => seed.sourceQuestionId)).toEqual([
            `moodle:6974657:${WORKSHEET_SHA256}:pdf-p1:minna075-conversation:item-2`,
        ]);
        expect(() => runtime.evaluate(activity, { answers: [] })).toThrow('Every exact Minna conversation question');
    });

    it('conceals answers and transcript until commitment, then exposes repair support', async () => {
        const activity = model();
        const host = document.createElement('main');
        const onEvaluation = vi.fn();
        const controller = createAcademyActivityRuntime().mount(activity, {
            replace(view) { host.replaceChildren(view); },
            announce() {},
        }, onEvaluation);
        document.body.append(host);

        expect(host.querySelector('[data-listening-support]')).toBeNull();
        activity.payload.tasks.forEach(task => expect(host.textContent).not.toContain(task.answer));
        activity.payload.transcript.forEach(line => expect(host.textContent).not.toContain(line.text));
        expect(host.querySelector('img')?.getAttribute('src')).toBe('/academy/content/lessons/l2-l09/moodle-chapter-22-conversation-page-1.png');
        expect(host.querySelector('audio')?.getAttribute('src')).toBe('/academy/content/listening/media/academy-listening-360cef1923b1e824.mp3');
        expect(host.querySelectorAll<HTMLInputElement>('input[type="text"]')).toHaveLength(4);

        perfectResponse(activity).answers.forEach(answer => {
            host.querySelector<HTMLInputElement>(`input[name$=":${answer.taskId}"]`)!.value = answer.value;
        });
        host.querySelector<HTMLFormElement>('form')!.requestSubmit();
        await vi.waitFor(() => expect(onEvaluation).toHaveBeenCalledOnce());
        await vi.waitFor(() => expect(host.querySelector('[data-listening-support]')).not.toBeNull());
        expect(host.textContent).toContain('駅から １０分で、家賃は ８万３千円です');
        expect(host.textContent).toContain('はい、できます');
        controller.dispose();
    });

    it('mirrors exact source bytes, binds every task offline, and records only this reviewed claim', async () => {
        const assets = [
            ['public/academy/content/listening/media/academy-listening-360cef1923b1e824.mp3', AUDIO_SHA256],
            ['public/academy/content/lessons/l2-l09/moodle-chapter-22-conversation-page-1.png', 'b28a169dac64414fd20e35345e9f5f4e8f5d4261c1a78b396f35542de9c12105'],
        ] as const;
        for (const [file, digest] of assets) {
            const publicBytes = readFileSync(path.resolve(file));
            const docsBytes = readFileSync(path.resolve('docs/public', file.replace(/^public\//u, '')));
            expect(createHash('sha256').update(publicBytes).digest('hex')).toBe(digest);
            expect(docsBytes).toEqual(publicBytes);
        }
        expect(createHash('sha256').update(readFileSync(path.resolve(
            'artifacts/yomu-academy/source-pipeline/payloads/360cef1923b1e824f22ec5ebdaf18896e87846c8c9019f25228da60675c79834',
        ))).digest('hex')).toBe(AUDIO_SHA256);

        const bindings = JSON.parse(readFileSync('public/academy/content/listening/listening-task-bindings.v1.json', 'utf8'));
        const minna075 = bindings.entries.filter((entry: { packageId: string; sourceQuestionId: string }) => (
            entry.packageId === 'l2-l09' && entry.sourceQuestionId.includes(':minna075-conversation:')
        ));
        expect(minna075).toHaveLength(4);
        expect(minna075.every((entry: { delivery: { status: string }; verification: { answerGate: string }; learnerContract: { grading: string } }) => (
            entry.delivery.status === 'packaged-static'
            && entry.verification.answerGate === 'after-attempt'
            && entry.learnerContract.grading === 'deterministic'
        ))).toBe(true);

        const chapter = await loadLessonActivityChapter('l2-l09', { lookup: async () => null });
        expect(chapter?.beats.map(beat => beat.id)).toEqual(['sensei-particle-signal-mixer', 'sensei-minna-075-conversation']);
        const workers = [readFileSync('public/academy/sw.js', 'utf8'), readFileSync('docs/public/academy/sw.js', 'utf8')];
        workers.forEach(worker => assets.forEach(([file]) => expect(worker).toContain(`'/${file.replace(/^public\//u, '')}'`)));

        const ledger = JSON.parse(readFileSync('public/academy/content/RESOURCE-LEDGER.json', 'utf8'));
        expect(ledger.worksheetDigitisation.additionalSlices.find((slice: { lessonId: string }) => slice.lessonId === 'l2-l09')).toMatchObject({
            audio: { sourceAudioTracksDelivered: 1, deliveredPayloadSha256: [AUDIO_SHA256] },
            claims: { sourceAudioConversationPromptsDelivered: 4, answerVisibility: 'after-attempt' },
        });
    });
});

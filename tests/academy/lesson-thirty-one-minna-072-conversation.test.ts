import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createLessonThirtyOneMinna072ConversationBeat } from '../../src/academy/content/lesson-thirty-one-minna-072-conversation';
import { loadLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { createAcademyActivityRuntime, type ConversationListeningCheckModel, type ConversationListeningCheckResponse } from '../../src/academy/minigames';
import { filesHaveSameContent, sha256File } from './helpers/hash-memo';

function model(): ConversationListeningCheckModel {
    return createLessonThirtyOneMinna072ConversationBeat().activity as ConversationListeningCheckModel;
}

function perfectResponse(activity = model()): ConversationListeningCheckResponse {
    return { answers: activity.payload.tasks.map(task => ({ taskId: task.id, value: task.answer })) };
}

afterEach(() => document.body.replaceChildren());

describe('Lesson 31 exact Minna 072 conversation listening', () => {
    it('pins the exact worksheet, support role, recording, four questions, and reviewed transcript', () => {
        const activity = model();
        expect(createAcademyActivityRuntime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            id: 'activity:l2-l06-sensei-minna-072-conversation',
            responseKind: 'minna-072-conversation-comprehension',
            provenance: {
                packageId: 'l2-l06',
                answerVisibility: 'after-attempt',
                moodle: {
                    moduleId: 6974652,
                    worksheet: {
                        payloadSha256: 'bb2cea0ce9563e15e78f64cc0e8bf6cbdcfde589e458cdced63ddd11cea005a0',
                        sha256: '7ea8c8ebe329839341b3fbcea6f374bdde694295e44e19fca698db5dc04207ad',
                    },
                    support: {
                        payloadSha256: 'b49f9fb9498eebf9f709262116b64c2488a6d11f7aaf866e798ca5e0d95e548f',
                        role: 'vocabulary-and-grammar-support',
                    },
                    audio: {
                        payloadSha256: '71cd9a20f51a1c49a53f02fc6080914e6cf229662710f55bd8f9f2dac269d98c',
                        locator: 'academy/content/minna/audio/l2-l06-minna-072.mp3',
                        url: '/academy/content/listening/media/academy-listening-71cd9a20f51a1c49.mp3',
                        durationSeconds: 50.18125,
                    },
                    answerKeyBasis: 'source-worksheet-questions-and-audio-reviewed-exact-minna-072-recording',
                },
            },
        });
        expect(activity.payload.tasks.map(task => [task.sourceOrder, task.prompt, task.answer])).toEqual([
            [1, 'サントスさんと 松本さんは 何を 飲みますか。', 'ビールです。'],
            [2, '今晩 何時から、どこと どこの サッカーの 試合が ありますか。', '今晩10時から、日本とブラジルです。'],
            [3, 'サントスさんは、どちらの 国が 勝つと 思っていますか。', 'ブラジルです。'],
            [4, '松本さんは、最近 日本の サッカーは どうなったと 思っていますか。', '最近、日本のサッカーも強くなりました。'],
        ]);
        expect(activity.payload.transcript).toHaveLength(13);
        expect(activity.payload.transcript).toContainEqual({ speaker: '松本', text: '今晩10時から日本とブラジルのサッカーの試合がありますね。' });
    });

    it('grades all four typed answers and seeds only the missed source question for repair', () => {
        const activity = model();
        const runtime = createAcademyActivityRuntime();
        expect(runtime.evaluate(activity, perfectResponse(activity)).result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        const lapse = perfectResponse(activity);
        const evaluation = runtime.evaluate(activity, {
            answers: lapse.answers.map(answer => answer.taskId === 'winner' ? { ...answer, value: '日本です。' } : answer),
        });
        expect(evaluation.result).toMatchObject({ outcome: 'lapse', score: 0.75, errorTags: ['l2-l06-minna072-winner'] });
        expect(evaluation.reviewSeeds.map(seed => seed.sourceQuestionId)).toEqual([
            'moodle:6974652:bb2cea0ce9563e15e78f64cc0e8bf6cbdcfde589e458cdced63ddd11cea005a0:pdf-p1:minna072-conversation:item-3',
        ]);
        expect(() => runtime.evaluate(activity, { answers: [] })).toThrow('Every exact Minna conversation question');
    });

    it('shows the exact page before audio and typed fields, then reveals transcript and answers after commitment', async () => {
        const activity = model();
        const host = document.createElement('main');
        const onEvaluation = vi.fn();
        const controller = createAcademyActivityRuntime().mount(activity, {
            replace(view) { host.replaceChildren(view); },
            announce() {},
        }, onEvaluation);
        document.body.append(host);

        const source = host.querySelector<HTMLElement>('[data-lesson-phase="source-reference"]')!;
        const audio = host.querySelector<HTMLAudioElement>('audio')!;
        const form = host.querySelector<HTMLFormElement>('form')!;
        expect(source.compareDocumentPosition(audio) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(audio.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(source.querySelector('img')?.getAttribute('src')).toBe('/academy/content/lessons/l2-l06/moodle-chapter-21-conversation-page-1.png');
        expect(audio.getAttribute('src')).toBe('/academy/content/listening/media/academy-listening-71cd9a20f51a1c49.mp3');
        expect(audio.getAttribute('aria-label')).toBe('Minna no Nihongo track 072');
        expect(form.querySelectorAll('input[type="text"]')).toHaveLength(4);
        expect(host.querySelector('[data-listening-support]')).toBeNull();
        activity.payload.transcript.forEach(line => expect(host.textContent).not.toContain(line.text));
        activity.payload.tasks.forEach(task => expect(host.textContent).not.toContain(task.answer));

        perfectResponse(activity).answers.forEach(answer => {
            form.querySelector<HTMLInputElement>(`input[name$=":${answer.taskId}"]`)!.value = answer.value;
        });
        form.requestSubmit();
        await vi.waitFor(() => expect(onEvaluation).toHaveBeenCalledOnce());
        await vi.waitFor(() => expect(host.querySelector('[data-listening-support]')).not.toBeNull());
        expect(host.textContent).toContain('もちろんブラジルですよ');
        expect(host.textContent).toContain('最近、日本のサッカーも強くなりました');
        controller.dispose();
    });

    it('mirrors exact bytes, precaches offline assets, and retains only unrelated track 060 in quarantine', async () => {
        const assets = [
            ['public/academy/content/listening/media/academy-listening-71cd9a20f51a1c49.mp3', '71cd9a20f51a1c49a53f02fc6080914e6cf229662710f55bd8f9f2dac269d98c'],
            ['public/academy/content/lessons/l2-l06/moodle-chapter-21-conversation-page-1.png', '7ea8c8ebe329839341b3fbcea6f374bdde694295e44e19fca698db5dc04207ad'],
        ] as const;
        for (const [file, digest] of assets) {
            const publicBytes = readFileSync(path.resolve(file));
            const docsBytes = readFileSync(path.resolve('docs/public', file.replace(/^public\//u, '')));
            expect(sha256File(path.resolve(file))).toBe(digest);
            expect(docsBytes).toEqual(publicBytes);
        }
        const lessonBytes = readFileSync('public/academy/content/lessons/033-l2-l06.json');
        expect(sha256File('public/academy/content/lessons/033-l2-l06.json')).toBe('f511c246dd35cc6b13486b0b96bb048bfe23a41cca5a61f5272f9bb0ca6a5b38');
        expect(filesHaveSameContent('docs/public/academy/content/lessons/033-l2-l06.json', 'public/academy/content/lessons/033-l2-l06.json')).toBe(true);
        const lesson = JSON.parse(lessonBytes.toString('utf8'));
        expect(lesson.sourceQuestionNormalization.sourceQuestions).toHaveLength(4);
        expect(lesson.sourceQuestionNormalization.quarantine.unresolvedMedia).toEqual([
            expect.objectContaining({
                payloadSha256: '33590efb13483efbd91916542bbb888acf5e4ecca2a3ae35636da4a4b1843200',
                reason: expect.stringContaining('Lesson 17'),
            }),
        ]);
        const chapter = await loadLessonActivityChapter('l2-l06', { lookup: async () => null });
        expect(chapter?.beats.map(beat => beat.id)).toEqual(['sensei-opinion-transformation', 'sensei-minna-072-conversation']);
        const workers = [readFileSync('public/academy/sw.js', 'utf8'), readFileSync('docs/public/academy/sw.js', 'utf8')];
        workers.forEach(worker => assets.forEach(([file]) => expect(worker).toContain(`'/${file.replace(/^public\//u, '')}'`)));
        const ledger = JSON.parse(readFileSync('public/academy/content/RESOURCE-LEDGER.json', 'utf8'));
        expect(ledger.worksheetDigitisation.additionalSlices.find((slice: { lessonId: string }) => slice.lessonId === 'l2-l06')).toMatchObject({
            sourcePackage: { sha256: 'f511c246dd35cc6b13486b0b96bb048bfe23a41cca5a61f5272f9bb0ca6a5b38' },
            audio: { sourceAudioTracksDelivered: 1, deliveredPayloadSha256: ['71cd9a20f51a1c49a53f02fc6080914e6cf229662710f55bd8f9f2dac269d98c'] },
            claims: { sourceAudioConversationPromptsDelivered: 4, answerVisibility: 'after-attempt' },
        });
    });
});

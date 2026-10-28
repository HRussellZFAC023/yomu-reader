import { readFileSync } from 'node:fs';
import { createLessonThirtyFiveMinna077ListeningBeat } from '../../src/academy/content/lesson-thirty-five-minna-077-listening';
import { loadLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import {
    createAcademyActivityRuntime,
    type MinnaTrueFalseListeningModel,
    type MinnaTrueFalseListeningResponse,
} from '../../src/academy/minigames';
import { verifyCommittedPackagedListening } from './helpers/source-verification';

const AUDIO_SHA256 = '3be2ca818292e685f08d8acf55b54b10b9c2853bcc5d9cb246b91abbdb158339';
const AUDIO_LOCATOR = 'academy/content/minna/audio/l2-l10-minna-077.mp3';
const AUDIO_URL = '/academy/content/listening/media/academy-listening-3be2ca818292e685.mp3';
const SOURCE_PREFIX = `moodle:6974659:${AUDIO_SHA256}:audio:minna077-mondai-2`;

function model(): MinnaTrueFalseListeningModel {
    return createLessonThirtyFiveMinna077ListeningBeat().activity as MinnaTrueFalseListeningModel;
}

function perfectResponse(activity = model()): MinnaTrueFalseListeningResponse {
    return { answers: activity.payload.tasks.map(task => ({ taskId: task.id, mark: task.correctMark })) };
}

afterEach(() => document.body.replaceChildren());

describe('Lesson 35 exact Minna 077 Mondai 2 listening', () => {
    it('pins the official-identical recording, five embedded statements, marks, and reviewed transcript', () => {
        const activity = model();
        expect(createAcademyActivityRuntime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            id: 'activity:l2-l10-sensei-minna-077-true-false',
            responseKind: 'minna-077-mondai-2-true-false',
            provenance: {
                packageId: 'l2-l10',
                packageOrder: 37,
                answerVisibility: 'after-attempt',
                moodle: {
                    moduleId: 6974659,
                    audio: {
                        payloadSha256: AUDIO_SHA256,
                        locator: 'academy/content/minna/audio/l2-l10-minna-077.mp3',
                        url: AUDIO_URL,
                        durationSeconds: 96.235125,
                    },
                    sourceTask: 'recording-embedded-mondai-2',
                    answerKeyBasis: 'reviewed-original-audio-statements-and-dialogues',
                },
            },
        });
        expect(activity.payload.tasks.map(task => [task.sourceOrder, task.statement, task.correctMark])).toEqual([
            [1, '女の人は チョコレートケーキを 作りました。', 'circle'],
            [2, '傘は 階段の 後ろに 置かなければ なりません。', 'circle'],
            [3, 'ミラーさんは 今、新聞を 読んでいます。', 'cross'],
            [4, '男の人は あした 子どもと 遊びますから、テニスに 行きません。', 'circle'],
            [5, 'カリナさんは 髪が 短いです。', 'circle'],
        ]);
        expect(activity.payload.tasks.map(task => task.sourceQuestionId)).toEqual(
            Array.from({ length: 5 }, (_, index) => `${SOURCE_PREFIX}:item-${index + 1}`),
        );
        expect(activity.payload.transcript).toHaveLength(26);
        expect(activity.payload.transcript).toContainEqual({
            item: 5,
            speaker: 'A',
            text: '佐藤さんの 後ろに いる 髪が 短い 人です。',
        });
    });

    it('grades deterministically and schedules only the missed statement for repair', () => {
        const activity = model();
        const runtime = createAcademyActivityRuntime();
        expect(runtime.evaluate(activity, perfectResponse(activity)).result)
            .toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });

        const evaluation = runtime.evaluate(activity, {
            answers: perfectResponse(activity).answers.map(answer => answer.taskId === 'miller-reading-paper'
                ? { ...answer, mark: 'circle' }
                : answer),
        });
        expect(evaluation.result).toMatchObject({
            outcome: 'lapse',
            score: 0.8,
            errorTags: ['l2-l10-minna077-miller-reading-paper'],
        });
        expect(evaluation.reviewSeeds.map(seed => seed.sourceQuestionId)).toEqual([`${SOURCE_PREFIX}:item-3`]);
        expect(() => runtime.evaluate(activity, { answers: [] })).toThrow('Every exact Minna 077 statement');
    });

    it('conceals statements and transcript until commitment, then keeps a fresh revisit concealed', async () => {
        const activity = model();
        const host = document.createElement('main');
        const onEvaluation = vi.fn();
        const runtime = createAcademyActivityRuntime();
        const controller = runtime.mount(activity, {
            language: 'en',
            replace(view) { host.replaceChildren(view); },
            announce() {},
        }, onEvaluation);
        document.body.append(host);

        expect(host.querySelector('audio')?.getAttribute('src')).toBe(AUDIO_URL);
        expect(host.querySelectorAll('input[type="radio"]')).toHaveLength(10);
        expect(host.querySelector('[data-listening-support]')).toBeNull();
        activity.payload.tasks.forEach(task => expect(host.textContent).not.toContain(task.statement));
        activity.payload.transcript.forEach(line => expect(host.textContent).not.toContain(line.text));

        perfectResponse(activity).answers.map(answer => answer.taskId === 'miller-reading-paper'
            ? { ...answer, mark: 'circle' as const }
            : answer).forEach(answer => {
            host.querySelector<HTMLInputElement>(
                `input[name="${activity.id}:${answer.taskId}"][value="${answer.mark}"]`,
            )!.checked = true;
        });
        host.querySelector<HTMLFormElement>('form')!.requestSubmit();
        await vi.waitFor(() => expect(onEvaluation).toHaveBeenCalledOnce());
        await vi.waitFor(() => expect(host.querySelector('[data-listening-support]')).not.toBeNull());
        expect(host.querySelectorAll('fieldset[hidden]')).toHaveLength(4);
        expect(host.querySelector<HTMLElement>('fieldset:not([hidden])')?.dataset.errorTag)
            .toBe('l2-l10-minna077-miller-reading-paper');
        expect(host.textContent).toContain('山田さんが 持って 行きましたよ。');
        expect(host.textContent).toContain('× ミラーさんは 今、新聞を 読んでいます。');
        controller.dispose();

        const revisit = document.createElement('main');
        const revisited = runtime.mount(model(), {
            replace(view) { revisit.replaceChildren(view); },
            announce() {},
        }, () => {});
        expect(revisit.querySelector('[data-listening-support]')).toBeNull();
        expect(revisit.textContent).not.toContain('山田さんが 持って 行きましたよ。');
        revisited.dispose();
    });

    it('proves source inventory, offline mirrors, route binding, cache, ledger, and quarantine boundary', async () => {
        const provenance = verifyCommittedPackagedListening({
            locator: AUDIO_LOCATOR,
            url: AUDIO_URL,
            sha256: AUDIO_SHA256,
            bytes: 2_311_785,
        });
        expect(provenance.source).toMatchObject({
            corpus: 'minna',
            questionMapRef: expect.stringContaining('source-minna-077-true-false'),
        });
        expect(provenance.provenance.join(' ')).toContain('Moodle module 6974659');
        expect(provenance.provenance.join(' ')).toContain('b9b3c693080df851f722b7697a57ca66f6c3f0a43434e68e609be14b1afe6da5');

        const bindings = JSON.parse(readFileSync(
            'public/academy/content/listening/listening-task-bindings.v1.json', 'utf8',
        ));
        const minna077 = bindings.entries.filter((entry: { packageId: string; sourceQuestionId: string }) => (
            entry.packageId === 'l2-l10' && entry.sourceQuestionId.includes(':minna077-mondai-2:')
        ));
        expect(minna077).toHaveLength(5);
        expect(JSON.stringify(minna077)).not.toMatch(/"answer"|"transcript"/i);
        expect(minna077.every((entry: { learnerContract: { response: string; grading: string }; verification: { answerGate: string } }) => (
            entry.learnerContract.response === 'true-false'
            && entry.learnerContract.grading === 'deterministic'
            && entry.verification.answerGate === 'after-attempt'
        ))).toBe(true);

        const chapter = await loadLessonActivityChapter('l2-l10', { lookup: async () => null });
        expect(chapter?.beats.map(beat => beat.id)).toEqual([
            'sensei-toki-threshold',
            'sensei-minna-077-true-false',
        ]);
        for (const worker of [readFileSync('public/academy/sw.js', 'utf8'), readFileSync('docs/public/academy/sw.js', 'utf8')]) {
            expect(worker).toContain(`'${AUDIO_URL}'`);
        }

        const ledger = JSON.parse(readFileSync('public/academy/content/RESOURCE-LEDGER.json', 'utf8'));
        const slice = ledger.worksheetDigitisation.additionalSlices.find((item: { lessonId: string }) => item.lessonId === 'l2-l10');
        expect(slice).toMatchObject({
            audio: {
                status: 'minna-077-mondai-2-reviewed-packaged-static',
                sourceAudioMembers: 4,
                sourceAudioTracksDelivered: 1,
                quarantinedSourceAudioMembers: 3,
                deliveredPayloadSha256: [AUDIO_SHA256],
            },
            claims: {
                sourceAudioTrueFalsePromptsDelivered: 5,
                answerVisibility: 'after-attempt',
                repairScope: 'missed-source-toki-thresholds-or-minna-077-statements-only',
            },
        });
        expect(slice.unconverted).toEqual(expect.arrayContaining([
            expect.stringContaining('B-34, B-35, and the repeated Minna 075'),
            expect.stringContaining('track 076 remains inventory-only'),
        ]));
    });
});

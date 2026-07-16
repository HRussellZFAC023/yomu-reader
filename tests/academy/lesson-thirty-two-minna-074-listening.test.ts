import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createLessonThirtyTwoMinna074ListeningBeat } from '../../src/academy/content/lesson-thirty-two-minna-074-listening';
import { loadLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import {
    createAcademyActivityRuntime,
    type MinnaTrueFalseListeningModel,
    type MinnaTrueFalseListeningResponse,
} from '../../src/academy/minigames';
import { verifyCommittedPackagedListening } from './helpers/source-verification';

const AUDIO_SHA256 = '2a287bcef237d1e3f12929dff00f29d7c345fbe622c7ef5bb2cff6caf6b218a0';
const AUDIO_LOCATOR = 'academy/content/minna/audio/l2-l07-minna-074.mp3';
const AUDIO_URL = '/academy/content/listening/media/academy-listening-2a287bcef237d1e3.mp3';
const SOURCE_PREFIX = `moodle:6974653:${AUDIO_SHA256}:audio:minna074-mondai-2`;

function model(): MinnaTrueFalseListeningModel {
    return createLessonThirtyTwoMinna074ListeningBeat().activity as MinnaTrueFalseListeningModel;
}

function perfectResponse(activity = model()): MinnaTrueFalseListeningResponse {
    return { answers: activity.payload.tasks.map(task => ({ taskId: task.id, mark: task.correctMark })) };
}

afterEach(() => document.body.replaceChildren());

describe('Lesson 32 exact Minna 074 Mondai 2 listening', () => {
    it('pins the exact recording, reviewed statements, canonical marks, and transcript', () => {
        const activity = model();
        expect(createAcademyActivityRuntime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            id: 'activity:l2-l07-sensei-minna-074-true-false',
            responseKind: 'minna-074-mondai-2-true-false',
            provenance: {
                packageId: 'l2-l07',
                packageOrder: 34,
                answerVisibility: 'after-attempt',
                moodle: {
                    moduleId: 6974653,
                    audio: {
                        payloadSha256: AUDIO_SHA256,
                        locator: 'academy/content/minna/audio/l2-l07-minna-074.mp3',
                        url: AUDIO_URL,
                        durationSeconds: 109.688167,
                    },
                    sourceTask: 'recording-embedded-mondai-2',
                    answerKeyBasis: 'reviewed-original-audio-statements-and-dialogues',
                },
            },
        });
        expect(activity.payload.tasks.map(task => [task.sourceOrder, task.statement, task.correctMark])).toEqual([
            [1, '女の人は これから 会議室へ 行きます。', 'cross'],
            [2, '男の人は 日本が 勝つと 言いました。', 'cross'],
            [3, '男の人と 女の人は 喫茶店で 休みます。', 'circle'],
            [4, '女の人は 祇園祭に 行きます。', 'circle'],
            [5, '男の人は 女の人の かばんを 持ちます。', 'cross'],
        ]);
        expect(activity.payload.tasks.map(task => task.sourceQuestionId)).toEqual(
            Array.from({ length: 5 }, (_, index) => `${SOURCE_PREFIX}:item-${index + 1}`),
        );
        expect(activity.payload.transcript).toHaveLength(25);
        expect(activity.payload.transcript).toContainEqual({ item: 4, speaker: 'B', text: 'ああ、祇園祭ですね。' });

        const drifted = {
            ...activity,
            provenance: {
                ...activity.provenance,
                moodle: {
                    ...activity.provenance.moodle,
                    audio: { ...activity.provenance.moodle.audio, payloadSha256: '0'.repeat(64) },
                },
            },
        } as unknown as MinnaTrueFalseListeningModel;
        expect(createAcademyActivityRuntime().validate(drifted)).toContainEqual(
            expect.objectContaining({ path: 'provenance.moodle' }),
        );
    });

    it('grades all five visual judgements and schedules only a missed statement for repair', () => {
        const activity = model();
        const runtime = createAcademyActivityRuntime();
        expect(runtime.evaluate(activity, perfectResponse(activity)).result)
            .toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });

        const lapse = perfectResponse(activity);
        const evaluation = runtime.evaluate(activity, {
            answers: lapse.answers.map(answer => answer.taskId === 'man-predicts-japan'
                ? { ...answer, mark: 'circle' }
                : answer),
        });
        expect(evaluation.result).toMatchObject({
            outcome: 'lapse',
            score: 0.8,
            errorTags: ['l2-l07-minna074-man-predicts-japan'],
        });
        expect(evaluation.reviewSeeds.map(seed => seed.sourceQuestionId)).toEqual([`${SOURCE_PREFIX}:item-2`]);
        expect(() => runtime.evaluate(activity, { answers: [] })).toThrow('Every exact Minna 074 statement');
    });

    it('conceals every source statement and transcript until all five marks are committed', async () => {
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

        const audio = host.querySelector<HTMLAudioElement>('audio')!;
        const form = host.querySelector<HTMLFormElement>('form')!;
        expect(audio.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(audio.getAttribute('src')).toBe(AUDIO_URL);
        expect(audio.dataset.sourceSha256).toBe(AUDIO_SHA256);
        expect(form.querySelectorAll('input[type="radio"]')).toHaveLength(10);
        expect(host.querySelector('[data-listening-support]')).toBeNull();
        activity.payload.tasks.forEach(task => expect(host.textContent).not.toContain(task.statement));
        activity.payload.transcript.forEach(line => expect(host.textContent).not.toContain(line.text));

        perfectResponse(activity).answers.forEach(answer => {
            form.querySelector<HTMLInputElement>(
                `input[name="${activity.id}:${answer.taskId}"][value="${answer.mark}"]`,
            )!.checked = true;
        });
        form.requestSubmit();
        await vi.waitFor(() => expect(onEvaluation).toHaveBeenCalledOnce());
        await vi.waitFor(() => expect(host.querySelector('[data-listening-support]')).not.toBeNull());
        expect(host.textContent).toContain('じゃ、また あとで 来ます。');
        expect(host.textContent).toContain('○ 男の人と 女の人は 喫茶店で 休みます。');
        controller.dispose();

        const revisit = document.createElement('main');
        const revisited = runtime.mount(model(), {
            replace(view) { revisit.replaceChildren(view); },
            announce() {},
        }, () => {});
        expect(revisit.querySelector('[data-listening-support]')).toBeNull();
        expect(revisit.textContent).not.toContain('じゃ、また あとで 来ます。');
        revisited.dispose();
    });

    it('mirrors exact bytes, precaches the track, binds five questions, and quarantines only unrelated audio', async () => {
        verifyCommittedPackagedListening({
            locator: AUDIO_LOCATOR,
            url: AUDIO_URL,
            sha256: AUDIO_SHA256,
            bytes: 2_634_658,
        });

        const lessonBytes = readFileSync('public/academy/content/lessons/034-l2-l07.json');
        expect(createHash('sha256').update(lessonBytes).digest('hex'))
            .toBe('7edfa0f5430e384f00d6ac2a695c7fa3d8271e266585e2d7c4d889fe5a964a99');
        expect(readFileSync('docs/public/academy/content/lessons/034-l2-l07.json')).toEqual(lessonBytes);
        const lesson = JSON.parse(lessonBytes.toString('utf8'));
        expect(lesson.sourceQuestionNormalization.sourceQuestions).toHaveLength(5);
        expect(lesson.mapping.genki).toBe('No verified Genki crosswalk asserted.');
        expect(lesson.sourceQuestionNormalization.quarantine.sourceDocumentsWithoutVerifiedAnswers.map(
            (item: { title: string }) => item.title,
        )).toEqual(expect.arrayContaining([
            'Handouts/Chapter 21 listening-1 .pdf',
            'Handouts/Chapter 21 listening-2 .pdf',
        ]));
        expect(lesson.sourceQuestionNormalization.quarantine.unresolvedMedia).toHaveLength(7);
        expect(lesson.sourceQuestionNormalization.quarantine.unresolvedMedia.map(
            (item: { title: string }) => item.title,
        )).toEqual([
            'audio materials/28 B-28.mp3',
            'audio materials/29 B-29.mp3',
            'audio materials/30 B-30.mp3',
            'audio materials/31 B-31.mp3',
            'Homework/18 Track 18.mp3',
            'Homework/19 Track 19.mp3',
            'Homework/kanji-4.mp3',
        ]);

        const chapter = await loadLessonActivityChapter('l2-l07', { lookup: async () => null });
        expect(chapter?.beats.map(beat => beat.id)).toEqual([
            'sensei-confirmation-signal',
            'sensei-minna-074-true-false',
        ]);
        for (const worker of [readFileSync('public/academy/sw.js', 'utf8'), readFileSync('docs/public/academy/sw.js', 'utf8')]) {
            expect(worker).toContain(`'${AUDIO_URL}'`);
        }

        const ledger = JSON.parse(readFileSync('public/academy/content/RESOURCE-LEDGER.json', 'utf8'));
        expect(ledger.worksheetDigitisation.additionalSlices.find(
            (slice: { lessonId: string }) => slice.lessonId === 'l2-l07',
        )).toMatchObject({
            sourcePackage: { sha256: '7edfa0f5430e384f00d6ac2a695c7fa3d8271e266585e2d7c4d889fe5a964a99' },
            audio: {
                sourceAudioMembers: 8,
                sourceAudioTracksDelivered: 1,
                deliveredPayloadSha256: [AUDIO_SHA256],
                quarantinedSourceAudioMembers: 7,
            },
            claims: { sourceAudioTrueFalsePromptsDelivered: 5, answerVisibility: 'after-attempt' },
        });

        const bindings = JSON.parse(readFileSync(
            'public/academy/content/listening/listening-task-bindings.v1.json', 'utf8',
        )).entries.filter((entry: { packageId: string }) => entry.packageId === 'l2-l07');
        expect(bindings).toHaveLength(5);
        expect(bindings.every((entry: { learnerContract: { response: string }; verification: { method: string } }) =>
            entry.learnerContract.response === 'true-false'
            && entry.verification.method.includes('No Moodle worksheet, Genki task, or Soya task is claimed'))).toBe(true);
    });
});

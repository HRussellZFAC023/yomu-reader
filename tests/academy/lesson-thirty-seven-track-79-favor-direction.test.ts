import { readFileSync } from 'node:fs';
import { createLessonThirtySevenTrack79FavorDirectionBeat } from '../../src/academy/content/lesson-thirty-seven-track-79-favor-direction';
import { loadLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import {
    createAcademyActivityRuntime,
    type FavorDirectionListeningModel,
    type FavorDirectionListeningResponse,
} from '../../src/academy/minigames';
import { verifyCommittedPackagedListening, verifyCommittedPublicAsset } from './helpers/source-verification';

const AUDIO_SHA256 = '612ff9f8f70e5ce4ac79b3c6826e12e6b2a7c4d2ccccf5a017df7509f474c63e';
const WORKSHEET_SHA256 = '3f50e72c599d504bfa27b2a246befc67963b6c7072d6553e820b11ce1d14b617';
const IMAGE_SHA256 = '8fbb6b9881e26e31bb614c0b3a2048780c3b590d457e9418a7ffeec7f828bc8c';
const AUDIO_LOCATOR = 'academy/content/moodle/audio/l2-l12-track-79.mp3';
const AUDIO_URL = '/academy/content/listening/media/academy-listening-612ff9f8f70e5ce4.mp3';
const IMAGE_URL = '/academy/content/lessons/l2-l12/moodle-track-79-favor-direction-page-2.png';
const SOURCE_PREFIX = `moodle:8121261:${WORKSHEET_SHA256}:pdf-p2:track79-favor-direction`;

function model(): FavorDirectionListeningModel {
    return createLessonThirtySevenTrack79FavorDirectionBeat().activity as FavorDirectionListeningModel;
}

function perfectResponse(activity = model()): FavorDirectionListeningResponse {
    return {
        answers: activity.payload.tasks.map(task => ({
            taskId: task.id,
            direction: task.beneficiaryDirection,
            phrase: task.answer,
        })),
    };
}

afterEach(() => document.body.replaceChildren());

describe('Lesson 37 exact Moodle Track 79 favor-direction listening', () => {
    it('pins the exact part (2) task boundary, prerequisite context, transcript, and key', () => {
        const activity = model();
        expect(createAcademyActivityRuntime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            id: 'activity:l2-l12-track-79-favor-direction',
            responseKind: 'moodle-track-79-favor-direction',
            provenance: {
                packageId: 'l2-l12',
                packageOrder: 39,
                answerVisibility: 'after-attempt',
                repairScope: 'missed-source-items-only',
                moodle: {
                    moduleId: 8121261,
                    archiveId: 'archive-000032',
                    worksheet: { payloadSha256: WORKSHEET_SHA256, page: 2, url: IMAGE_URL, sha256: IMAGE_SHA256 },
                    audio: { payloadSha256: AUDIO_SHA256, url: AUDIO_URL, durationSeconds: 78.92525 },
                    answerKeyBasis: 'worksheet-beneficiary-direction-and-original-audio-reviewed',
                    excludedAudioSection: 'section-1-explicitly-skipped-by-worksheet',
                },
            },
        });
        expect(activity.payload.prerequisiteContext.map(item => item.pattern)).toEqual([
            '〜てもらう', '矢印の先', '〜てくれる？', '〜てあげる',
        ]);
        expect(activity.payload.tasks.map(task => [task.sourceOrder, task.arrow, task.answer, task.sourceQuestionId])).toEqual([
            [1, '→', '読んでもらう', `${SOURCE_PREFIX}:item-1`],
            [2, '←', '傘を貸してもらう', `${SOURCE_PREFIX}:item-2`],
            [3, '→', '食べてもらう', `${SOURCE_PREFIX}:item-3`],
        ]);
        expect(activity.payload.transcript).toHaveLength(19);
        expect(activity.payload.transcript.map(line => line.text).join(' ')).toContain('IT産業だよ');
    });

    it('grades both fields deterministically and seeds only a missed source row', () => {
        const activity = model();
        const runtime = createAcademyActivityRuntime();
        expect(runtime.evaluate(activity, perfectResponse(activity)).result)
            .toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });

        const lapse = runtime.evaluate(activity, {
            answers: perfectResponse(activity).answers.map(answer => answer.taskId === 'lend-umbrella'
                ? { ...answer, direction: 'right' }
                : answer),
        });
        expect(lapse.result).toMatchObject({
            outcome: 'lapse',
            score: 2 / 3,
            errorTags: ['l2-l12-track79-item-2'],
        });
        expect(lapse.reviewSeeds.map(seed => seed.sourceQuestionId)).toEqual([`${SOURCE_PREFIX}:item-2`]);
        expect(() => runtime.evaluate(activity, { answers: [] })).toThrow('All three Track 79');
    });

    it('conceals transcript and key until commitment, then repairs only missed rows and resets on revisit', async () => {
        const activity = model();
        const runtime = createAcademyActivityRuntime();
        const host = document.createElement('main');
        const onEvaluation = vi.fn();
        const controller = runtime.mount(activity, {
            language: 'en',
            replace(view) { host.replaceChildren(view); },
            announce() {},
        }, onEvaluation);
        document.body.append(host);

        expect(host.querySelector('audio')?.getAttribute('src')).toBe(AUDIO_URL);
        expect(host.querySelector('img')?.getAttribute('src')).toBe(IMAGE_URL);
        expect(host.querySelectorAll('input[type="text"]')).toHaveLength(3);
        expect(host.querySelectorAll('input[type="radio"]')).toHaveLength(6);
        expect(host.querySelector('[data-listening-support]')).toBeNull();
        expect(host.textContent).not.toContain('IT産業だよ');
        expect(host.textContent).not.toContain('傘を貸してもらう');

        activity.payload.tasks.forEach((task, index) => {
            const direction = index === 1 ? 'right' : task.beneficiaryDirection;
            host.querySelector<HTMLInputElement>(`input[name="${activity.id}:${task.id}:direction"][value="${direction}"]`)!.checked = true;
            host.querySelector<HTMLInputElement>(`input[name="${activity.id}:${task.id}:phrase"]`)!.value = task.answer;
        });
        host.querySelector<HTMLFormElement>('form')!.requestSubmit();
        await vi.waitFor(() => expect(onEvaluation).toHaveBeenCalledOnce());
        await vi.waitFor(() => expect(host.querySelector('[data-listening-support]')).not.toBeNull());

        const repairRows = [...host.querySelectorAll<HTMLElement>('[data-error-tag]')];
        expect(repairRows.filter(item => item.hidden)).toHaveLength(2);
        expect(repairRows.find(item => !item.hidden)?.dataset.errorTag).toBe('l2-l12-track79-item-2');
        expect(host.textContent).toContain('IT産業だよ');
        expect(host.textContent).toContain('傘を貸してもらう');
        controller.dispose();

        const revisit = document.createElement('main');
        const revisited = runtime.mount(model(), {
            replace(view) { revisit.replaceChildren(view); },
            announce() {},
        }, () => {});
        expect(revisit.querySelector('[data-listening-support]')).toBeNull();
        expect([...revisit.querySelectorAll<HTMLElement>('[data-error-tag]')].every(item => !item.hidden)).toBe(true);
        expect(revisit.textContent).not.toContain('IT産業だよ');
        revisited.dispose();
    });

    it('proves exact byte mirrors, bindings, route order, offline cache, ledgers, and quarantine boundaries', async () => {
        verifyCommittedPackagedListening({
            locator: AUDIO_LOCATOR,
            url: AUDIO_URL,
            sha256: AUDIO_SHA256,
            bytes: 1_267_924,
        });
        verifyCommittedPublicAsset({ url: IMAGE_URL, sha256: IMAGE_SHA256 });

        const bindings = JSON.parse(readFileSync('public/academy/content/listening/listening-task-bindings.v1.json', 'utf8'));
        const track79 = bindings.entries.filter((entry: { packageId: string; sourceQuestionId: string }) => (
            entry.packageId === 'l2-l12' && entry.sourceQuestionId.startsWith(SOURCE_PREFIX)
        ));
        expect(track79).toHaveLength(3);
        expect(JSON.stringify(track79)).not.toMatch(/"answer"|"transcript"/i);
        expect(track79.every((entry: { verification: { answerGate: string }; learnerContract: { response: string; grading: string } }) => (
            entry.verification.answerGate === 'after-attempt'
            && entry.learnerContract.response === 'direction-phrase'
            && entry.learnerContract.grading === 'deterministic'
        ))).toBe(true);

        const chapter = await loadLessonActivityChapter('l2-l12', { lookup: async () => null });
        expect(chapter?.beats.map(beat => beat.id)).toEqual([
            'sensei-nagara-workshop', 'track-78-bank-listening', 'track-79-favor-direction',
        ]);
        for (const worker of [readFileSync('public/academy/sw.js', 'utf8'), readFileSync('docs/public/academy/sw.js', 'utf8')]) {
            expect(worker).toContain(`'${AUDIO_URL}'`);
            expect(worker).toContain(`'${IMAGE_URL}'`);
        }

        const lesson = JSON.parse(readFileSync('public/academy/content/lessons/039-l2-l12.json', 'utf8'));
        expect(lesson.sourceQuestionNormalization).toMatchObject({ groundedSourceQuestionCount: 12, playableSourceQuestionCount: 12 });
        expect(lesson.sourceQuestionNormalization.sourceQuestions).toHaveLength(12);
        expect(lesson.sourceQuestionNormalization.quarantine.unresolvedMedia.map((item: { title: string }) => item.title)).toEqual([
            'audio materials/10 A-10.mp3', 'audio materials/9-A-9.mp3',
        ]);

        const ledger = JSON.parse(readFileSync('public/academy/content/RESOURCE-LEDGER.json', 'utf8'));
        const slice = ledger.worksheetDigitisation.additionalSlices.find((item: { lessonId: string }) => item.lessonId === 'l2-l12');
        expect(slice).toMatchObject({
            audio: { status: 'track-78-and-79-reviewed-packaged-static', sourceAudioTracksDelivered: 2, quarantinedSourceAudioMembers: 2 },
            claims: {
                worksheetPagesRendered: 6,
                sourceListeningItemsDelivered: 12,
                sourceListeningDirectionPhrasesDelivered: 3,
                answerVisibility: 'after-attempt',
                repairScope: 'missed-source-nagara-joins-or-track-78-or-track-79-items-only',
            },
        });
        expect(slice.unconverted).toEqual(expect.arrayContaining([
            expect.stringContaining('Track 79 section (1) is excluded'),
            expect.stringContaining('A-9 and A-10 remain quarantined'),
        ]));
    });
});

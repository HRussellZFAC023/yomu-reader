import { readFileSync } from 'node:fs';
import { createLessonThirtyEightA11MealSurveyListeningBeat } from '../../src/academy/content/lesson-thirty-eight-a11-meal-survey-listening';
import { loadLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import {
    createAcademyActivityRuntime,
    type MealSurveyListeningModel,
    type MealSurveyListeningResponse,
} from '../../src/academy/minigames';
import { verifyCommittedPackagedListening, verifyCommittedPublicAsset } from './helpers/source-verification';

const AUDIO_SHA256 = '596a4499996bd9599a169a8ae9171a0e78fe22a7f9d92bce7045203b794baf25';
const WORKSHEET_SHA256 = '3023ab51a23ae6744380db3cf909754a77fa8decac47de70a5c46224bc6daed9';
const IMAGE_SHA256 = '18b086df7e2a30592a4a07d60f5fcb575cc2415e02f1b18c6dcfce415f7bb868';
const AUDIO_LOCATOR = 'academy/content/moodle/audio/l2-l13-a11.mp3';
const AUDIO_URL = '/academy/content/listening/media/academy-listening-596a4499996bd959.mp3';
const IMAGE_URL = '/academy/content/lessons/l2-l13/moodle-a11-meal-survey-page-1.png';
const SOURCE_PREFIX = `moodle:8121266:${WORKSHEET_SHA256}:pdf-p1:a11-meal-survey`;

function model(): MealSurveyListeningModel {
    return createLessonThirtyEightA11MealSurveyListeningBeat().activity as MealSurveyListeningModel;
}

function perfectResponse(activity = model()): MealSurveyListeningResponse {
    return { answers: activity.payload.tasks.map(task => ({ taskId: task.id, value: task.answer })) };
}

afterEach(() => document.body.replaceChildren());

describe('Lesson 38 exact Moodle A-11 meal-survey listening', () => {
    it('pins the exact A-11 boundary, prerequisites, mixed response modes, transcript, and key', () => {
        const activity = model();
        expect(createAcademyActivityRuntime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            id: 'activity:l2-l13-a11-meal-survey-listening',
            responseKind: 'moodle-a11-meal-survey',
            provenance: {
                packageId: 'l2-l13',
                packageOrder: 40,
                answerVisibility: 'after-attempt',
                repairScope: 'missed-source-items-only',
                moodle: {
                    moduleId: 8121266,
                    archiveId: 'archive-000092',
                    worksheet: { payloadSha256: WORKSHEET_SHA256, page: 1, url: IMAGE_URL, sha256: IMAGE_SHA256 },
                    audio: { payloadSha256: AUDIO_SHA256, url: AUDIO_URL, durationSeconds: 83.12 },
                    answerKeyBasis: 'worksheet-a11-loci-and-original-audio-reviewed',
                    excludedWorksheetSection: 'a12-lower-section-not-paired-with-a11',
                },
            },
        });
        expect(activity.payload.prerequisiteContext.map(item => item.pattern)).toEqual([
            '毎日・時々・全然', '場所で 食べます', 'パンや おにぎり', '〜から・〜し',
        ]);
        expect(activity.payload.tasks.map(task => [task.sourceOrder, task.kind, task.answer, task.sourceQuestionId])).toEqual([
            [1, 'choice', '毎日', `${SOURCE_PREFIX}:item-1`],
            [2, 'text', '大学の食堂', `${SOURCE_PREFIX}:item-2`],
            [3, 'text', 'カレー', `${SOURCE_PREFIX}:item-3`],
            [4, 'choice', '毎日', `${SOURCE_PREFIX}:item-4`],
            [5, 'text', 'うち', `${SOURCE_PREFIX}:item-5`],
            [6, 'choice', '時々', `${SOURCE_PREFIX}:item-6`],
            [7, 'choice', 'コンビニ', `${SOURCE_PREFIX}:item-7`],
        ]);
        expect(activity.payload.transcript).toHaveLength(25);
        expect(activity.payload.transcript.map(line => line.text).join(' ')).toContain('便利だし、いろいろあるしね');
    });

    it('grades every source response deterministically and seeds only a missed item', () => {
        const activity = model();
        const runtime = createAcademyActivityRuntime();
        expect(runtime.evaluate(activity, perfectResponse(activity)).result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        const lapse = runtime.evaluate(activity, {
            answers: perfectResponse(activity).answers.map(answer => answer.taskId === 'lunch-food' ? { ...answer, value: 'うどん' } : answer),
        });
        expect(lapse.result).toMatchObject({ outcome: 'lapse', score: 6 / 7, errorTags: ['l2-l13-a11-item-3'] });
        expect(lapse.reviewSeeds.map(seed => seed.sourceQuestionId)).toEqual([`${SOURCE_PREFIX}:item-3`]);
        expect(() => runtime.evaluate(activity, { answers: [] })).toThrow('All seven A-11');
    });

    it('teaches before assessment, gates transcript/key, repairs misses only, and resets on revisit', async () => {
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

        const context = host.querySelector('[data-lesson-phase="teach-before-assess"]');
        const form = host.querySelector('form');
        expect(context && form && Boolean(context.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING)).toBe(true);
        expect(host.querySelector('audio')?.getAttribute('src')).toBe(AUDIO_URL);
        expect(host.querySelector('img')?.getAttribute('src')).toBe(IMAGE_URL);
        expect(host.querySelectorAll('input[type="text"]')).toHaveLength(3);
        expect(host.querySelectorAll('input[type="radio"]')).toHaveLength(12);
        expect(host.querySelector('[data-listening-support]')).toBeNull();
        expect(host.textContent).not.toContain('便利だし、いろいろあるしね');
        expect(host.textContent).not.toContain('大学の食堂');

        activity.payload.tasks.forEach(task => {
            const value = task.id === 'lunch-food' ? 'うどん' : task.answer;
            const input = task.kind === 'choice'
                ? host.querySelector<HTMLInputElement>(`input[name="${activity.id}:task:${task.id}"][value="${value}"]`)
                : host.querySelector<HTMLInputElement>(`input[name="${activity.id}:task:${task.id}"]`);
            expect(input).not.toBeNull();
            if (task.kind === 'choice') input!.click();
            else input!.value = value;
        });
        host.querySelector<HTMLFormElement>('form')!.requestSubmit();
        await vi.waitFor(() => expect(onEvaluation).toHaveBeenCalledOnce());
        await vi.waitFor(() => expect(host.querySelector('[data-listening-support]')).not.toBeNull());
        expect([...host.querySelectorAll<HTMLElement>('[data-error-tag]')].filter(item => !item.hidden).map(item => item.dataset.errorTag))
            .toEqual(['l2-l13-a11-item-3']);
        expect(host.textContent).toContain('便利だし、いろいろあるしね');
        expect(host.textContent).toContain('大学の食堂');
        controller.dispose();

        const revisit = document.createElement('main');
        const revisited = runtime.mount(model(), { replace(view) { revisit.replaceChildren(view); }, announce() {} }, () => {});
        expect(revisit.querySelector('[data-listening-support]')).toBeNull();
        expect([...revisit.querySelectorAll<HTMLElement>('[data-error-tag]')].every(item => !item.hidden)).toBe(true);
        revisited.dispose();
    });

    it('proves exact byte mirrors, seven bindings, lesson route, offline cache, and honest ledger', async () => {
        verifyCommittedPackagedListening({
            locator: AUDIO_LOCATOR,
            url: AUDIO_URL,
            sha256: AUDIO_SHA256,
            bytes: 1_335_328,
        });
        verifyCommittedPublicAsset({ url: IMAGE_URL, sha256: IMAGE_SHA256 });

        const bindings = JSON.parse(readFileSync('public/academy/content/listening/listening-task-bindings.v1.json', 'utf8'));
        const a11 = bindings.entries.filter((entry: { packageId: string; sourceQuestionId: string }) => (
            entry.packageId === 'l2-l13' && entry.sourceQuestionId.startsWith(SOURCE_PREFIX)
        ));
        expect(a11).toHaveLength(7);
        expect(JSON.stringify(a11)).not.toMatch(/"answer"|"transcript"/i);
        expect(a11.every((entry: { verification: { answerGate: string }; learnerContract: { response: string; grading: string } }) => (
            entry.verification.answerGate === 'after-attempt'
            && entry.learnerContract.response === 'meal-survey'
            && entry.learnerContract.grading === 'deterministic'
        ))).toBe(true);

        const chapter = await loadLessonActivityChapter('l2-l13', { lookup: async () => null });
        expect(chapter?.beats.map(beat => beat.id)).toEqual(['sensei-shi-reason-chain', 'a11-meal-survey-listening']);
        for (const worker of [readFileSync('public/academy/sw.js', 'utf8'), readFileSync('docs/public/academy/sw.js', 'utf8')]) {
            expect(worker).toContain(`'${AUDIO_URL}'`);
            expect(worker).toContain(`'${IMAGE_URL}'`);
        }

        const ledger = JSON.parse(readFileSync('public/academy/content/RESOURCE-LEDGER.json', 'utf8'));
        const slice = ledger.worksheetDigitisation.additionalSlices.find((item: { lessonId: string }) => item.lessonId === 'l2-l13');
        expect(slice).toMatchObject({
            audio: { sourceAudioMembers: 5, sourceAudioTracksDelivered: 1, deliveredPayloadSha256: AUDIO_SHA256 },
            claims: {
                worksheetPagesRendered: 6,
                sourceListeningItemsDelivered: 7,
                originalAudioTracksDelivered: 1,
                answerVisibility: 'after-attempt',
                repairScope: 'missed-source-shi-chains-or-a11-items-only',
            },
        });
        expect(slice.unconverted).toEqual(expect.arrayContaining([
            expect.stringContaining('Four archived audio members remain quarantined'),
            expect.stringContaining('lower A-12 worksheet section is explicitly excluded'),
        ]));
    });
});

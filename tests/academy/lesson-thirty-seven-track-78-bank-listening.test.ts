import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createLessonThirtySevenTrack78BankListeningBeat } from '../../src/academy/content/lesson-thirty-seven-track-78-bank-listening';
import { loadLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import {
    createAcademyActivityRuntime,
    type BankListeningClozeModel,
    type BankListeningClozeResponse,
} from '../../src/academy/minigames';

const AUDIO_SHA256 = '1039d11bef7a0575c6f104f780d1b65c79e63eb50dc292ea8c39f05d241123d2';
const WORKSHEET_SHA256 = '3f50e72c599d504bfa27b2a246befc67963b6c7072d6553e820b11ce1d14b617';
const IMAGE_SHA256 = '07ae4ae9fa5441f99bf5542d4199215433cc56ddddc4f1ab968d7533c4bd3ef4';
const AUDIO_URL = '/academy/content/listening/media/academy-listening-1039d11bef7a0575.mp3';
const IMAGE_URL = '/academy/content/lessons/l2-l12/moodle-track-78-bank-listening-page-1.png';
const SOURCE_PREFIX = `moodle:8121261:${WORKSHEET_SHA256}:pdf-p1:track78-bank`;

function model(): BankListeningClozeModel {
    return createLessonThirtySevenTrack78BankListeningBeat().activity as BankListeningClozeModel;
}

function perfectResponse(activity = model()): BankListeningClozeResponse {
    return {
        values: activity.payload.fields.map(field => ({ fieldId: field.id, value: field.answer })),
        choice: activity.payload.choice.answer,
    };
}

afterEach(() => document.body.replaceChildren());

describe('Lesson 37 exact Moodle Track 78 bank listening', () => {
    it('pins the exact worksheet task, prerequisite context, reviewed key, and transcript', () => {
        const activity = model();
        expect(createAcademyActivityRuntime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            id: 'activity:l2-l12-track-78-bank-listening',
            responseKind: 'moodle-track-78-bank-cloze',
            provenance: {
                packageId: 'l2-l12',
                packageOrder: 39,
                answerVisibility: 'after-attempt',
                repairScope: 'missed-source-items-only',
                moodle: {
                    moduleId: 8121261,
                    archiveId: 'archive-000032',
                    worksheet: { payloadSha256: WORKSHEET_SHA256, page: 1, url: IMAGE_URL, sha256: IMAGE_SHA256 },
                    audio: { payloadSha256: AUDIO_SHA256, url: AUDIO_URL, durationSeconds: 76.032313 },
                    answerKeyBasis: 'worksheet-track-identity-and-original-audio-reviewed',
                },
            },
        });
        expect(activity.payload.prerequisiteContext.map(item => item.pattern)).toEqual([
            '〜たいんですが', 'ご記入を お願いします', '〜は お持ちでしょうか', 'お使いいただけます', '〜て もらいます',
        ]);
        expect(activity.payload.fields.map(field => [field.sourceOrder, field.answer, field.sourceQuestionId])).toEqual([
            [1, 'キャッシュカード', `${SOURCE_PREFIX}:blank-1`],
            [2, '送金', `${SOURCE_PREFIX}:blank-2`],
            [3, '印鑑', `${SOURCE_PREFIX}:blank-3`],
            [4, 'パスポート', `${SOURCE_PREFIX}:blank-4`],
            [5, 'キャッシュカード', `${SOURCE_PREFIX}:blank-5`],
            [6, '郵送', `${SOURCE_PREFIX}:blank-6`],
            [7, 'お送りします', `${SOURCE_PREFIX}:blank-7`],
            [8, 'お金', `${SOURCE_PREFIX}:blank-8`],
        ]);
        expect(activity.payload.choice).toMatchObject({
            sourceQuestionId: `${SOURCE_PREFIX}:choice`,
            options: [{ id: '1', label: '④' }, { id: '2', label: '③' }, { id: '3', label: '⑧' }, { id: '4', label: '⑤' }],
            answer: '4',
        });
        expect(activity.payload.transcript).toHaveLength(17);
    });

    it('grades deterministically and seeds only a missed source item for repair', () => {
        const activity = model();
        const runtime = createAcademyActivityRuntime();
        expect(runtime.evaluate(activity, perfectResponse(activity)).result)
            .toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });

        const lapse = runtime.evaluate(activity, {
            ...perfectResponse(activity),
            values: perfectResponse(activity).values.map(value => value.fieldId === 'overseas-transfer'
                ? { ...value, value: 'お金' }
                : value),
        });
        expect(lapse.result).toMatchObject({
            outcome: 'lapse',
            score: 8 / 9,
            errorTags: ['l2-l12-track78-blank-2'],
        });
        expect(lapse.reviewSeeds.map(seed => seed.sourceQuestionId)).toEqual([`${SOURCE_PREFIX}:blank-2`]);
        expect(() => runtime.evaluate(activity, { values: [], choice: '4' })).toThrow('All eight Track 78 blanks');
    });

    it('conceals the key and transcript until commitment, then repairs only missed items', async () => {
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
        expect(host.querySelectorAll('input[type="text"]')).toHaveLength(8);
        expect(host.querySelectorAll('input[type="radio"]')).toHaveLength(4);
        expect(host.querySelector('[data-listening-support]')).toBeNull();
        expect(host.textContent).not.toContain('無料です。2週間ほど かかりますが');
        expect(host.textContent).not.toContain('①キャッシュカード');

        host.querySelectorAll<HTMLInputElement>('input[type="text"]').forEach((input, index) => {
            input.value = index === 1 ? 'お金' : activity.payload.fields[index]!.answer;
        });
        host.querySelector<HTMLInputElement>('input[type="radio"][value="4"]')!.checked = true;
        host.querySelector<HTMLFormElement>('form')!.requestSubmit();
        await vi.waitFor(() => expect(onEvaluation).toHaveBeenCalledOnce());
        await vi.waitFor(() => expect(host.querySelector('[data-listening-support]')).not.toBeNull());

        const repairItems = [...host.querySelectorAll<HTMLElement>('[data-error-tag]')];
        expect(repairItems.filter(item => item.hidden)).toHaveLength(8);
        expect(repairItems.find(item => !item.hidden)?.dataset.errorTag).toBe('l2-l12-track78-blank-2');
        expect(host.textContent).toContain('無料です。2週間ほど かかりますが');
        expect(host.textContent).toContain('①キャッシュカード');
        controller.dispose();

        const revisit = document.createElement('main');
        const revisited = runtime.mount(model(), {
            replace(view) { revisit.replaceChildren(view); },
            announce() {},
        }, () => {});
        expect(revisit.querySelector('[data-listening-support]')).toBeNull();
        expect([...revisit.querySelectorAll<HTMLElement>('[data-error-tag]')].every(item => !item.hidden)).toBe(true);
        expect(revisit.textContent).not.toContain('無料です。2週間ほど かかりますが');
        revisited.dispose();
    });

    it('proves byte mirrors, exact bindings, route order, cache, ledger, and quarantine boundaries', async () => {
        const sourceAudio = readFileSync(path.resolve('artifacts/yomu-academy/source-pipeline/payloads', AUDIO_SHA256));
        const publicAudio = readFileSync(path.resolve('public', AUDIO_URL.slice(1)));
        const docsAudio = readFileSync(path.resolve('docs/public', AUDIO_URL.slice(1)));
        expect(sourceAudio.byteLength).toBe(1_221_637);
        expect(createHash('sha256').update(sourceAudio).digest('hex')).toBe(AUDIO_SHA256);
        expect(publicAudio).toEqual(sourceAudio);
        expect(docsAudio).toEqual(sourceAudio);

        const publicImage = readFileSync(path.resolve('public', IMAGE_URL.slice(1)));
        expect(createHash('sha256').update(publicImage).digest('hex')).toBe(IMAGE_SHA256);
        expect(readFileSync(path.resolve('docs/public', IMAGE_URL.slice(1)))).toEqual(publicImage);

        const bindings = JSON.parse(readFileSync('public/academy/content/listening/listening-task-bindings.v1.json', 'utf8'));
        const track78 = bindings.entries.filter((entry: { packageId: string; sourceQuestionId: string }) => (
            entry.packageId === 'l2-l12' && entry.sourceQuestionId.startsWith(SOURCE_PREFIX)
        ));
        expect(track78).toHaveLength(9);
        expect(JSON.stringify(track78)).not.toMatch(/"answer"|"transcript"/i);
        expect(track78.every((entry: { verification: { answerGate: string }; learnerContract: { response: string; grading: string } }) => (
            entry.verification.answerGate === 'after-attempt'
            && entry.learnerContract.response === 'structured-cloze'
            && entry.learnerContract.grading === 'deterministic'
        ))).toBe(true);

        const chapter = await loadLessonActivityChapter('l2-l12', { lookup: async () => null });
        expect(chapter?.beats.map(beat => beat.id)).toEqual(['sensei-nagara-workshop', 'track-78-bank-listening', 'track-79-favor-direction']);
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

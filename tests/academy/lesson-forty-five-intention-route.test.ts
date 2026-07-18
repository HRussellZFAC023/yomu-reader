import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createLessonFortyFiveIntentionRouteBeat } from '../../src/academy/content/lesson-forty-five-intention-route';
import { loadLessonActivityChapter, loadReachableLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import { ACADEMY_ACTIVITY_PLUGINS } from '../../src/academy/minigames';
import { stateInspectionPlugin, type StateInspectionModel } from '../../src/academy/minigames/state-inspection';
import { filesHaveSameContent, sha256File } from './helpers/hash-memo';

const PACKAGE_SHA256 = '32b44dd9de43b0836153a5907c008e710bcc170e742737e64737343eccbceeda';
const UNPAIRED_AUDIO_SHA256 = '49383b3d78eae5ac77a7480a56e29fedf1e0ccd41d36e45a2c8d2f8b97f923b7';

function model(): StateInspectionModel {
    return createLessonFortyFiveIntentionRouteBeat().activity as StateInspectionModel;
}

function correctAnswers(activity: StateInspectionModel) {
    return activity.payload.rounds.map(round => ({ roundId: round.id, value: round.answerValue }));
}

function runtime() {
    return createActivityRuntime([stateInspectionPlugin]);
}

afterEach(() => document.body.replaceChildren());

describe('Lesson 45 Sensei Chapter 31-1 intention route', () => {
    it('claims l2-l20 after the registry boundary and keeps source, vocabulary, and audio claims honest', () => {
        const activity = model();
        expect(runtime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            id: 'activity:l2-l20-sensei-intention-route',
            responseKind: 'moodle-chapter-31-intention-route',
            provenance: {
                packageId: 'l2-l20', packageOrder: 47, answerVisibility: 'after-attempt',
                moodle: {
                    moduleId: 8121275, archiveId: 'archive-000064',
                    media: {
                        status: 'audio-member-quarantined-pairing-unproven', sourceAudioMembers: 1,
                        sourceAudioTracksDelivered: 0, quarantinedPayloadSha256: UNPAIRED_AUDIO_SHA256,
                    },
                },
                support: {
                    minna: { reference: 'Minna no Nihongo II · Lesson 31', reuse: 'chronology-and-scope-only' },
                    genki: { crosswalk: '≈ Genki II · Volitional form and intentions', reuse: 'sequence-only' },
                },
            },
        });
        expect(activity.provenance.moodle.sourceSheets).toHaveLength(6);
        expect(activity.provenance.moodle.sourceSheets.map(sheet => sheet.title)).toEqual([
            'Chapter 31-1 〜ようと思っています grammar exercise',
            'Chapter 31-1 〜ようと思っています grammar exercise',
            'Chapter 31-1 verb volitional form exercise',
            'Chapter 31-1 verb volitional form exercise',
            'Chapter 31-1 Vocabulary Sheet',
            'Chapter 31-1 Vocabulary Sheet',
        ]);
        expect(activity.payload.taskHeadings.map(item => item.text)).toEqual([
            '1: Construct sentences as in example.',
            '2: Create sentences using〜ようとおもっています',
        ]);
        expect(activity.payload.rounds.map(round => round.interaction)).toEqual([
            'action-choice', 'typed-report', 'state-select', 'typed-report',
            'action-choice', 'typed-report', 'state-select', 'typed-report',
        ]);
        expect(activity.payload.rounds.map(round => round.sourceQuestionId)).toEqual([
            'moodle:8121275:ebf8c22c4132b0f7b81fa2389923ec2fd74976ddb89e1ac587a01ccf5d6f9cef:pdf-p2:task-1:q1',
            'moodle:8121275:ebf8c22c4132b0f7b81fa2389923ec2fd74976ddb89e1ac587a01ccf5d6f9cef:pdf-p2:task-1:q2',
            'moodle:8121275:ebf8c22c4132b0f7b81fa2389923ec2fd74976ddb89e1ac587a01ccf5d6f9cef:pdf-p2:task-1:q4',
            'moodle:8121275:ebf8c22c4132b0f7b81fa2389923ec2fd74976ddb89e1ac587a01ccf5d6f9cef:pdf-p2:task-1:q6',
            'moodle:8121275:ebf8c22c4132b0f7b81fa2389923ec2fd74976ddb89e1ac587a01ccf5d6f9cef:pdf-p2:task-2:q1',
            'moodle:8121275:ebf8c22c4132b0f7b81fa2389923ec2fd74976ddb89e1ac587a01ccf5d6f9cef:pdf-p2:task-2:q2',
            'moodle:8121275:ebf8c22c4132b0f7b81fa2389923ec2fd74976ddb89e1ac587a01ccf5d6f9cef:pdf-p2:task-2:q3',
            'moodle:8121275:ebf8c22c4132b0f7b81fa2389923ec2fd74976ddb89e1ac587a01ccf5d6f9cef:pdf-p2:task-2:q4',
        ]);
    });

    it('grades exact source rows and schedules only missed prompts for repair', () => {
        const activity = model();
        expect(runtime().evaluate(activity, { answers: correctAnswers(activity) }).result)
            .toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });

        const lapse = runtime().evaluate(activity, {
            answers: correctAnswers(activity).map((answer, index) => index === 4
                ? { ...answer, value: '家族と 教会へ 行きますと 思っています。' }
                : answer),
        });
        expect(lapse.result).toMatchObject({
            outcome: 'lapse', score: 7 / 8, errorTags: ['l2-l20-intention-5'],
        });
        expect(lapse.reviewSeeds[0]?.sourceQuestionId)
            .toBe('moodle:8121275:ebf8c22c4132b0f7b81fa2389923ec2fd74976ddb89e1ac587a01ccf5d6f9cef:pdf-p2:task-2:q1');
    });

    it('keeps six exact source pages before varied answer-gated activity and keeps unpaired audio absent', async () => {
        const activity = model();
        const host = document.createElement('main');
        const supportUse = vi.fn();
        const outcomes: string[] = [];
        const controller = runtime().mount(activity, {
            language: 'en', replace(view) { host.replaceChildren(view); }, announce() {}, recordSupportUse: supportUse,
        }, evaluation => { outcomes.push(evaluation.result.outcome); });
        document.body.append(host);

        const teaching = host.querySelector<HTMLElement>('.academy-state-inspection-teaching')!;
        const sources = host.querySelector<HTMLElement>('.academy-state-inspection-sources')!;
        const form = host.querySelector<HTMLFormElement>('form')!;
        expect(teaching.compareDocumentPosition(sources) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(sources.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(host.querySelector('audio')).toBeNull();
        expect(host.querySelectorAll('.academy-state-inspection-source img')).toHaveLength(6);
        expect(host.querySelectorAll('.academy-state-inspection-round')).toHaveLength(8);
        expect(host.querySelectorAll('select')).toHaveLength(2);
        expect(host.querySelectorAll('input[type="radio"]')).toHaveLength(4);
        expect(host.querySelectorAll('input[type="text"]')).toHaveLength(4);
        expect(host.querySelector<HTMLElement>('[data-answer-visibility="after-attempt"]')?.hidden).toBe(true);
        expect(host.querySelector('.academy-state-inspection-hints')).toBeNull();

        activity.payload.rounds.forEach((round, index) => {
            const row = host.querySelector<HTMLElement>(`[data-round-id="${round.id}"]`)!;
            const value = index === 4 ? '家族と 教会へ 行きますと 思っています。' : round.answerValue;
            if (round.interaction === 'state-select') row.querySelector<HTMLSelectElement>('select')!.value = value;
            else if (round.interaction === 'action-choice') row.querySelector<HTMLInputElement>(`input[value="${value}"]`)!.checked = true;
            else row.querySelector<HTMLInputElement>('input[type="text"]')!.value = value;
        });
        form.requestSubmit();
        await vi.waitFor(() => expect(outcomes).toEqual(['lapse']));
        await vi.waitFor(() => expect(host.querySelector<HTMLElement>('[data-answer-visibility="after-attempt"]')?.hidden).toBe(false));
        expect(host.querySelectorAll('.academy-state-inspection-round:not([hidden])')).toHaveLength(1);

        const hint = host.querySelector<HTMLButtonElement>('.academy-state-inspection-hint')!;
        hint.click(); hint.click(); hint.click(); hint.click();
        expect(host.querySelector<HTMLElement>('.academy-state-inspection-hint-output')?.dataset.hintIndex).toBe('3');
        expect(hint.disabled).toBe(true);
        expect(supportUse).toHaveBeenCalledTimes(3);

        host.querySelector<HTMLButtonElement>('.academy-state-inspection-replay')!.click();
        expect(host.querySelectorAll('.academy-state-inspection-round[hidden]')).toHaveLength(0);
        expect(host.querySelector<HTMLElement>('[data-answer-visibility="after-attempt"]')?.hidden).toBe(true);
        controller.dispose();
    });

    it('wires source pages, cache, ledger, and reachable registry without delivering unverified audio', async () => {
        const activity = model();
        for (const visual of activity.provenance.moodle.sourceSheets) {
            const filename = path.basename(visual.url);
            const source = readFileSync(path.resolve('public/academy/content/lessons/l2-l20', filename));
            const hosted = readFileSync(path.resolve('docs/public/academy/content/lessons/l2-l20', filename));
            expect(sha256File(path.resolve('public/academy/content/lessons/l2-l20', filename))).toBe(visual.sha256);
            expect(hosted).toEqual(source);
        }
        expect(sha256File(path.resolve('public/academy/content/lessons/047-l2-l20.json'))).toBe(PACKAGE_SHA256);
        expect(filesHaveSameContent(path.resolve('docs/public/academy/content/lessons/047-l2-l20.json'), path.resolve('public/academy/content/lessons/047-l2-l20.json'))).toBe(true);
        for (const workerPath of ['public/academy/sw.js', 'docs/public/academy/sw.js']) {
            const worker = readFileSync(workerPath, 'utf8');
            activity.provenance.moodle.sourceSheets.forEach(visual => expect(worker).toContain(`'${visual.url}'`));
            expect(worker).not.toContain('/academy/content/lessons/l2-l20/moodle-a-22.mp3');
        }
        const ledger = JSON.parse(readFileSync('public/academy/content/RESOURCE-LEDGER.json', 'utf8'));
        const slice = ledger.worksheetDigitisation.additionalSlices.find((item: { lessonId: string }) => item.lessonId === 'l2-l20');
        expect(slice).toMatchObject({
            moodleModuleId: 8121275,
            audio: {
                status: 'unpaired-audio-quarantined', sourceAudioMembers: 1, sourceAudioTracksDelivered: 0,
                quarantinedPayloadSha256: UNPAIRED_AUDIO_SHA256,
            },
            claims: { sourcePromptsDelivered: 8, yomuDerivedCompletions: 8, earnedHintsPerMissedRow: 3 },
        });
        expect(readFileSync('docs/academy/discovery/ART-AND-AUDIO-LEDGER.md', 'utf8'))
            .toContain('`l2-l20 / Chapter 31-1 intention route`');

        const directChapter = await loadLessonActivityChapter('l2-l20', { lookup: async () => null });
        expect(directChapter?.lessonPackageId).toBe('l2-l20');
        const chapter = await loadReachableLessonActivityChapter('l2-l20', { lookup: async () => null });
        expect(chapter?.lessonPackageId).toBe('l2-l20');
        expect(createActivityRuntime(ACADEMY_ACTIVITY_PLUGINS).validate(chapter!.beats[0]!.activity as StateInspectionModel)).toEqual([]);
    });
});

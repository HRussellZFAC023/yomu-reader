import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createLessonThirtyNineStateInspectionBeat } from '../../src/academy/content/lesson-thirty-nine-state-inspection';
import { loadReachableLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import { ACADEMY_ACTIVITY_PLUGINS } from '../../src/academy/minigames';
import { stateInspectionPlugin, type StateInspectionModel } from '../../src/academy/minigames/state-inspection';
import { createReachableLessonActivityExtension } from '../../src/academy/ui/lesson-activity-chapter';
import { filesHaveSameContent, sha256File } from './helpers/hash-memo';

const SOURCE_PAYLOAD_SHA256 = '3b6d33916d8db01f3aa529f0d908f32cdff051c259f7e3c53f0e90f54e685605';
const SOURCE_VISUAL_SHA256 = [
    '2e2caf0281d4fded34bbe048ea394bbd68587c65368dcfcb24fc5aa51b3668de',
    'b96eb554de5fe31948496e2584883a77d1a0312ae8a1ba40754fb773b00d7127',
    '7e96bf07343e125e13aa037620067d968cb6ae4577b3ba575e61b0ba6481225f',
    '6ece5c49c000519585b15a5d3510b8b2943f4c4832199b15642af475f0fadcd9',
] as const;

function model(): StateInspectionModel {
    return createLessonThirtyNineStateInspectionBeat().activity as StateInspectionModel;
}

function correctAnswers(activity: StateInspectionModel) {
    return activity.payload.rounds.map(round => ({ roundId: round.id, value: round.answerValue }));
}

function runtime() {
    return createActivityRuntime([stateInspectionPlugin]);
}

afterEach(() => document.body.replaceChildren());

describe('Lesson 39 Sensei Chapter 29-1 state inspection', () => {
    it('claims exact order 41 and teaches the source state rules before eight selected prompts', () => {
        const activity = model();
        expect(ACADEMY_ACTIVITY_PLUGINS.map(plugin => plugin.kind)).toContain('academy-state-inspection');
        expect(runtime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            id: 'activity:l2-l14-sensei-state-inspection',
            kind: 'academy-state-inspection',
            responseKind: 'moodle-chapter-29-resulting-state-inspection',
            provenance: {
                packageId: 'l2-l14',
                packageOrder: 41,
                answerVisibility: 'after-attempt',
                moodle: {
                    moduleId: 8121267,
                    archiveId: 'archive-000087',
                    answerKeyBasis: 'yomu-derived-completions-over-canonical-source-pages-and-prompts',
                    media: { status: 'audio-members-quarantined-unpaired', sourceAudioMembers: 4, sourceAudioTracksDelivered: 0 },
                },
                support: {
                    minna: { reference: 'Minna no Nihongo II · Lesson 29', reuse: 'chronology-and-scope-only' },
                    genki: { crosswalk: '≈ Genki II · Resulting states and verb pairs', reuse: 'sequence-only' },
                },
            },
        });
        expect(activity.payload.teaching.map(step => step.text)).toEqual(expect.arrayContaining([
            'Verb て-form います／いません。',
            'Another way of using V て-form います/いません is to show that the state resulting from the action indicated by the verb is still continuing (the state is still in effect).',
            'When introducing the subject as the topic, the particle は is used as in examples.',
        ]));
        expect(activity.payload.taskHeadings).toEqual([
            { sourceTask: 1, text: '1: Look at the picture below and please describe the state in effect.' },
            { sourceTask: 2, text: '2: Following the example, please create sentence to tell the state and what to do.' },
            { sourceTask: 5, text: '5: Following the example, please create sentence to tell the state and what to do.' },
        ]);
        expect(activity.payload.rounds.map(round => round.sourcePrompt)).toEqual([
            '1）[絵: 電気がついている] →',
            '2）[絵: お皿が割れている] →',
            '3）[絵: ボタンが外れている] →',
            '1）テーブル・汚れます・ふいて ください →',
            '2）時計・止まります・電池を 取り替えて ください →',
            '3）洗濯機・壊れます・手で 洗わなければ なりません →',
            '4）スーパー・閉まります・コンビニで 買いましょう →',
            '1）この コップを 使っても いいですか。 →',
        ]);
        expect(activity.payload.rounds.map(round => round.interaction)).toEqual([
            'state-select', 'state-select', 'state-select',
            'action-choice', 'action-choice', 'action-choice',
            'typed-report', 'typed-report',
        ]);
        expect(activity.payload.rounds.every(round => round.hints.length === 3)).toBe(true);
        expect(activity.payload.rounds.map(round => round.sourceQuestionId)).toEqual([
            ...[1, 2, 3].map(item => `moodle:8121267:${SOURCE_PAYLOAD_SHA256}:pdf-p2:task-1:q${item}`),
            ...[1, 2, 3, 4].map(item => `moodle:8121267:${SOURCE_PAYLOAD_SHA256}:pdf-p2:task-2:q${item}`),
            `moodle:8121267:${SOURCE_PAYLOAD_SHA256}:pdf-p3:task-5:q1`,
        ]);
    });

    it('grades every interaction mode and seeds only missed source rows for repair', () => {
        const activity = model();
        const activityRuntime = runtime();
        expect(activityRuntime.evaluate(activity, { answers: correctAnswers(activity) }).result)
            .toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });

        const lapse = activityRuntime.evaluate(activity, {
            answers: correctAnswers(activity).map((answer, index) => index === 6
                ? { ...answer, value: 'スーパーを閉めています。' }
                : answer),
        });
        expect(lapse.result).toMatchObject({
            outcome: 'lapse',
            score: 7 / 8,
            errorTags: ['l2-l14-state-inspection-7'],
        });
        expect(lapse.reviewSeeds.map(seed => seed.sourceQuestionId)).toEqual([
            `moodle:8121267:${SOURCE_PAYLOAD_SHA256}:pdf-p2:task-2:q4`,
        ]);
    });

    it('teaches first, conceals answers, repairs one miss, bounds hints, returns, and replays', async () => {
        const activity = model();
        const host = document.createElement('main');
        const supportUse = vi.fn();
        const announce = vi.fn();
        const evaluations: string[] = [];
        const controller = runtime().mount(activity, {
            language: 'en',
            replace(view) { host.replaceChildren(view); },
            announce,
            recordSupportUse: supportUse,
        }, evaluation => { evaluations.push(evaluation.result.outcome); });
        document.body.append(host);

        const teaching = host.querySelector<HTMLElement>('.academy-state-inspection-teaching')!;
        const form = host.querySelector<HTMLFormElement>('form')!;
        const key = host.querySelector<HTMLElement>('[data-answer-visibility="after-attempt"]')!;
        const returnButton = host.querySelector<HTMLButtonElement>('.academy-state-inspection-return')!;
        const replayButton = host.querySelector<HTMLButtonElement>('.academy-state-inspection-replay')!;
        expect(teaching.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(host.querySelectorAll('.academy-state-inspection-sources img')).toHaveLength(4);
        expect(host.querySelectorAll('.academy-state-inspection-round')).toHaveLength(8);
        expect(host.querySelectorAll('select')).toHaveLength(3);
        expect(host.querySelectorAll('input[type="radio"]')).toHaveLength(6);
        expect(host.querySelectorAll('input[type="text"]')).toHaveLength(2);
        expect(key.hidden).toBe(true);

        activity.payload.rounds.forEach((round, index) => {
            const row = host.querySelector<HTMLElement>(`[data-round-id="${round.id}"]`)!;
            if (round.interaction === 'state-select') {
                row.querySelector<HTMLSelectElement>('select')!.value = index === 0 ? round.options[1]!.value : round.answerValue;
            } else if (round.interaction === 'action-choice') {
                row.querySelector<HTMLInputElement>(`input[value="${round.answerValue}"]`)!.checked = true;
            } else {
                row.querySelector<HTMLInputElement>('input[type="text"]')!.value = round.answerValue;
            }
        });
        form.requestSubmit();
        await vi.waitFor(() => expect(evaluations).toEqual(['lapse']));
        await vi.waitFor(() => expect(key.hidden).toBe(false));
        expect(host.querySelectorAll<HTMLElement>('.academy-state-inspection-round:not([hidden])')).toHaveLength(1);

        const hint = host.querySelector<HTMLButtonElement>('.academy-state-inspection-hint')!;
        hint.click();
        hint.click();
        hint.click();
        hint.click();
        expect(host.querySelector<HTMLElement>('.academy-state-inspection-hint-output')?.dataset.hintIndex).toBe('3');
        expect(hint.disabled).toBe(true);
        expect(supportUse).toHaveBeenCalledTimes(3);
        returnButton.click();
        expect(document.activeElement).toBe(teaching.querySelector('h3'));
        expect(announce).toHaveBeenLastCalledWith('Returned to Sensei’s teaching.');

        host.querySelector<HTMLSelectElement>('[data-round-id="light-on"] select')!.value = activity.payload.rounds[0]!.answerValue;
        form.requestSubmit();
        await vi.waitFor(() => expect(evaluations).toEqual(['lapse', 'pass']));
        await vi.waitFor(() => expect(host.querySelector<HTMLElement>('.academy-state-inspection')?.dataset.outcome).toBe('pass'));
        replayButton.click();
        expect(host.querySelectorAll('.academy-state-inspection-round[hidden]')).toHaveLength(0);
        expect(host.querySelector('.academy-state-inspection-hint')).toBeNull();
        expect(key.hidden).toBe(true);
        expect(returnButton.hidden).toBe(true);
        expect(replayButton.hidden).toBe(true);
        expect(form.querySelectorAll<HTMLInputElement>('input:checked')).toHaveLength(0);
        expect([...form.querySelectorAll<HTMLInputElement>('input[type="text"]')].map(input => input.value)).toEqual(['', '']);
        controller.dispose();
    });

    it('restores all rows on remount and continues Robert’s cafe handoff to Ruparna', () => {
        const activityRuntime = runtime();
        for (let index = 0; index < 2; index += 1) {
            const host = document.createElement('main');
            const controller = activityRuntime.mount(model(), { replace(view) { host.replaceChildren(view); }, announce() {} }, () => {});
            expect(host.querySelectorAll('.academy-state-inspection-round')).toHaveLength(8);
            expect(host.querySelectorAll('.academy-state-inspection-round[hidden]')).toHaveLength(0);
            expect(host.querySelector<HTMLElement>('[data-answer-visibility="after-attempt"]')?.hidden).toBe(true);
            controller.dispose();
        }

        const beat = createLessonThirtyNineStateInspectionBeat();
        expect(beat.narrative.en).toContain('Robert');
        expect(beat.narrative.en).toContain('Ruparna');
        expect(beat.narrative.en).toContain('media room');
        const catalog = readFileSync(path.resolve('src/academy/content/lesson-activity-catalog.ts'), 'utf8');
        expect(catalog).toContain("case 'l2-l14':");
        expect(catalog).toContain("chapter('l2-l14', 's1e07-no-spoilers', 'ruparna'");
        expect(catalog).toContain('fresh replay of all eight inspections');
    });

    it('passes the shared reachable-chapter pedagogy gate', async () => {
        const chapter = await loadReachableLessonActivityChapter('l2-l14', { lookup: async () => null });
        expect(chapter?.lessonPackageId).toBe('l2-l14');
        const extension = createReachableLessonActivityExtension({
            language: 'en',
            chapter: chapter!,
            runtime: createActivityRuntime(ACADEMY_ACTIVITY_PLUGINS),
            pronunciation: { async play() { return { dispose() {} }; } },
            onEvaluation() {},
        });
        expect(extension?.activityCount).toBe(1);
    });

    it('pins unique source ownership, exact mirrors, offline assets, and honest lesson ledgers', () => {
        const lessonRoot = path.resolve('public/academy/content/lessons');
        const owners = readdirSync(lessonRoot).filter(filename => filename.endsWith('.json')).flatMap(filename => {
            const lesson = JSON.parse(readFileSync(path.join(lessonRoot, filename), 'utf8')) as {
                id?: string;
                order?: number;
                sourceCoverage?: { members?: Array<{ payloadSha256?: string }> };
            };
            return lesson.sourceCoverage?.members?.some(member => member.payloadSha256 === SOURCE_PAYLOAD_SHA256)
                ? [{ filename, id: lesson.id, order: lesson.order }]
                : [];
        });
        expect(owners).toEqual([{ filename: '041-l2-l14.json', id: 'l2-l14', order: 41 }]);

        model().provenance.moodle.sourceSheets.forEach((visual, index) => {
            const filename = path.basename(visual.url);
            const sourceImage = readFileSync(path.resolve('public/academy/content/lessons/l2-l14', filename));
            const hostedImage = readFileSync(path.resolve('docs/public/academy/content/lessons/l2-l14', filename));
            expect(sha256File(path.resolve('public/academy/content/lessons/l2-l14', filename))).toBe(SOURCE_VISUAL_SHA256[index]);
            expect(hostedImage).toEqual(sourceImage);
        });
        expect(sha256File(path.resolve('public/academy/content/lessons/041-l2-l14.json')))
            .toBe('d698fdb60de1a60efbb893e0e7bb02094c1332c0a514b1eb8f08d63f02e8b2cb');
        expect(filesHaveSameContent(path.resolve('docs/public/academy/content/lessons/041-l2-l14.json'), path.resolve('public/academy/content/lessons/041-l2-l14.json'))).toBe(true);
        expect(filesHaveSameContent(path.resolve('docs/public/academy/content/RESOURCE-LEDGER.json'), path.resolve('public/academy/content/RESOURCE-LEDGER.json'))).toBe(true);

        const ledger = JSON.parse(readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json'), 'utf8')) as {
            worksheetDigitisation: { additionalSlices: Array<Record<string, unknown>> };
        };
        expect(ledger.worksheetDigitisation.additionalSlices.find(slice => slice.lessonId === 'l2-l14')).toMatchObject({
            moodleModuleId: 8121267,
            sourcePackage: { filename: '041-l2-l14.json', sha256: 'd698fdb60de1a60efbb893e0e7bb02094c1332c0a514b1eb8f08d63f02e8b2cb' },
            sourceArchive: { id: 'archive-000087', sha256: 'ea0cf0b1def9dc28a54b407b1cd275b84287b64edba25ef5c3066f9eb5030e96' },
            audio: { status: 'quarantined-unresolved-pairing', sourceAudioMembers: 4, sourceAudioTracksDelivered: 0 },
            claims: {
                sourcePromptsDelivered: 8,
                yomuDerivedCompletions: 8,
                interactionModesAssessed: ['state-select', 'action-choice', 'typed-report'],
                sourceAnswerKeysExposed: 0,
                repairScope: 'missed-source-state-reports-only',
                earnedHintsPerMissedRow: 3,
                returnToTeaching: 'post-attempt-focus-return',
                revisitability: 'in-activity-replay-and-fresh-remount-restore-all-eight-source-rows',
            },
        });
        for (const worker of [
            readFileSync(path.resolve('public/academy/sw.js'), 'utf8'),
            readFileSync(path.resolve('docs/public/academy/sw.js'), 'utf8'),
        ]) {
            expect(worker).toContain("'/academy/content/lessons/041-l2-l14.json'");
            model().provenance.moodle.sourceSheets.forEach(visual => expect(worker).toContain(`'${visual.url}'`));
        }
        expect(readFileSync(path.resolve('docs/academy/discovery/ART-AND-AUDIO-LEDGER.md'), 'utf8'))
            .toContain('`l2-l14 / Chapter 29-1 resulting states`');
    });
});

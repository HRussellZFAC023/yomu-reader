import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createLessonFortyCompletionRepairBeat } from '../../src/academy/content/lesson-forty-completion-repair';
import { loadReachableLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import { ACADEMY_ACTIVITY_PLUGINS } from '../../src/academy/minigames';
import { completionRepairPlugin, type CompletionRepairModel } from '../../src/academy/minigames/completion-repair';
import { createReachableLessonActivityExtension } from '../../src/academy/ui/lesson-activity-chapter';

const SOURCE_PAYLOAD_SHA256 = 'c41e4dd83224a8c29a3e6eb07e7e7955a086e3fccbf4a93a5260efaedcf4e3b8';
const SOURCE_VISUAL_SHA256 = [
    '740c85dcc650f67e4fa84afccba19eea993e72730fdac67372daa8604299940b',
    'fc529706b6821d2629b213f7269306b971c5a40c1491cc9e382814fe3d183a39',
    'a126ab62a102564bb6f8d1ff807da6853009c860dc25be5434ec773afffb6983',
    '966e692b4e190de0d319635e84c536c1d4c2f1f1e983b36934271c3670692b98',
    '6f2aa526c4ff763da9fdf2773a090cfb06d860283ac35a5f046371b36b36e743',
] as const;

function model(): CompletionRepairModel {
    return createLessonFortyCompletionRepairBeat().activity as CompletionRepairModel;
}

function correctAnswers(activity: CompletionRepairModel) {
    return activity.payload.rounds.map(round => ({ roundId: round.id, value: round.answerValue }));
}

function runtime() {
    return createActivityRuntime([completionRepairPlugin]);
}

afterEach(() => document.body.replaceChildren());

describe('Lesson 40 Sensei Chapter 29-2 completion repair', () => {
    it('owns exact order 42 and teaches completion, intention, and regret before eight source prompts', () => {
        const activity = model();
        expect(ACADEMY_ACTIVITY_PLUGINS.map(plugin => plugin.kind)).toContain('academy-completion-repair');
        expect(runtime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            id: 'activity:l2-l15-sensei-completion-repair',
            kind: 'academy-completion-repair',
            responseKind: 'moodle-chapter-29-completion-and-regret-repair',
            provenance: {
                packageId: 'l2-l15',
                packageOrder: 42,
                answerVisibility: 'after-attempt',
                moodle: {
                    moduleId: 8121268,
                    archiveId: 'archive-000016',
                    answerKeyBasis: 'yomu-derived-completions-over-canonical-source-pages-and-prompts',
                    media: { status: 'audio-members-quarantined-unpaired', sourceAudioMembers: 3, sourceAudioTracksDelivered: 0 },
                },
                support: {
                    minna: { reference: 'Minna no Nihongo II · Lesson 29', reuse: 'chronology-and-scope-only' },
                    genki: { crosswalk: '≈ Genki L18 (grammar overlay)', reuse: 'sequence-only' },
                },
            },
        });
        expect(activity.payload.teaching.map(step => step.text)).toEqual(expect.arrayContaining([
            'Verb て-form しまいます／しまいました。',
            'Another function of 〜て しまいました is to indicate a feeling of regret or disappointment on the part of the speaker.',
        ]));
        expect(activity.payload.taskHeadings.map(heading => heading.sourceTask)).toEqual([1, 3, 4]);
        expect(activity.payload.rounds.map(round => round.sourcePrompt)).toEqual([
            '1）レポートは もう 書きました。 →',
            '2）夏休みの 宿題は 全部 やりました。 →',
            '3）スピーチは もう 覚えました。 →',
            '4）部屋は もう 片づけました。 →',
            '1）（メールの 返事を 書きます） →',
            '2）（この 資料を 作ります） →',
            '1）駅まで 走りました・電車は 行きました →',
            '2）タクシーで 行きました・約束の 時間に 遅れました →',
        ]);
        expect(activity.payload.rounds.map(round => round.interaction)).toEqual([
            'completion-select', 'completion-select', 'typed-transform', 'typed-transform',
            'finish-first-choice', 'finish-first-choice', 'typed-regret-link', 'typed-regret-link',
        ]);
        expect(activity.payload.rounds.every(round => round.hints.length === 3)).toBe(true);
        expect(activity.payload.rounds.map(round => round.sourceQuestionId)).toEqual([
            ...[1, 2, 3, 4].map(item => `moodle:8121268:${SOURCE_PAYLOAD_SHA256}:pdf-p1:task-1:q${item}`),
            ...[1, 2].map(item => `moodle:8121268:${SOURCE_PAYLOAD_SHA256}:pdf-p2:task-3:q${item}`),
            ...[1, 2].map(item => `moodle:8121268:${SOURCE_PAYLOAD_SHA256}:pdf-p3:task-4:q${item}`),
        ]);
    });

    it('grades every mode and emits repair review only for missed source rows', () => {
        const activity = model();
        expect(runtime().evaluate(activity, { answers: correctAnswers(activity) }).result)
            .toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });

        const lapse = runtime().evaluate(activity, {
            answers: correctAnswers(activity).map((answer, index) => index === 7
                ? { ...answer, value: 'タクシーで行きました。' }
                : answer),
        });
        expect(lapse.result).toMatchObject({
            outcome: 'lapse',
            score: 7 / 8,
            errorTags: ['l2-l15-completion-repair-8'],
        });
        expect(lapse.reviewSeeds.map(seed => seed.sourceQuestionId)).toEqual([
            `moodle:8121268:${SOURCE_PAYLOAD_SHA256}:pdf-p3:task-4:q2`,
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

        const teaching = host.querySelector<HTMLElement>('.academy-completion-repair-teaching')!;
        const sources = host.querySelector<HTMLElement>('.academy-completion-repair-sources')!;
        const form = host.querySelector<HTMLFormElement>('form')!;
        const key = host.querySelector<HTMLElement>('[data-answer-visibility="after-attempt"]')!;
        const returnButton = host.querySelector<HTMLButtonElement>('.academy-state-inspection-return')!;
        const replayButton = host.querySelector<HTMLButtonElement>('.academy-state-inspection-replay')!;
        expect(teaching.compareDocumentPosition(sources) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(sources.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(host.querySelectorAll('.academy-completion-repair-sources img')).toHaveLength(5);
        expect(host.querySelectorAll('.academy-completion-repair-round')).toHaveLength(8);
        expect(host.querySelectorAll('select')).toHaveLength(2);
        expect(host.querySelectorAll('input[type="radio"]')).toHaveLength(4);
        expect(host.querySelectorAll('input[type="text"]')).toHaveLength(4);
        expect(key.hidden).toBe(true);

        activity.payload.rounds.forEach((round, index) => {
            const row = host.querySelector<HTMLElement>(`[data-round-id="${round.id}"]`)!;
            if (round.interaction === 'completion-select') {
                row.querySelector<HTMLSelectElement>('select')!.value = index === 0 ? round.options[1]!.value : round.answerValue;
            } else if (round.interaction === 'finish-first-choice') {
                row.querySelector<HTMLInputElement>(`input[value="${round.answerValue}"]`)!.checked = true;
            } else {
                row.querySelector<HTMLInputElement>('input[type="text"]')!.value = round.answerValue;
            }
        });
        form.requestSubmit();
        await vi.waitFor(() => expect(evaluations).toEqual(['lapse']));
        await vi.waitFor(() => expect(key.hidden).toBe(false));
        expect(host.querySelectorAll<HTMLElement>('.academy-completion-repair-round:not([hidden])')).toHaveLength(1);

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

        host.querySelector<HTMLSelectElement>('[data-round-id="report-written"] select')!.value = activity.payload.rounds[0]!.answerValue;
        form.requestSubmit();
        await vi.waitFor(() => expect(evaluations).toEqual(['lapse', 'pass']));
        await vi.waitFor(() => expect(host.querySelector<HTMLElement>('.academy-completion-repair')?.dataset.outcome).toBe('pass'));
        replayButton.click();
        expect(host.querySelectorAll('.academy-completion-repair-round[hidden]')).toHaveLength(0);
        expect(host.querySelector('.academy-state-inspection-hint')).toBeNull();
        expect(key.hidden).toBe(true);
        expect(returnButton.hidden).toBe(true);
        expect(replayButton.hidden).toBe(true);
        expect(form.querySelectorAll<HTMLInputElement>('input:checked')).toHaveLength(0);
        expect([...form.querySelectorAll<HTMLInputElement>('input[type="text"]')].map(input => input.value)).toEqual(['', '', '', '']);
        controller.dispose();
    });

    it('restores every row on remount and continues Ruparna’s handoff to Christian', () => {
        const activityRuntime = runtime();
        for (let index = 0; index < 2; index += 1) {
            const host = document.createElement('main');
            const controller = activityRuntime.mount(model(), { replace(view) { host.replaceChildren(view); }, announce() {} }, () => {});
            expect(host.querySelectorAll('.academy-completion-repair-round')).toHaveLength(8);
            expect(host.querySelectorAll('.academy-completion-repair-round[hidden]')).toHaveLength(0);
            expect(host.querySelector<HTMLElement>('[data-answer-visibility="after-attempt"]')?.hidden).toBe(true);
            controller.dispose();
        }

        const beat = createLessonFortyCompletionRepairBeat();
        expect(beat.narrative.en).toContain('Ruparna');
        expect(beat.narrative.en).toContain('Christian');
        expect(beat.narrative.en).toContain('classroom');
        const catalog = readFileSync(path.resolve('src/academy/content/lesson-activity-catalog.ts'), 'utf8');
        expect(catalog).toContain("case 'l2-l15':");
        expect(catalog).toContain("chapter('l2-l15', 's1e07-no-spoilers', 'ruparna'");
        expect(catalog).toContain('fresh replay of all eight repairs');
    });

    it('passes the shared reachable-chapter pedagogy gate', async () => {
        const chapter = await loadReachableLessonActivityChapter('l2-l15', { lookup: async () => null });
        expect(chapter?.lessonPackageId).toBe('l2-l15');
        const extension = createReachableLessonActivityExtension({
            language: 'en',
            chapter: chapter!,
            runtime: createActivityRuntime(ACADEMY_ACTIVITY_PLUGINS),
            pronunciation: { async play() { return { dispose() {} }; } },
            onEvaluation() {},
        });
        expect(extension?.activityCount).toBe(1);
    });

    it('pins unique package ownership, exact mirrors, offline assets, and honest lesson ledgers', () => {
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
        expect(owners).toEqual([{ filename: '042-l2-l15.json', id: 'l2-l15', order: 42 }]);

        model().provenance.moodle.sourceSheets.forEach((visual, index) => {
            const filename = path.basename(visual.url);
            const sourceImage = readFileSync(path.resolve('public/academy/content/lessons/l2-l15', filename));
            const hostedImage = readFileSync(path.resolve('docs/public/academy/content/lessons/l2-l15', filename));
            expect(createHash('sha256').update(sourceImage).digest('hex')).toBe(SOURCE_VISUAL_SHA256[index]);
            expect(hostedImage).toEqual(sourceImage);
        });
        const sourcePackage = readFileSync(path.resolve('public/academy/content/lessons/042-l2-l15.json'));
        expect(createHash('sha256').update(sourcePackage).digest('hex'))
            .toBe('abefe9aae6730274afc8bc184eec221c64e7848df84ae5fb8cb235487c6c6da9');
        expect(readFileSync(path.resolve('docs/public/academy/content/lessons/042-l2-l15.json'))).toEqual(sourcePackage);
        expect(readFileSync(path.resolve('docs/public/academy/content/RESOURCE-LEDGER.json')))
            .toEqual(readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json')));

        const ledger = JSON.parse(readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json'), 'utf8')) as {
            worksheetDigitisation: { additionalSlices: Array<Record<string, unknown>> };
        };
        expect(ledger.worksheetDigitisation.additionalSlices.find(slice => slice.lessonId === 'l2-l15')).toMatchObject({
            moodleModuleId: 8121268,
            sourcePackage: { filename: '042-l2-l15.json', sha256: 'abefe9aae6730274afc8bc184eec221c64e7848df84ae5fb8cb235487c6c6da9' },
            sourceArchive: { id: 'archive-000016', sha256: '28c25403e44ae113f3fd934f1485df26b79da4beddb31b24cfa8fe969913cd92' },
            audio: { status: 'quarantined-unresolved-pairing', sourceAudioMembers: 3, sourceAudioTracksDelivered: 0 },
            claims: {
                sourcePromptsDelivered: 8,
                yomuDerivedCompletions: 8,
                interactionModesAssessed: ['completion-select', 'typed-transform', 'finish-first-choice', 'typed-regret-link'],
                sourceAnswerKeysExposed: 0,
                repairScope: 'missed-source-completion-and-regret-responses-only',
                earnedHintsPerMissedRow: 3,
                returnToTeaching: 'post-attempt-focus-return',
                revisitability: 'in-activity-replay-and-fresh-remount-restore-all-eight-source-rows',
            },
        });
        for (const worker of [
            readFileSync(path.resolve('public/academy/sw.js'), 'utf8'),
            readFileSync(path.resolve('docs/public/academy/sw.js'), 'utf8'),
        ]) {
            expect(worker).toContain("'/academy/content/lessons/042-l2-l15.json'");
            model().provenance.moodle.sourceSheets.forEach(visual => expect(worker).toContain(`'${visual.url}'`));
        }
        expect(readFileSync(path.resolve('docs/academy/discovery/ART-AND-AUDIO-LEDGER.md'), 'utf8'))
            .toContain('`l2-l15 / Chapter 29-2 completion and regret`');
    });
});

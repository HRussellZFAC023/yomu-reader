import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { createLessonFortyOnePreparedStateAuditBeat } from '../../src/academy/content/lesson-forty-one-prepared-state-audit';
import { loadReachableLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import { ACADEMY_ACTIVITY_PLUGINS } from '../../src/academy/minigames';
import { stateInspectionPlugin, type StateInspectionModel } from '../../src/academy/minigames/state-inspection';
import { createReachableLessonActivityExtension } from '../../src/academy/ui/lesson-activity-chapter';

const SOURCE_PAYLOADS = [
    'a24f5e14a09ee74f45855296fa1a0df00775a7e9037c0ec6fc350e6b98a26db8',
    '0db539c444b66c4e83424da858d8206c2dfa0e34f80c3d4342605a20ff9ecada',
    '1c3abd70bbd7971c9bdb119d400634d088356bb22c68495daf9a722b46ed9cf9',
    'ec9736ce5fe4c09b825ad9d47cf216821f7ac96ac461b05f5ab5a85f63ac898e',
] as const;
const SOURCE_VISUAL_SHA256 = [
    '1152918885025693d42f59d0844e315acf7aacf0fa1747ba5509aac317dd38e1',
    '5bbae29bcf083f2b9f6c1843c1848b32bbe294b2079ed2528bff2ceea3c12754',
    '5d9c9a9e3a2b241eb3a31ff96855f2ce24e0987dd6a1c5b5f632226b181d535c',
    'b8786e398c80109f92caa5fd9cf9ec129348f1ff541005d5e592f4b7a21a9cd6',
    'ddc590cf0270e321e98b933ccc2972798367051343e3ca221f88bcfc5dcc430f',
    '9f98114f963287be60c3ab2074af0823c229d078cff290fc15a0c0008853016f',
    'e44924a1d24809feaa577fb59c0ca90b64fded5743fba2d3ede3457a4b78529d',
    'db345d3097b5e664a19d1274c3c0eda961f6406ac6ac9536614518c45de86556',
] as const;

function model(): StateInspectionModel {
    return createLessonFortyOnePreparedStateAuditBeat().activity as StateInspectionModel;
}

function correctAnswers(activity: StateInspectionModel) {
    return activity.payload.rounds.map(round => ({ roundId: round.id, value: round.answerValue }));
}

function runtime() {
    return createActivityRuntime([stateInspectionPlugin]);
}

afterEach(() => document.body.replaceChildren());

describe('Lesson 41 Sensei Chapter 30 prepared-state audit', () => {
    it('claims exact order 43 and projects Sensei vocabulary with purposeful prepared-state prompts', () => {
        const activity = model();
        expect(runtime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            id: 'activity:l2-l16-sensei-prepared-state-audit',
            responseKind: 'moodle-chapter-30-prepared-state-audit',
            provenance: {
                packageId: 'l2-l16',
                packageOrder: 43,
                answerVisibility: 'after-attempt',
                moodle: {
                    moduleId: 8121269,
                    archiveId: 'archive-000066',
                    media: { status: 'audio-members-quarantined-unpaired', sourceAudioMembers: 3, sourceAudioTracksDelivered: 0 },
                },
                support: {
                    minna: { reference: 'Minna no Nihongo II · Lesson 30', reuse: 'chronology-and-scope-only' },
                    genki: { crosswalk: '≈ Genki II · Prepared resultant states', reuse: 'sequence-only' },
                },
            },
        });
        expect(activity.payload.teaching.map(step => step.text)).toEqual(expect.arrayContaining([
            'Verb て-form あります／ありません。',
            'Verb て-form あります indicates a continuing state resulting from a purposeful action. Transitive verbs are used for this.',
        ]));
        expect(activity.payload.taskHeadings.map(heading => heading.sourceTask)).toEqual([6, 2, 'room-a']);
        expect(activity.payload.rounds.map(round => round.interaction)).toEqual([
            'state-select', 'state-select', 'state-select',
            'action-choice', 'action-choice',
            'typed-report', 'typed-report', 'typed-report',
        ]);
        expect(activity.payload.rounds.every(round => round.hints.length === 3)).toBe(true);
        expect(activity.payload.rounds.map(round => round.sourceQuestionId)).toEqual([
            ...[1, 2, 3].map(item => `moodle:8121269:${SOURCE_PAYLOADS[2]}:pdf-p3:task-6:q${item}`),
            ...[1, 2, 3, 4].map(item => `moodle:8121269:${SOURCE_PAYLOADS[2]}:pdf-p2:task-2:q${item}`),
            `moodle:8121269:${SOURCE_PAYLOADS[3]}:pdf-p1:task-1:room-a:q1`,
        ]);
    });

    it('grades every mode and emits repair review only for a missed source row', () => {
        const activity = model();
        expect(runtime().evaluate(activity, { answers: correctAnswers(activity) }).result)
            .toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });

        const lapse = runtime().evaluate(activity, {
            answers: correctAnswers(activity).map((answer, index) => index === 6
                ? { ...answer, value: 'コピーの紙はコピー機です。' }
                : answer),
        });
        expect(lapse.result).toMatchObject({
            outcome: 'lapse',
            score: 7 / 8,
            errorTags: ['l2-l16-prepared-state-7'],
        });
        expect(lapse.reviewSeeds.map(seed => seed.sourceQuestionId)).toEqual([
            `moodle:8121269:${SOURCE_PAYLOADS[2]}:pdf-p2:task-2:q4`,
        ]);
    });

    it('teaches first, conceals answers, repairs only one miss, bounds hints, returns, and replays', async () => {
        const activity = model();
        const host = document.createElement('main');
        const supportUse = vi.fn();
        const announce = vi.fn();
        const outcomes: string[] = [];
        const controller = runtime().mount(activity, {
            language: 'en',
            replace(view) { host.replaceChildren(view); },
            announce,
            recordSupportUse: supportUse,
        }, evaluation => { outcomes.push(evaluation.result.outcome); });
        document.body.append(host);

        const teaching = host.querySelector<HTMLElement>('.academy-state-inspection-teaching')!;
        const sources = host.querySelector<HTMLElement>('.academy-state-inspection-sources')!;
        const form = host.querySelector<HTMLFormElement>('form')!;
        const key = host.querySelector<HTMLElement>('[data-answer-visibility="after-attempt"]')!;
        expect(teaching.compareDocumentPosition(sources) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(sources.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(host.querySelectorAll('.academy-state-inspection-source img')).toHaveLength(8);
        expect(host.querySelectorAll('.academy-state-inspection-round')).toHaveLength(8);
        expect(host.querySelectorAll('select')).toHaveLength(3);
        expect(host.querySelectorAll('input[type="radio"]')).toHaveLength(4);
        expect(host.querySelectorAll('input[type="text"]')).toHaveLength(3);
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
        await vi.waitFor(() => expect(outcomes).toEqual(['lapse']));
        await vi.waitFor(() => expect(key.hidden).toBe(false));
        expect(host.querySelectorAll<HTMLElement>('.academy-state-inspection-round:not([hidden])')).toHaveLength(1);

        const hintButton = host.querySelector<HTMLButtonElement>('.academy-state-inspection-hint')!;
        hintButton.click(); hintButton.click(); hintButton.click(); hintButton.click();
        expect(host.querySelector<HTMLElement>('.academy-state-inspection-hint-output')?.dataset.hintIndex).toBe('3');
        expect(hintButton.disabled).toBe(true);
        expect(supportUse).toHaveBeenCalledTimes(3);

        host.querySelector<HTMLButtonElement>('.academy-state-inspection-return')!.click();
        expect(document.activeElement).toBe(teaching.querySelector('h3'));
        expect(announce).toHaveBeenLastCalledWith('Returned to Sensei’s teaching.');
        host.querySelector<HTMLSelectElement>('[data-round-id="window-neutral"] select')!.value = activity.payload.rounds[0]!.answerValue;
        form.requestSubmit();
        await vi.waitFor(() => expect(outcomes).toEqual(['lapse', 'pass']));
        await vi.waitFor(() => expect(host.querySelector<HTMLElement>('.academy-prepared-state-audit')?.dataset.outcome).toBe('pass'));

        host.querySelector<HTMLButtonElement>('.academy-state-inspection-replay')!.click();
        expect(host.querySelectorAll('.academy-state-inspection-round[hidden]')).toHaveLength(0);
        expect(key.hidden).toBe(true);
        expect(host.querySelector('.academy-state-inspection-hint')).toBeNull();
        controller.dispose();
    });

    it('restores every row on revisit and continues Angel and Christian after Lesson 40', async () => {
        const activityRuntime = runtime();
        for (let index = 0; index < 2; index += 1) {
            const host = document.createElement('main');
            const controller = activityRuntime.mount(model(), { replace(view) { host.replaceChildren(view); }, announce() {} }, () => {});
            expect(host.querySelectorAll('.academy-state-inspection-round')).toHaveLength(8);
            expect(host.querySelectorAll('.academy-state-inspection-round[hidden]')).toHaveLength(0);
            expect(host.querySelector<HTMLElement>('[data-answer-visibility="after-attempt"]')?.hidden).toBe(true);
            controller.dispose();
        }

        expect(createLessonFortyOnePreparedStateAuditBeat().narrative.en).toContain('Christian');
        expect(createLessonFortyOnePreparedStateAuditBeat().narrative.en).toContain('Angel');
        const chapter = await loadReachableLessonActivityChapter('l2-l16', { lookup: async () => null });
        expect(chapter?.lessonPackageId).toBe('l2-l16');
        expect(chapter?.canonicalEpisodeId).toBe('s1e07-no-spoilers');
        expect(chapter?.introduction.en).toContain('dropped phone');
        const extension = createReachableLessonActivityExtension({
            language: 'en', chapter: chapter!, runtime: createActivityRuntime(ACADEMY_ACTIVITY_PLUGINS),
            pronunciation: { async play() { return { dispose() {} }; } }, onEvaluation() {},
        });
        expect(extension?.activityCount).toBe(1);
    });

    it('pins unique package ownership, mirrored assets, offline entries, and honest ledgers', () => {
        const lessonRoot = path.resolve('public/academy/content/lessons');
        for (const payloadSha256 of SOURCE_PAYLOADS) {
            const owners = readdirSync(lessonRoot).filter(filename => filename.endsWith('.json')).flatMap(filename => {
                const lesson = JSON.parse(readFileSync(path.join(lessonRoot, filename), 'utf8')) as {
                    id?: string; order?: number; sourceCoverage?: { members?: Array<{ payloadSha256?: string }> };
                };
                return lesson.sourceCoverage?.members?.some(member => member.payloadSha256 === payloadSha256)
                    ? [{ filename, id: lesson.id, order: lesson.order }]
                    : [];
            });
            expect(owners).toEqual([{ filename: '043-l2-l16.json', id: 'l2-l16', order: 43 }]);
        }

        model().provenance.moodle.sourceSheets.forEach((visual, index) => {
            const filename = path.basename(visual.url);
            const sourceImage = readFileSync(path.resolve('public/academy/content/lessons/l2-l16', filename));
            const hostedImage = readFileSync(path.resolve('docs/public/academy/content/lessons/l2-l16', filename));
            expect(createHash('sha256').update(sourceImage).digest('hex')).toBe(SOURCE_VISUAL_SHA256[index]);
            expect(hostedImage).toEqual(sourceImage);
        });
        const sourcePackage = readFileSync(path.resolve('public/academy/content/lessons/043-l2-l16.json'));
        expect(createHash('sha256').update(sourcePackage).digest('hex'))
            .toBe('04ad279a9667497f6419123300eb137f8f4fd4c08fd35cba9ab99427da87e396');
        expect(readFileSync(path.resolve('docs/public/academy/content/lessons/043-l2-l16.json'))).toEqual(sourcePackage);
        expect(readFileSync(path.resolve('docs/public/academy/content/RESOURCE-LEDGER.json')))
            .toEqual(readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json')));

        const ledger = JSON.parse(readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json'), 'utf8')) as {
            worksheetDigitisation: { additionalSlices: Array<Record<string, unknown>> };
        };
        expect(ledger.worksheetDigitisation.additionalSlices.find(slice => slice.lessonId === 'l2-l16')).toMatchObject({
            moodleModuleId: 8121269,
            sourcePackage: { filename: '043-l2-l16.json', sha256: '04ad279a9667497f6419123300eb137f8f4fd4c08fd35cba9ab99427da87e396' },
            sourceArchive: { id: 'archive-000066', sha256: 'bae6d71c2784284c17a6bea25cbcc4a4fb75d410193f27c9ce2484d4efd53d32' },
            audio: { status: 'quarantined-unresolved-pairing', sourceAudioMembers: 3, sourceAudioTracksDelivered: 0 },
            claims: {
                vocabularySheetPagesRendered: 2,
                sourcePromptsDelivered: 8,
                sourceAnswerKeysExposed: 0,
                repairScope: 'missed-source-prepared-state-reports-only',
                earnedHintsPerMissedRow: 3,
                returnToTeaching: 'post-attempt-focus-return',
                revisitability: 'in-activity-replay-and-fresh-remount-restore-all-eight-source-rows',
            },
        });
        for (const worker of [
            readFileSync(path.resolve('public/academy/sw.js'), 'utf8'),
            readFileSync(path.resolve('docs/public/academy/sw.js'), 'utf8'),
        ]) {
            expect(worker).toContain("'/academy/content/lessons/043-l2-l16.json'");
            model().provenance.moodle.sourceSheets.forEach(visual => expect(worker).toContain(`'${visual.url}'`));
        }
        expect(readFileSync(path.resolve('docs/academy/discovery/ART-AND-AUDIO-LEDGER.md'), 'utf8'))
            .toContain('`l2-l16 / Chapter 30 prepared states`');
    });
});

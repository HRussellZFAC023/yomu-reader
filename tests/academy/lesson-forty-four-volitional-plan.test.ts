import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createLessonFortyFourVolitionalPlanBeat } from '../../src/academy/content/lesson-forty-four-volitional-plan';
import { loadReachableLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import { ACADEMY_ACTIVITY_PLUGINS } from '../../src/academy/minigames';
import { stateInspectionPlugin, type StateInspectionModel } from '../../src/academy/minigames/state-inspection';

const PACKAGE_SHA256 = '5be73c8311e5fab0284cb875eab140b6e110e7691e4cdc8fec58570987232c06';

function model(): StateInspectionModel {
    return createLessonFortyFourVolitionalPlanBeat().activity as StateInspectionModel;
}

function correctAnswers(activity: StateInspectionModel) {
    return activity.payload.rounds.map(round => ({ roundId: round.id, value: round.answerValue }));
}

function runtime() {
    return createActivityRuntime([stateInspectionPlugin]);
}

afterEach(() => document.body.replaceChildren());

describe('Lesson 44 Sensei Chapter 31 volitional plan', () => {
    it('claims the first unowned later package and keeps all source boundaries honest', () => {
        const activity = model();
        expect(runtime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            id: 'activity:l2-l19-sensei-volitional-plan',
            responseKind: 'moodle-chapter-31-volitional-plan',
            provenance: {
                packageId: 'l2-l19', packageOrder: 46, answerVisibility: 'after-attempt',
                moodle: {
                    moduleId: 8121273, archiveId: 'archive-000084',
                    media: { status: 'no-audio-members-in-package', sourceAudioMembers: 0, sourceAudioTracksDelivered: 0 },
                },
                support: {
                    minna: { reference: 'Minna no Nihongo II · Lesson 31', reuse: 'chronology-and-scope-only' },
                    genki: { crosswalk: '≈ Genki II · Volitional form and intentions', reuse: 'sequence-only' },
                },
            },
        });
        expect(activity.provenance.moodle.sourceSheets).toHaveLength(4);
        expect(activity.payload.taskHeadings.map(item => item.text)).toEqual([
            '1: Check √ to create Volitional form of verbs.',
            '2: Try again! How to classify and create Potential forms. Please fill in the brackets.',
            '3: Please complete the chart. If you don’t know the meaning, please check them.',
        ]);
        expect(activity.payload.rounds.map(round => round.interaction)).toEqual([
            'action-choice', 'typed-report', 'state-select', 'typed-report',
            'typed-report', 'state-select', 'action-choice', 'typed-report',
        ]);
        expect(activity.payload.rounds.every(round => round.hints.length === 3)).toBe(true);
        expect(activity.payload.rounds.every(round => round.sourceQuestionId.includes('4da024b1ca32facc7b41b03895910d6bc681f98c7116d5789780b7d220f4a2a5')))
            .toBe(true);
    });

    it('grades exact rows and seeds only a missed source row for repair', () => {
        const activity = model();
        expect(runtime().evaluate(activity, { answers: correctAnswers(activity) }).result)
            .toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });

        const lapse = runtime().evaluate(activity, {
            answers: correctAnswers(activity).map((answer, index) => index === 6
                ? { ...answer, value: '申し込みよう' }
                : answer),
        });
        expect(lapse.result).toMatchObject({
            outcome: 'lapse', score: 7 / 8, errorTags: ['l2-l19-volitional-7'],
        });
        expect(lapse.reviewSeeds).toHaveLength(1);
        expect(lapse.reviewSeeds[0]?.sourceQuestionId)
            .toBe('moodle:8121273:4da024b1ca32facc7b41b03895910d6bc681f98c7116d5789780b7d220f4a2a5:pdf-p2:task-3:q3');
    });

    it('puts the four exact source pages before a varied answer-gated activity with bounded repair and replay', async () => {
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
        expect(host.querySelectorAll('.academy-state-inspection-source img')).toHaveLength(4);
        expect(host.querySelectorAll('.academy-state-inspection-round')).toHaveLength(8);
        expect(host.querySelectorAll('select')).toHaveLength(2);
        expect(host.querySelectorAll('input[type="radio"]')).toHaveLength(4);
        expect(host.querySelectorAll('input[type="text"]')).toHaveLength(4);
        expect(host.querySelector<HTMLElement>('[data-answer-visibility="after-attempt"]')?.hidden).toBe(true);
        expect(host.querySelector('.academy-state-inspection-hints')).toBeNull();

        activity.payload.rounds.forEach((round, index) => {
            const row = host.querySelector<HTMLElement>(`[data-round-id="${round.id}"]`)!;
            const value = index === 0 ? 'うたいよう' : round.answerValue;
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
        expect(form.querySelectorAll<HTMLInputElement>('input:checked')).toHaveLength(0);
        controller.dispose();

        const revisit = document.createElement('main');
        const remounted = runtime().mount(model(), { replace(view) { revisit.replaceChildren(view); }, announce() {} }, () => {});
        expect(revisit.querySelectorAll('.academy-state-inspection-round')).toHaveLength(8);
        expect(revisit.querySelector('.academy-state-inspection-hints')).toBeNull();
        expect(revisit.querySelector<HTMLElement>('[data-answer-visibility="after-attempt"]')?.hidden).toBe(true);
        remounted.dispose();
    });

    it('wires source mirrors, precache, ledger, and reachable registry', async () => {
        const activity = model();
        for (const visual of activity.provenance.moodle.sourceSheets) {
            const filename = path.basename(visual.url);
            const source = readFileSync(path.resolve('public/academy/content/lessons/l2-l19', filename));
            const hosted = readFileSync(path.resolve('docs/public/academy/content/lessons/l2-l19', filename));
            expect(createHash('sha256').update(source).digest('hex')).toBe(visual.sha256);
            expect(hosted).toEqual(source);
        }
        const sourcePackage = readFileSync(path.resolve('public/academy/content/lessons/046-l2-l19.json'));
        expect(createHash('sha256').update(sourcePackage).digest('hex')).toBe(PACKAGE_SHA256);
        expect(readFileSync(path.resolve('docs/public/academy/content/lessons/046-l2-l19.json'))).toEqual(sourcePackage);
        for (const workerPath of ['public/academy/sw.js', 'docs/public/academy/sw.js']) {
            const worker = readFileSync(path.resolve(workerPath), 'utf8');
            expect(worker).toContain("'/academy/content/lessons/046-l2-l19.json'");
            activity.provenance.moodle.sourceSheets.forEach(visual => expect(worker).toContain(`'${visual.url}'`));
        }
        expect(readFileSync(path.resolve('docs/public/academy/content/RESOURCE-LEDGER.json')))
            .toEqual(readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json')));
        const ledger = JSON.parse(readFileSync(path.resolve('public/academy/content/RESOURCE-LEDGER.json'), 'utf8'));
        const slice = ledger.worksheetDigitisation.additionalSlices.find((item: { lessonId: string }) => item.lessonId === 'l2-l19');
        expect(slice).toMatchObject({
            moodleModuleId: 8121273,
            audio: { status: 'no-audio-members-in-exact-package', sourceAudioMembers: 0, sourceAudioTracksDelivered: 0 },
            claims: { sourcePromptsDelivered: 8, yomuDerivedCompletions: 8, earnedHintsPerMissedRow: 3 },
        });
        expect(readFileSync(path.resolve('docs/academy/discovery/ART-AND-AUDIO-LEDGER.md'), 'utf8'))
            .toContain('`l2-l19 / Chapter 31 volitional form`');

        const chapter = await loadReachableLessonActivityChapter('l2-l19', { lookup: async () => null });
        expect(chapter?.lessonPackageId).toBe('l2-l19');
        expect(createActivityRuntime(ACADEMY_ACTIVITY_PLUGINS).validate(chapter!.beats[0]!.activity as StateInspectionModel)).toEqual([]);
    });
});

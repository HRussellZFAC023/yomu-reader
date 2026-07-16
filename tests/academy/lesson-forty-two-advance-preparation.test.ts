import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createLessonFortyTwoAdvancePreparationBeat } from '../../src/academy/content/lesson-forty-two-advance-preparation';
import { loadReachableLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import { ACADEMY_ACTIVITY_PLUGINS } from '../../src/academy/minigames';
import { stateInspectionPlugin, type StateInspectionModel } from '../../src/academy/minigames/state-inspection';
import { createReachableLessonActivityExtension } from '../../src/academy/ui/lesson-activity-chapter';

function model(): StateInspectionModel {
    return createLessonFortyTwoAdvancePreparationBeat().activity as StateInspectionModel;
}

function correctAnswers(activity: StateInspectionModel) {
    return activity.payload.rounds.map(round => ({ roundId: round.id, value: round.answerValue }));
}

function runtime() {
    return createActivityRuntime([stateInspectionPlugin]);
}

afterEach(() => document.body.replaceChildren());

describe('Lesson 42 Sensei Chapter 30 advance preparation', () => {
    it('claims exact order 44, displays Sensei vocabulary and grammar first, and validates', () => {
        const activity = model();
        expect(runtime().validate(activity)).toEqual([]);
        expect(activity).toMatchObject({
            id: 'activity:l2-l17-sensei-advance-preparation',
            responseKind: 'moodle-chapter-30-advance-preparation',
            provenance: {
                packageId: 'l2-l17',
                packageOrder: 44,
                answerVisibility: 'after-attempt',
                moodle: {
                    moduleId: 8121270,
                    archiveId: 'archive-000008',
                    media: { status: 'audio-members-quarantined-unpaired', sourceAudioMembers: 4, sourceAudioTracksDelivered: 0 },
                },
                support: {
                    minna: { reference: 'Minna no Nihongo II · Lesson 30', reuse: 'chronology-and-scope-only' },
                    genki: { crosswalk: '≈ Genki II · Advance preparation and leaving things as they are', reuse: 'sequence-only' },
                },
            },
        });
        expect(activity.provenance.moodle.sourceSheets).toHaveLength(8);
        expect(activity.provenance.moodle.sourceSheets.slice(-2).every(sheet => sheet.title === 'New Chapter 30-2 Vocabulary Sheet')).toBe(true);
        expect(activity.payload.teaching.map(step => step.text)).toEqual(expect.arrayContaining([
            'Verb て-form おきます／おいてください。',
            'Verb て-form おきます indicates a purposeful action. Transitive verbs are used for this.',
        ]));
        expect(activity.payload.rounds.map(round => round.interaction)).toEqual([
            'action-choice', 'action-choice', 'typed-report', 'typed-report',
            'state-select', 'typed-report', 'state-select', 'action-choice',
        ]);
        expect(activity.payload.rounds.every(round => round.hints.length === 3)).toBe(true);
    });

    it('grades all eight prompts and repairs only the missed source row', () => {
        const activity = model();
        expect(runtime().evaluate(activity, { answers: correctAnswers(activity) }).result)
            .toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });

        const lapse = runtime().evaluate(activity, {
            answers: correctAnswers(activity).map((answer, index) => index === 5
                ? { ...answer, value: 'はさみをそのままです。' }
                : answer),
        });
        expect(lapse.result).toMatchObject({
            outcome: 'lapse',
            score: 7 / 8,
            errorTags: ['l2-l17-advance-preparation-6'],
        });
        expect(lapse.reviewSeeds).toHaveLength(1);
        expect(lapse.reviewSeeds[0]?.sourceQuestionId).toContain(':pdf-p3:task-2:q2');
    });

    it('renders source teaching before fair varied assessment and supports replay', async () => {
        const activity = model();
        const host = document.createElement('main');
        const outcomes: string[] = [];
        const controller = runtime().mount(activity, {
            language: 'en',
            replace(view) { host.replaceChildren(view); },
            announce() {},
        }, evaluation => { outcomes.push(evaluation.result.outcome); });
        document.body.append(host);

        const teaching = host.querySelector<HTMLElement>('.academy-state-inspection-teaching')!;
        const sources = host.querySelector<HTMLElement>('.academy-state-inspection-sources')!;
        const form = host.querySelector<HTMLFormElement>('form')!;
        expect(teaching.compareDocumentPosition(sources) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(sources.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(host.querySelectorAll('.academy-state-inspection-source img')).toHaveLength(8);
        expect(host.querySelectorAll('.academy-state-inspection-round')).toHaveLength(8);
        expect(host.querySelectorAll('select')).toHaveLength(2);
        expect(host.querySelectorAll('input[type="radio"]')).toHaveLength(6);
        expect(host.querySelectorAll('input[type="text"]')).toHaveLength(3);
        expect(host.querySelector<HTMLElement>('[data-answer-visibility="after-attempt"]')?.hidden).toBe(true);

        activity.payload.rounds.forEach(round => {
            const row = host.querySelector<HTMLElement>(`[data-round-id="${round.id}"]`)!;
            if (round.interaction === 'state-select') row.querySelector<HTMLSelectElement>('select')!.value = round.answerValue;
            else if (round.interaction === 'action-choice') row.querySelector<HTMLInputElement>(`input[value="${round.answerValue}"]`)!.checked = true;
            else row.querySelector<HTMLInputElement>('input[type="text"]')!.value = round.answerValue;
        });
        form.requestSubmit();
        await vi.waitFor(() => expect(outcomes).toEqual(['pass']));
        host.querySelector<HTMLButtonElement>('.academy-state-inspection-replay')!.click();
        expect(host.querySelectorAll('.academy-state-inspection-round[hidden]')).toHaveLength(0);
        expect(host.querySelector<HTMLElement>('[data-answer-visibility="after-attempt"]')?.hidden).toBe(true);
        controller.dispose();
    });

    it('is reachable as one runtime activity and continues the Lesson 41 story', async () => {
        const chapter = await loadReachableLessonActivityChapter('l2-l17', { lookup: async () => null });
        expect(chapter?.lessonPackageId).toBe('l2-l17');
        expect(chapter?.canonicalEpisodeId).toBe('s1e07-no-spoilers');
        expect(chapter?.introduction.en).toContain('Angel');
        expect(chapter?.introduction.en).toContain('Chapter 30-2');
        const extension = createReachableLessonActivityExtension({
            language: 'en', chapter: chapter!, runtime: createActivityRuntime(ACADEMY_ACTIVITY_PLUGINS),
            pronunciation: { async play() { return { dispose() {} }; } }, onEvaluation() {},
        });
        expect(extension?.activityCount).toBe(1);
    });

    it('pins mirrored source pages, package identity, and offline delivery', () => {
        for (const visual of model().provenance.moodle.sourceSheets) {
            const filename = path.basename(visual.url);
            const source = readFileSync(path.resolve('public/academy/content/lessons/l2-l17', filename));
            const hosted = readFileSync(path.resolve('docs/public/academy/content/lessons/l2-l17', filename));
            expect(createHash('sha256').update(source).digest('hex')).toBe(visual.sha256);
            expect(hosted).toEqual(source);
        }
        const sourcePackage = readFileSync(path.resolve('public/academy/content/lessons/044-l2-l17.json'));
        expect(createHash('sha256').update(sourcePackage).digest('hex'))
            .toBe('a319510a34b185d008fd631849f56539f360bd61f32ad017812b5714fe38c834');
        expect(readFileSync(path.resolve('docs/public/academy/content/lessons/044-l2-l17.json'))).toEqual(sourcePackage);
        for (const workerPath of ['public/academy/sw.js', 'docs/public/academy/sw.js']) {
            const worker = readFileSync(path.resolve(workerPath), 'utf8');
            expect(worker).toContain("'/academy/content/lessons/044-l2-l17.json'");
            model().provenance.moodle.sourceSheets.forEach(visual => expect(worker).toContain(`'${visual.url}'`));
        }
    });

    it('keeps all numbered vocabulary rows in exact source order and leaves all Moodle audio quarantined', () => {
        const sourcePackage = JSON.parse(readFileSync(
            path.resolve('public/academy/content/lessons/044-l2-l17.json'),
            'utf8',
        )) as { components: Array<{ id?: string; items?: Array<{ source: { locus: { page: number; row: number }; exact: { words: string; meaning: string | null } } }> }> };
        const sheet = sourcePackage.components.find(component => component.id === 'source-chapter-30-2-vocabulary')!;

        expect(sheet.items).toHaveLength(23);
        expect(sheet.items?.map(item => item.source.locus)).toEqual([
            ...Array.from({ length: 16 }, (_, index) => ({ page: 1, row: index + 1 })),
            ...Array.from({ length: 7 }, (_, index) => ({ page: 2, row: index + 17 })),
        ]);
        expect(sheet.items?.[0]?.source.exact.words).toBe('*review\nおしょうがつ（お正⽉）');
        expect(sheet.items?.[7]?.source.exact.meaning).toBe('select, pick up, choose, make\nchoice of…');
        expect(sheet.items?.[22]?.source.exact.words).toBe('まだ');
        expect(model().provenance.moodle.media).toMatchObject({
            status: 'audio-members-quarantined-unpaired', sourceAudioMembers: 4, sourceAudioTracksDelivered: 0,
        });
    });
});

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createLessonEighteenFridgeInventoryWorkbookBeat, createLessonEighteenFridgeInventoryWorkbookModel } from '../../src/academy/content/lesson-eighteen-fridge-inventory-workbook';
import { loadLessonActivityChapter } from '../../src/academy/content/lesson-activity-catalog';
import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import { fridgeInventoryWorkbookPlugin, type FridgeInventoryResponse, type FridgeInventoryRound } from '../../src/academy/minigames/fridge-inventory-workbook';

const runtime = createActivityRuntime([fridgeInventoryWorkbookPlugin]);
afterEach(() => document.body.replaceChildren());

describe('Lesson 18 fridge inventory workbook', () => {
    it('pins the Moodle-first source sequence, including the honest no-audio result', () => {
        const activity = model();
        expect(runtime.validate(activity)).toEqual([]);
        expect(activity.provenance).toMatchObject({
            packageId: 'l1-l18', answerVisibility: 'after-attempt', sourceOrder: ['moodle', 'minna-mapping', 'genki-support'],
            moodle: {
                moduleId: 6200250,
                archiveSha256: '2412b5cffe9f22758f583ac773293f1af371ef60e3c979650d10722499c593fa',
                documents: [
                    { payloadSha256: '26c694d907c740415f1c4ea82635d7bd6ed64a3106406a4f033398f056c3f1f8', pages: '1' },
                    { payloadSha256: '425fb0138247c6a0328ca9d3006ffd0c6fa088c29945400598bda07f38f89b58', pages: '1' },
                    { payloadSha256: 'fdb6883084e6340d7e0ba3dcef7cb868b8e57c220759135f8e84051ce4192fa4', pages: '1' },
                ],
                audio: { status: 'not-present-in-archive', memberCount: 0 },
            },
            minna: { sourceId: 'japanese-minna:11-11', relation: 'chronology-map-only' },
            genki: { taskId: 'genki-2e:l1-l18:lesson-3-literacy-1', relation: 'post-instruction-counter-recognition-only', lineLocus: { start: 76, end: 92 } },
        });
        expect(activity.provenance.minna.reason).toContain('No Minna wording or answer');
        expect(activity.provenance.genki.reason).toContain('No Genki wording or answer');
    });

    it('keeps all eight Moodle items in source order across existence, quantity, and report modes', () => {
        const rounds = model().payload.rounds;
        expect(rounds.map(round => round.sourceOrder)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
        expect(rounds.map(round => round.mode)).toEqual(['quantity-choice', 'existence-choice', 'quantity-choice', 'existence-choice', 'quantity-choice', 'quantity-choice', 'report-typed', 'report-typed']);
        expect(rounds.map(round => round.sourceQuestionId)).toEqual([
            'moodle:6200250:26c694d9:p1:q1',
            'moodle:6200250:425fb013:p1:q1',
            'moodle:6200250:425fb013:p1:q2',
            'moodle:6200250:425fb013:p1:q3',
            'moodle:6200250:425fb013:p1:q4',
            'moodle:6200250:fdb68830:p1:q5',
            'moodle:6200250:425fb013:p1:report-1',
            'moodle:6200250:fdb68830:p1:report-2',
        ]);
    });

    it('grades the three mechanics deterministically and seeds repair only for missed source items', () => {
        expect(runtime.evaluate(model(), perfectResponse()).result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        const response = structuredClone(perfectResponse()) as { answers: FridgeInventoryResponse['answers'][number][] };
        response.answers[3] = { mode: 'existence-choice', roundId: 'fridge-b-water-exists', value: 'はい、ありますよ。' };
        response.answers[7] = { mode: 'report-typed', roundId: 'fridge-a-fish-report', value: 'Aさんのれいぞうこのなかにさかなはにひきいます' };
        const lapsed = runtime.evaluate(model(), response);
        expect(lapsed.result).toMatchObject({ outcome: 'lapse', score: 6 / 8, errorTags: ['l1-l18-fridge-4', 'l1-l18-fridge-8'] });
        expect(lapsed.reviewSeeds.map(seed => seed.sourceQuestionId)).toEqual([
            'moodle:6200250:425fb013:p1:q3',
            'moodle:6200250:fdb68830:p1:report-2',
        ]);
    });

    it('teaches before assessment, then exposes progressive hints for only the missed fridge item', async () => {
        const hostElement = document.createElement('main'); const supportUse = vi.fn(); const evaluations: Array<ReturnType<typeof runtime.evaluate>> = [];
        const controller = runtime.mount(model(), { language: 'en', replace(view) { hostElement.replaceChildren(view); }, announce() {}, recordSupportUse: supportUse }, evaluation => { evaluations.push(evaluation); });
        document.body.append(hostElement);
        expect(hostElement.querySelector('[data-lesson-phase="teaching"]')).not.toBeNull();
        expect(hostElement.querySelector('form, input, select')).toBeNull();
        hostElement.querySelector<HTMLButtonElement>('.academy-fridge-inventory-start')!.click();
        fillForm(hostElement, model().payload.rounds);
        hostElement.querySelector<HTMLSelectElement>('[name="fridge-b-water-exists-value"]')!.value = 'はい、ありますよ。';
        hostElement.querySelector<HTMLFormElement>('form')!.requestSubmit();
        await vi.waitFor(() => expect(evaluations).toHaveLength(1));
        await vi.waitFor(() => expect(hostElement.querySelectorAll('.academy-fridge-inventory-round:not([hidden])')).toHaveLength(1));
        hostElement.querySelector<HTMLButtonElement>('.academy-fridge-inventory-hint-button')!.click();
        expect(hostElement.querySelector<HTMLElement>('.academy-fridge-inventory-hint-panel')?.dataset.hintIndex).toBe('1');
        expect(supportUse).toHaveBeenLastCalledWith({ activityId: 'activity:l1-l18-fridge-inventory-workbook', supportKind: 'hint', choiceId: 'fridge-b-water-exists' });
        controller.dispose();
    });

    it('delivers the Moodle workbook before the retained counter follow-ups with responsive, reduced-motion CSS', async () => {
        expect(createLessonEighteenFridgeInventoryWorkbookBeat()).toMatchObject({ id: 'fridge-inventory-workbook', activity: { id: 'activity:l1-l18-fridge-inventory-workbook', kind: 'academy-fridge-inventory-workbook' } });
        const chapter = await loadLessonActivityChapter('l1-l18', { lookup: vi.fn() } as never);
        expect(chapter?.beats.map(beat => beat.id)).toEqual(['fridge-inventory-workbook', 'pack-vegetables', 'match-counters']);
        const css = readFileSync(path.resolve('src/academy/minigames/fridge-inventory-workbook/style.css'), 'utf8');
        expect(css).toMatch(/min-height:\s*44px/); expect(css).toMatch(/@media \(max-width: 760px\)[\s\S]*grid-template-columns:\s*1fr/s); expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    });
});

function model() { return createLessonEighteenFridgeInventoryWorkbookModel(); }
function perfectResponse(): FridgeInventoryResponse {
    return { answers: model().payload.rounds.map(round => ({ roundId: round.id, mode: round.mode, value: round.acceptedAnswers[0]! })) };
}
function fillForm(root: HTMLElement, rounds: readonly FridgeInventoryRound[]): void {
    rounds.forEach(round => { root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${round.id}-value"]`)!.value = round.acceptedAnswers[0]!; });
}

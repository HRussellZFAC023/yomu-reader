import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createLessonSixteenExistenceLocationWorkbookBeat, createLessonSixteenExistenceLocationWorkbookModel } from '../../src/academy/content/lesson-sixteen-existence-location-workbook';
import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import { existenceLocationWorkbookPlugin, type ExistenceLocationAnswer, type ExistenceLocationResponse, type ExistenceLocationRound } from '../../src/academy/minigames/existence-location-workbook';

const runtime = createActivityRuntime([existenceLocationWorkbookPlugin]);
afterEach(() => document.body.replaceChildren());

describe('Lesson 16 existence-location workbook', () => {
    it('pins the Moodle archive and worksheet hashes before the honest Minna map and Genki task', () => {
        const activity = model();
        expect(runtime.validate(activity)).toEqual([]);
        expect(activity.provenance).toMatchObject({
            packageId: 'l1-l16', answerVisibility: 'after-attempt', sourceOrder: ['moodle', 'minna-mapping', 'genki'],
            moodle: { moduleId: 5881257, archiveSha256: 'ab7585b4d14d945535b90b6c64509e9c1b34caa96f0659b83b23920e893f46ba', documents: [{ payloadSha256: 'b2143f1f2ce2469fe7e54d8f778d75956ae6c060bc44e2c39421bde470b8ac0b', member: 'Handouts from last week/Chapter 10-1 Grammar exceise.pdf', pages: '2' }] },
            minna: { sourceId: 'japanese-minna:10-10', reference: 'Minna no Nihongo I, Lesson 10', relation: 'chronology-map-only' },
            genki: { taskId: 'genki-2e:l1-l16:lesson-4-workbook-1', payloadSha256: 'a4af27440a6e72bde55d011df350acd921199a0b558eb168ec46b380a3949e09', scriptSha256: 'aad41fec9195385ef13a7e8280c6b2292c48d8857dfbcabd9c93c82fe968733a', lineLocus: { start: 76, end: 141 }, sourceSlice: [1, 4] },
        });
        expect(activity.provenance.minna.reason).toContain('No Minna wording or answer is presented');
    });

    it('keeps all eight verbatim Moodle cues ahead of two Genki source transfers with a different mechanic', () => {
        const rounds = model().payload.rounds;
        expect(rounds.map(round => round.sourceOrder)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        expect(rounds.map(round => round.mode)).toEqual(['classify', 'classify', 'classify', 'classify', 'classify', 'classify', 'classify', 'classify', 'typed', 'typed']);
        expect(rounds.slice(0, 8).map(round => round.sourcePrompt)).toEqual(['うみ／さかな', 'さかなや／さかな', 'ほんや／ねこ の ほん', 'ほんや／ねこ', 'にわ／じてんしゃ', 'にわ／こども', 'がっこう／うけつけ の ひと', 'がっこう／うけつけ']);
        expect(rounds.slice(8).map(round => round.sourceQuestionId)).toEqual(['genki-2e:l1-l16:lesson-4-workbook-1:slot-1', 'genki-2e:l1-l16:lesson-4-workbook-1:slot-4']);
    });

    it('requires the noun class and verb together, then repairs only the missed exact sources', () => {
        expect(runtime.evaluate(model(), perfectResponse()).result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        const response = structuredClone(perfectResponse()) as { answers: ExistenceLocationAnswer[] };
        response.answers[0] = { mode: 'classify', roundId: 'moodle-sea-fish', nounClass: 'inanimate', verb: 'あります' };
        response.answers[9] = { mode: 'typed', roundId: 'genki-yamashita', value: 'あそこに バスていが あります' };
        const lapsed = runtime.evaluate(model(), response);
        expect(lapsed.result).toMatchObject({ outcome: 'lapse', score: 8 / 10, errorTags: ['l1-l16-existence-1', 'l1-l16-existence-10'] });
        expect(lapsed.reviewSeeds.map(seed => seed.sourceQuestionId)).toEqual(['moodle:5881257:b2143f1f:p2:q3:1', 'genki-2e:l1-l16:lesson-4-workbook-1:slot-4']);
    });

    it('teaches before assessment, then exposes progressive hints only for missed items', async () => {
        const hostElement = document.createElement('main'); const supportUse = vi.fn(); const evaluations: Array<ReturnType<typeof runtime.evaluate>> = [];
        const controller = runtime.mount(model(), { language: 'en', replace(view) { hostElement.replaceChildren(view); }, announce() {}, recordSupportUse: supportUse }, evaluation => { evaluations.push(evaluation); });
        document.body.append(hostElement);
        expect(hostElement.querySelector('[data-lesson-phase="teaching"]')).not.toBeNull();
        expect(hostElement.querySelector('form, input, select')).toBeNull();
        hostElement.querySelector<HTMLButtonElement>('.academy-existence-start')!.click();
        fillForm(hostElement, model().payload.rounds);
        hostElement.querySelector<HTMLSelectElement>('select[name="moodle-sea-fish-class"]')!.value = 'inanimate';
        hostElement.querySelector<HTMLSelectElement>('select[name="moodle-sea-fish-verb"]')!.value = 'あります';
        hostElement.querySelector<HTMLFormElement>('form')!.requestSubmit();
        await vi.waitFor(() => expect(evaluations).toHaveLength(1));
        await vi.waitFor(() => expect(hostElement.querySelectorAll('.academy-existence-round:not([hidden])')).toHaveLength(1));
        hostElement.querySelector<HTMLButtonElement>('.academy-existence-hint-button')!.click();
        expect(hostElement.querySelector<HTMLElement>('.academy-existence-hint-panel')?.dataset.hintIndex).toBe('1');
        expect(supportUse).toHaveBeenLastCalledWith({ activityId: 'activity:l1-l16-existence-location-workbook', supportKind: 'hint', choiceId: 'moodle-sea-fish' });
        controller.dispose();
    });

    it('wraps a standalone beat and maintains compact touch, mobile, and reduced-motion contracts', () => {
        expect(createLessonSixteenExistenceLocationWorkbookBeat()).toMatchObject({ id: 'existence-location-workbook', activity: { id: 'activity:l1-l16-existence-location-workbook', kind: 'academy-existence-location-workbook' } });
        const css = readFileSync(path.resolve('src/academy/minigames/existence-location-workbook/style.css'), 'utf8');
        expect(css).toMatch(/min-height:\s*44px/); expect(css).toMatch(/@media \(max-width: 620px\)[\s\S]*grid-template-columns:\s*1fr/s); expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    });
});

function model() { return createLessonSixteenExistenceLocationWorkbookModel(); }
function perfectResponse(): ExistenceLocationResponse { return { answers: model().payload.rounds.map(answerFor) }; }
function answerFor(round: ExistenceLocationRound): ExistenceLocationAnswer { return round.mode === 'classify' ? { mode: 'classify', roundId: round.id, nounClass: round.nounClass, verb: round.verb } : { mode: 'typed', roundId: round.id, value: round.acceptedAnswers[0]! }; }
function fillForm(root: HTMLElement, rounds: readonly ExistenceLocationRound[]): void { rounds.forEach(round => { if (round.mode === 'classify') { root.querySelector<HTMLSelectElement>(`[name="${round.id}-class"]`)!.value = round.nounClass; root.querySelector<HTMLSelectElement>(`[name="${round.id}-verb"]`)!.value = round.verb; } else root.querySelector<HTMLInputElement>(`[name="${round.id}-value"]`)!.value = round.acceptedAnswers[0]!; }); }

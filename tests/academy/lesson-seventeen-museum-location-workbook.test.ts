import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createLessonSeventeenMuseumLocationWorkbookBeat, createLessonSeventeenMuseumLocationWorkbookModel } from '../../src/academy/content/lesson-seventeen-museum-location-workbook';
import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import { museumLocationWorkbookPlugin, type MuseumLocationAnswer, type MuseumLocationResponse, type MuseumLocationRound } from '../../src/academy/minigames/museum-location-workbook';
import { sha256File } from './helpers/hash-memo';

const runtime = createActivityRuntime([museumLocationWorkbookPlugin]);
afterEach(() => document.body.replaceChildren());

describe('Lesson 17 museum location workbook', () => {
    it('pins the Moodle worksheets and answer-key-free source crops before an honest Minna map and exact Genki transfer task', () => {
        const activity = model();
        expect(runtime.validate(activity)).toEqual([]);
        expect(activity.provenance).toMatchObject({
            packageId: 'l1-l17', answerVisibility: 'after-attempt', sourceOrder: ['moodle', 'minna-mapping', 'genki'],
            moodle: {
                moduleId: 5489600,
                archiveSha256: '61c9d1b3633f418f55fbb047b2ea941eed7f4a2245ea33a45ef8945656150815',
                documents: [
                    { payloadSha256: '321fd611a707f2820764a563662b3b7b2ad70d6122ebf48e2dbea8951b4486a9', pages: '1' },
                    { payloadSha256: 'b7ab822e95efc2f31a35f11725fb8e48d90348246433804434b3f2b3f200e620', pages: '1, 3' },
                    { payloadSha256: '2eb33ab6da711f25198843922600959965fbb7aee5c279f06598ffe109687e09', pages: '2' },
                ],
            },
            minna: { sourceId: 'japanese-minna:10-10', reference: 'Minna no Nihongo I, Lesson 10', relation: 'chronology-map-only' },
            genki: { taskId: 'genki-2e:l1-l17:lesson-4-workbook-2', payloadSha256: '1bc8b462c5c75728e9e891c35f71e9df13e05c7917b81e5aa4c07496582d9686', scriptSha256: '4165f6dcecba03b99b8f7124f35d863fa6232585949619633905cc18a93ccd89', lineLocus: { start: 76, end: 153 }, sourceSlice: [1, 6] },
        });
        expect(activity.provenance.minna.reason).toContain('No Minna wording or answer is presented');
        expect(activity.provenance.moodle.sourceVisuals.map(visual => [visual.id, visual.source.payloadSha256, visual.source.page, visual.answerKeyVisible])).toEqual([
            ['position-picture-strip', 'b7ab822e95efc2f31a35f11725fb8e48d90348246433804434b3f2b3f200e620', 1, false],
            ['position-room-garden', 'b7ab822e95efc2f31a35f11725fb8e48d90348246433804434b3f2b3f200e620', 3, false],
            ['museum-object-panels', '2eb33ab6da711f25198843922600959965fbb7aee5c279f06598ffe109687e09', 2, false],
        ]);
        for (const visual of activity.provenance.moodle.sourceVisuals) {
            expect(sha256File(path.resolve(`public${visual.url}`))).toBe(visual.sha256);
        }
    });

    it('keeps eight verbatim Moodle cues ahead of two Genki transfers with three deterministic mechanics', () => {
        const rounds = model().payload.rounds;
        expect(rounds.map(round => round.sourceOrder)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        expect(rounds.map(round => round.mode)).toEqual(['frame-choice', 'frame-choice', 'frame-choice', 'frame-choice', 'reply-choice', 'reply-choice', 'reply-choice', 'reply-choice', 'typed', 'typed']);
        expect(rounds.slice(0, 8).map(round => round.sourcePrompt)).toEqual(['いす／ねこ', 'みせ／くるま', 'き／おとこのこ', 'れいぞうこ／いろいろな もの', 'ベッドの した／なに', 'へやの なか／だれ', 'まどの みぎ／なに', 'にわの そと／だれ']);
        expect(rounds.slice(0, 8).map(round => round.answerExpression)).toEqual(['いすの したに ねこが います。', 'みせの まえに くるまが あります。', 'きの うえに おとこのこが います。', 'れいぞうこの なかに いろいろな ものが あります。', 'くつが あります。', 'おんなのこが います。', 'ほんだなが あります。', 'おとこのひとが います。']);
        expect(rounds.slice(8).map(round => round.sourceQuestionId)).toEqual(['genki-2e:l1-l17:lesson-4-workbook-2:slot-1', 'genki-2e:l1-l17:lesson-4-workbook-2:slot-6']);
    });

    it('grades the position and reply mechanics deterministically, then repairs only missed source items', () => {
        expect(runtime.evaluate(model(), perfectResponse()).result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        const response = structuredClone(perfectResponse()) as { answers: MuseumLocationAnswer[] };
        response.answers[0] = { mode: 'frame-choice', roundId: 'moodle-chair-cat', position: 'うえ', verb: 'います' };
        response.answers[9] = { mode: 'typed', roundId: 'genki-japanese-book', value: 'しんぶんの うえです' };
        const lapsed = runtime.evaluate(model(), response);
        expect(lapsed.result).toMatchObject({ outcome: 'lapse', score: 8 / 10, errorTags: ['l1-l17-location-1', 'l1-l17-location-10'] });
        expect(lapsed.reviewSeeds.map(seed => seed.sourceQuestionId)).toEqual(['moodle:5489600:b7ab822e:p1:q1:1', 'genki-2e:l1-l17:lesson-4-workbook-2:slot-6']);
    });

    it('teaches before assessment, then exposes progressive hints only for missed items', async () => {
        const hostElement = document.createElement('main'); const supportUse = vi.fn(); const evaluations: Array<ReturnType<typeof runtime.evaluate>> = [];
        const controller = runtime.mount(model(), { language: 'en', replace(view) { hostElement.replaceChildren(view); }, announce() {}, recordSupportUse: supportUse }, evaluation => { evaluations.push(evaluation); });
        document.body.append(hostElement);
        expect(hostElement.querySelector('[data-lesson-phase="teaching"]')).not.toBeNull();
        expect(hostElement.querySelector('form, input, select')).toBeNull();
        const gallery = hostElement.querySelector<HTMLElement>('.academy-museum-location-source-visuals')!;
        expect(gallery.dataset.answerKeyVisible).toBe('false');
        expect([...gallery.querySelectorAll('img')].map(image => image.getAttribute('src'))).toEqual([
            '/academy/content/lessons/l1-l17/moodle-position-picture-strip.png',
            '/academy/content/lessons/l1-l17/moodle-position-room-garden.png',
            '/academy/content/lessons/l1-l17/moodle-museum-object-panels.png',
        ]);
        expect(gallery.textContent).not.toContain('くつが あります。');
        hostElement.querySelector<HTMLButtonElement>('.academy-museum-location-start')!.click();
        fillForm(hostElement, model().payload.rounds);
        hostElement.querySelector<HTMLSelectElement>('select[name="moodle-chair-cat-position"]')!.value = 'うえ';
        hostElement.querySelector<HTMLFormElement>('form')!.requestSubmit();
        await vi.waitFor(() => expect(evaluations).toHaveLength(1));
        await vi.waitFor(() => expect(hostElement.querySelectorAll('.academy-museum-location-round:not([hidden])')).toHaveLength(1));
        hostElement.querySelector<HTMLButtonElement>('.academy-museum-location-hint-button')!.click();
        expect(hostElement.querySelector<HTMLElement>('.academy-museum-location-hint-panel')?.dataset.hintIndex).toBe('1');
        expect(supportUse).toHaveBeenLastCalledWith({ activityId: 'activity:l1-l17-museum-location-workbook', supportKind: 'hint', choiceId: 'moodle-chair-cat' });
        controller.dispose();
    });

    it('wraps a standalone beat and keeps compact touch, mobile, and reduced-motion contracts', () => {
        expect(createLessonSeventeenMuseumLocationWorkbookBeat()).toMatchObject({ id: 'museum-location-workbook', activity: { id: 'activity:l1-l17-museum-location-workbook', kind: 'academy-museum-location-workbook' } });
        const css = readFileSync(path.resolve('src/academy/minigames/museum-location-workbook/style.css'), 'utf8');
        expect(css).toMatch(/min-height:\s*44px/); expect(css).toMatch(/@media \(max-width: 760px\)[\s\S]*grid-template-columns:\s*1fr/s); expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    });

    it('precaches every Lesson 17 source crop for offline use', () => {
        const worker = readFileSync(path.resolve('public/academy/sw.js'), 'utf8');
        for (const visual of model().provenance.moodle.sourceVisuals) expect(worker).toContain(`'${visual.url}'`);
    });
});

function model() { return createLessonSeventeenMuseumLocationWorkbookModel(); }
function perfectResponse(): MuseumLocationResponse { return { answers: model().payload.rounds.map(answerFor) }; }
function answerFor(round: MuseumLocationRound): MuseumLocationAnswer {
    if (round.mode === 'frame-choice') return { mode: 'frame-choice', roundId: round.id, position: round.position, verb: round.verb };
    return { mode: round.mode, roundId: round.id, value: round.mode === 'reply-choice' ? round.answerExpression : round.acceptedAnswers[0]! };
}
function fillForm(root: HTMLElement, rounds: readonly MuseumLocationRound[]): void {
    rounds.forEach(round => {
        if (round.mode === 'frame-choice') {
            root.querySelector<HTMLSelectElement>(`[name="${round.id}-position"]`)!.value = round.position;
            root.querySelector<HTMLSelectElement>(`[name="${round.id}-verb"]`)!.value = round.verb;
        } else root.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${round.id}-value"]`)!.value = round.mode === 'reply-choice' ? round.answerExpression : round.acceptedAnswers[0]!;
    });
}

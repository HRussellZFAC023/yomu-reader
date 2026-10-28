import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
    createLessonTwelvePreferenceWorkbookBeat,
    createLessonTwelvePreferenceWorkbookModel,
} from '../../src/academy/content/lesson-twelve-preference-workbook';
import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import {
    preferenceWorkbookPlugin,
    type PreferenceWorkbookAnswer,
    type PreferenceWorkbookResponse,
    type PreferenceWorkbookRound,
} from '../../src/academy/minigames/preference-workbook';

const runtime = createActivityRuntime([preferenceWorkbookPlugin]);

afterEach(() => document.body.replaceChildren());

describe('Lesson 12 preference workbook', () => {
    it('binds exact Moodle, Minna, and Genki sources with their hashes', () => {
        const activity = model();
        expect(runtime.validate(activity)).toEqual([]);
        expect(activity.provenance).toMatchObject({
            packageId: 'l1-l12',
            answerVisibility: 'after-attempt',
            sourceOrder: ['moodle', 'minna', 'genki'],
            moodle: {
                moduleId: 5489594,
                archiveSha256: 'ddec193f603be7e277c0b0636863b129077016afe7e083cc71ffed529a53aa26',
                documents: [
                    { payloadSha256: '6e0a3e02c061f7203d7c8f65db7555993f463e5fee9adf241c36255b959186e4' },
                    { payloadSha256: 'f1757ed9b43c4fb969deb55aa81351e5c2a873d3af902ed5f5fba05df36240ed' },
                ],
            },
            minna: { payloadSha256: '66ee6faa78f08bed1f65db00fb88681b7c7338825b4503af904b24bea4e60229', pdfPage: 97, printedPage: 77 },
            genki: {
                payloadSha256: '500b8acfd6c6e821a7c3399a34849741975ef6f423198ca0565174335689b71d',
                scriptSha256: '938ef1d732db679ae76b6ce604f670456412ba84fa531ef1b867ace3ca5e0264',
                lineLocus: { start: 76, end: 138 },
            },
        });
        expect(activity.payload.teaching.map(step => step.pattern)).toEqual([
            'person は thing が すきです／きらいです',
            'はい、(とても) すきです。／いいえ、(あまり) すきじゃありません。',
            'どんな category が すきですか',
        ]);
    });

    it('keeps 22 source rounds in Moodle, Minna, then Genki order with varied deterministic modes', () => {
        const rounds = model().payload.rounds;
        expect(rounds.map(round => round.sourceOrder)).toEqual(Array.from({ length: 22 }, (_, index) => index + 1));
        expect(rounds.map(round => round.mode)).toEqual([
            'sentence-choice', 'sentence-choice', 'sentence-choice', 'reply-choice', 'reply-choice',
            'question-choice', 'question-choice', 'question-choice',
            'reply-choice', 'reply-choice', 'reply-choice', 'reply-choice',
            ...Array(10).fill('typed'),
        ]);
        expect(rounds.slice(0, 8).map(round => round.sourcePrompt)).toEqual([
            'わたし／テニス／♡', 'ミラーさん／コーヒー／×', 'ワットさん／インドりょうり／×',
            'スポーツが すきですか。（いいえ、あまり）', 'えいがが すきですか。（はい、とても）',
            'おんがく／オペラ', 'のみもの／コーヒー', 'スポーツ／サッカー',
        ]);
        expect(rounds.slice(8, 12).map(round => round.sourcePrompt)).toEqual([
            '日本料理（はい）', 'カラオケ（いいえ、あまり）', '旅行（はい、とても）', '魚（いいえ、あまり）',
        ]);
        expect(rounds.slice(12).map(round => round.sourcePrompt)).toEqual([
            'Japanese class', 'げんき', 'cats', 'ocean', 'Mondays', 'cold mornings', 'homework',
            'frightening movies', 'this town', 'fish',
        ]);
        expect(rounds.every(round => round.sourceQuestionId && round.hint.length === 3)).toBe(true);
    });

    it('grades all interaction modes and emits only missed source items for repair', () => {
        const passed = runtime.evaluate(model(), perfectResponse());
        expect(passed.result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        expect(passed.reviewSeeds).toHaveLength(22);
        expect(passed.reviewSeeds.every(seed => seed.reason === 'new-learning' && seed.sourceQuestionId)).toBe(true);

        const response = structuredClone(perfectResponse()) as { answers: PreferenceWorkbookAnswer[] };
        response.answers[0] = { mode: 'sentence-choice', roundId: 'moodle-1', optionId: 'wa' };
        response.answers[9] = { mode: 'reply-choice', roundId: 'minna-practice-b-1-2', optionId: 'yes-plain' };
        response.answers[20] = { mode: 'typed', roundId: 'genki-this-town', value: 'わたしはこのまちがすきです' };
        const lapsed = runtime.evaluate(model(), response);
        expect(lapsed.result).toMatchObject({ outcome: 'lapse', score: 19 / 22 });
        expect(lapsed.result.errorTags).toEqual([
            'l1-l12-preference-1', 'l1-l12-preference-10', 'l1-l12-preference-21',
        ]);
        expect(lapsed.reviewSeeds.map(seed => seed.sourceQuestionId)).toEqual([
            'moodle:5489594:6e0a3e02:p1:q1:1',
            'minna-i:66ee6faa78f08bed1f65db00fb88681b7c7338825b4503af904b24bea4e60229:lesson-9:pdf-p97:practice-b:1:2',
            'genki-2e:l1-l12:lesson-5-workbook-6:slot-9',
        ]);
    });

    it('rejects incomplete, duplicate, and wrong-mode source response envelopes', () => {
        expect(() => runtime.evaluate(model(), { answers: [] })).toThrow('Every exact Lesson 12 source item');
        const duplicate = structuredClone(perfectResponse()) as { answers: PreferenceWorkbookAnswer[] };
        duplicate.answers[1] = duplicate.answers[0]!;
        expect(() => runtime.evaluate(model(), duplicate)).toThrow('every source item once');
        const wrongMode = structuredClone(perfectResponse()) as { answers: PreferenceWorkbookAnswer[] };
        wrongMode.answers[0] = { mode: 'typed', roundId: 'moodle-1', value: 'わたしはテニスがすきです' };
        expect(() => runtime.evaluate(model(), wrongMode)).toThrow('interaction mode');
    });

    it('teaches before assessment, then reveals only missed cards with progressive hints', async () => {
        const hostElement = document.createElement('main');
        const supportUse = vi.fn();
        const evaluations: Array<ReturnType<typeof runtime.evaluate>> = [];
        const controller = runtime.mount(model(), {
            language: 'en',
            replace(view) { hostElement.replaceChildren(view); },
            announce() {},
            recordSupportUse: supportUse,
        }, evaluation => { evaluations.push(evaluation); });
        document.body.append(hostElement);

        expect(hostElement.querySelector('[data-lesson-phase="teaching"]')).not.toBeNull();
        expect(hostElement.textContent).toContain('Learn the pattern first');
        expect(hostElement.textContent).toContain('わたしはワインがすきです。');
        expect(hostElement.querySelector('form, input, select')).toBeNull();
        hostElement.querySelector<HTMLButtonElement>('.academy-preference-start')!.click();

        expect(hostElement.querySelectorAll('fieldset')).toHaveLength(22);
        expect(hostElement.querySelectorAll('select')).toHaveLength(12);
        expect(hostElement.querySelectorAll('input[type="text"]')).toHaveLength(10);
        expect(hostElement.textContent).not.toContain('わたしはテニスがすきです');
        expect(hostElement.textContent).not.toContain('いいえ、あまりすきじゃありません');
        fillForm(hostElement, model().payload.rounds);
        hostElement.querySelector<HTMLSelectElement>('select[name$="moodle-1-option"]')!.value = 'wa';
        hostElement.querySelector<HTMLFormElement>('form')!.requestSubmit();
        await vi.waitFor(() => expect(evaluations).toHaveLength(1));

        expect(evaluations[0]?.result.outcome).toBe('lapse');
        await vi.waitFor(() => expect(hostElement.querySelectorAll('.academy-preference-round:not([hidden])')).toHaveLength(1));
        const hint = hostElement.querySelector<HTMLButtonElement>('.academy-preference-hint-button')!;
        expect(hostElement.querySelector<HTMLElement>('.academy-preference-hint-panel')?.hidden).toBe(true);
        hint.click();
        expect(hostElement.querySelector<HTMLElement>('.academy-preference-hint-panel')?.dataset.hintIndex).toBe('1');
        expect(supportUse).toHaveBeenLastCalledWith({
            activityId: 'activity:l1-l12-preference-workbook', supportKind: 'hint', choiceId: 'moodle-1',
        });
        hint.click();
        hint.click();
        expect(hint.disabled).toBe(true);

        hostElement.querySelector<HTMLSelectElement>('select[name$="moodle-1-option"]')!.value = 'answer';
        hostElement.querySelector<HTMLFormElement>('form')!.requestSubmit();
        await vi.waitFor(() => expect(evaluations).toHaveLength(2));
        expect(evaluations[1]?.result.outcome).toBe('pass');
        controller.dispose();
    });

    it('wraps a lesson beat and keeps mobile, touch, and reduced-motion CSS contracts', () => {
        expect(createLessonTwelvePreferenceWorkbookBeat()).toMatchObject({
            id: 'preference-workbook',
            activity: { id: 'activity:l1-l12-preference-workbook', kind: 'academy-preference-workbook' },
        });
        const css = readFileSync(path.resolve('src/academy/minigames/preference-workbook/style.css'), 'utf8');
        expect(css).toMatch(/min-height:\s*44px/);
        expect(css).toMatch(/@media \(max-width: 620px\)[\s\S]*\.academy-preference-round-grid[\s\S]*grid-template-columns:\s*1fr/s);
        expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    });
});

function model() {
    return createLessonTwelvePreferenceWorkbookModel();
}

function perfectResponse(): PreferenceWorkbookResponse {
    return { answers: model().payload.rounds.map(answerFor) };
}

function answerFor(round: PreferenceWorkbookRound): PreferenceWorkbookAnswer {
    if (round.mode === 'typed') return { mode: 'typed', roundId: round.id, value: round.acceptedAnswers[0]! };
    return { mode: round.mode, roundId: round.id, optionId: round.correctOptionId };
}

function fillForm(root: HTMLElement, rounds: readonly PreferenceWorkbookRound[]): void {
    rounds.forEach(round => {
        if (round.mode === 'typed') {
            root.querySelector<HTMLInputElement>(`input[name$="${round.id}-value"]`)!.value = round.acceptedAnswers[0]!;
        } else {
            root.querySelector<HTMLSelectElement>(`select[name$="${round.id}-option"]`)!.value = round.correctOptionId;
        }
    });
}

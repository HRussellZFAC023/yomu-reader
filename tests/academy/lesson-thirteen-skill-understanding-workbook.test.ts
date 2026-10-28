import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
    createLessonThirteenSkillUnderstandingWorkbookBeat,
    createLessonThirteenSkillUnderstandingWorkbookModel,
} from '../../src/academy/content/lesson-thirteen-skill-understanding-workbook';
import { createActivityRuntime } from '../../src/academy/domain/activity-runtime';
import {
    skillUnderstandingWorkbookPlugin,
    type SkillUnderstandingAnswer,
    type SkillUnderstandingResponse,
    type SkillUnderstandingRound,
} from '../../src/academy/minigames/skill-understanding-workbook';

const runtime = createActivityRuntime([skillUnderstandingWorkbookPlugin]);

afterEach(() => document.body.replaceChildren());

describe('Lesson 13 skill-and-understanding workbook', () => {
    it('binds exact Moodle, Minna, and Genki sources with hashes and teaching before practice', () => {
        const activity = model();
        expect(runtime.validate(activity)).toEqual([]);
        expect(activity.provenance).toMatchObject({
            packageId: 'l1-l13',
            answerVisibility: 'after-attempt',
            sourceOrder: ['moodle', 'minna', 'genki'],
            moodle: {
                moduleId: 5489595,
                archiveSha256: 'e06668d27acd438d5b0e546042a4aa2dc063ba8e75595f96190d7aa4a844a839',
                documents: [
                    { payloadSha256: '189a165207404014343ed19be7bdba76e59212586273f68d9e27c5f0651d3fde' },
                    { payloadSha256: '5703647975dcf519399c5a911254a9a418ace4af7f8403242f1255e9e1dcfd1e' },
                ],
            },
            minna: { payloadSha256: '66ee6faa78f08bed1f65db00fb88681b7c7338825b4503af904b24bea4e60229', pdfPage: 97, printedPage: 77, exercise: 'Practice B, exercise 4' },
            genki: {
                taskId: 'genki-2e:l1-l13:lesson-5-workbook-8',
                payloadSha256: '3ccb538a2f9708ae43fcfd56640f7ee040a784eb790f61df0e401adb2506bff7',
                scriptSha256: '02d771397a001cb17900fce9f63abc17221db0fb14f01839ddf34a102febcd21',
                lineLocus: { start: 76, end: 139 },
                sourceSlice: [7, 8, 9],
            },
        });
        expect(activity.payload.teaching.map(step => step.pattern)).toEqual([
            'person は activity が じょうずです／へたです',
            'N が すこし／だいたい わかります。N が あまり／ぜんぜん わかりません。',
            'person は language が わかりますか。はい、degree わかります。',
        ]);
    });

    it('keeps all 15 source rounds in Moodle, Minna, then Genki order with deterministic modes', () => {
        const rounds = model().payload.rounds;
        expect(rounds.map(round => round.sourceOrder)).toEqual(Array.from({ length: 15 }, (_, index) => index + 1));
        expect(rounds.map(round => round.mode)).toEqual([
            'skill-choice', 'skill-choice', 'skill-choice', 'skill-choice', 'question-choice',
            'reply-choice', 'reply-choice', 'reply-choice',
            'reply-choice', 'reply-choice', 'reply-choice', 'reply-choice',
            'typed', 'typed', 'typed',
        ]);
        expect(rounds.slice(0, 8).map(round => round.sourcePrompt)).toEqual([
            'わたし／スキー／bad, poor', 'マイケルさん／ダンス／good', 'あのひと／カラオケ／not good', 'ピカソさん／え／good',
            'かんじ', 'ワットさん／ひらがな（はい、すこし）', 'ハントさん／にほんご（はい、だいたい）', 'マイケルさん／かんじ（いいえ、ぜんぜん）',
        ]);
        expect(rounds.slice(8, 12).map(round => round.sourcePrompt)).toEqual([
            'シュミットさん・英語（はい、よく）', 'テレーザちゃん・漢字（いいえ、あまり）',
            'サントスさん・日本語（はい、だいたい）', '山田さんの奥さん・フランス語（いいえ、ぜんぜん）',
        ]);
        expect(rounds.slice(12).map(round => round.sourceQuestionId)).toEqual([
            'genki-2e:l1-l13:lesson-5-workbook-8:slot-7',
            'genki-2e:l1-l13:lesson-5-workbook-8:slot-8',
            'genki-2e:l1-l13:lesson-5-workbook-8:slot-9',
        ]);
        expect(rounds.every(round => round.sourceQuestionId && round.hint.length === 3)).toBe(true);
    });

    it('grades each response mode and returns only missed source items for repair', () => {
        const passed = runtime.evaluate(model(), perfectResponse());
        expect(passed.result).toMatchObject({ outcome: 'pass', score: 1, errorTags: [] });
        expect(passed.reviewSeeds).toHaveLength(15);
        expect(passed.reviewSeeds.every(seed => seed.reason === 'new-learning')).toBe(true);

        const response = structuredClone(perfectResponse()) as { answers: SkillUnderstandingAnswer[] };
        response.answers[0] = { mode: 'skill-choice', roundId: 'moodle-1', optionId: 'particle' };
        response.answers[9] = { mode: 'reply-choice', roundId: 'minna-practice-b-4-2', optionId: 'yes-little' };
        response.answers[14] = { mode: 'typed', roundId: 'genki-music', value: 'おんがくがすきです' };
        const lapsed = runtime.evaluate(model(), response);
        expect(lapsed.result).toMatchObject({ outcome: 'lapse', score: 12 / 15 });
        expect(lapsed.result.errorTags).toEqual([
            'l1-l13-skill-understanding-1', 'l1-l13-skill-understanding-10', 'l1-l13-skill-understanding-15',
        ]);
        expect(lapsed.reviewSeeds.map(seed => seed.sourceQuestionId)).toEqual([
            'moodle:5489595:189a1652:p2:q1:1',
            'minna-i:66ee6faa78f08bed1f65db00fb88681b7c7338825b4503af904b24bea4e60229:lesson-9:pdf-p97:practice-b:4:2',
            'genki-2e:l1-l13:lesson-5-workbook-8:slot-9',
        ]);
    });

    it('rejects source-order and source-mode drift before rendering', () => {
        const reordered = structuredClone(model());
        const rounds = reordered.payload.rounds as SkillUnderstandingRound[];
        [rounds[0], rounds[1]] = [rounds[1]!, rounds[0]!];
        expect(runtime.validate(reordered).map(issue => issue.message)).toContain(
            'Every ordered source item needs a unique identity and repair target.',
        );
    });

    it('shows teaching before assessment and gives progressive, scoped repair hints', async () => {
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
        expect(hostElement.querySelector('form, input, select')).toBeNull();
        hostElement.querySelector<HTMLButtonElement>('.academy-skill-understanding-start')!.click();
        expect(hostElement.querySelectorAll('fieldset')).toHaveLength(15);
        fillForm(hostElement, model().payload.rounds);
        hostElement.querySelector<HTMLSelectElement>('select[name$="moodle-1-option"]')!.value = 'particle';
        hostElement.querySelector<HTMLFormElement>('form')!.requestSubmit();
        await vi.waitFor(() => expect(evaluations).toHaveLength(1));
        await vi.waitFor(() => expect(hostElement.querySelectorAll('.academy-skill-understanding-round:not([hidden])')).toHaveLength(1));
        const hint = hostElement.querySelector<HTMLButtonElement>('.academy-skill-understanding-hint-button')!;
        hint.click();
        expect(hostElement.querySelector<HTMLElement>('.academy-skill-understanding-hint-panel')?.dataset.hintIndex).toBe('1');
        expect(supportUse).toHaveBeenLastCalledWith({
            activityId: 'activity:l1-l13-skill-understanding-workbook', supportKind: 'hint', choiceId: 'moodle-1',
        });
        controller.dispose();
    });

    it('wraps a lesson beat and keeps touch, mobile, and reduced-motion contracts with the plugin', () => {
        expect(createLessonThirteenSkillUnderstandingWorkbookBeat()).toMatchObject({
            id: 'skill-understanding-workbook',
            activity: { id: 'activity:l1-l13-skill-understanding-workbook', kind: 'academy-skill-understanding-workbook' },
        });
        const css = readFileSync(path.resolve('src/academy/minigames/skill-understanding-workbook/style.css'), 'utf8');
        expect(css).toMatch(/min-height:\s*44px/);
        expect(css).toMatch(/@media \(max-width: 620px\)[\s\S]*grid-template-columns:\s*1fr/s);
        expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    });
});

function model() {
    return createLessonThirteenSkillUnderstandingWorkbookModel();
}

function perfectResponse(): SkillUnderstandingResponse {
    return { answers: model().payload.rounds.map(answerFor) };
}

function answerFor(round: SkillUnderstandingRound): SkillUnderstandingAnswer {
    return round.mode === 'typed'
        ? { mode: 'typed', roundId: round.id, value: round.acceptedAnswers[0]! }
        : { mode: round.mode, roundId: round.id, optionId: round.correctOptionId };
}

function fillForm(root: HTMLElement, rounds: readonly SkillUnderstandingRound[]): void {
    rounds.forEach(round => {
        if (round.mode === 'typed') {
            root.querySelector<HTMLInputElement>(`input[name$="${round.id}-value"]`)!.value = round.acceptedAnswers[0]!;
        } else {
            root.querySelector<HTMLSelectElement>(`select[name$="${round.id}-option"]`)!.value = round.correctOptionId;
        }
    });
}

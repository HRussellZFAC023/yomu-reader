import { choiceActivityPlugin, type ChoiceActivityModel } from '../../src/academy/activities/choice';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT, createActivityRuntime } from '../../src/academy/domain/activity-runtime';

function model(): ChoiceActivityModel {
    return {
        id: 'activity:please-repeat',
        kind: 'choice',
        sourceQuestionId: 'question:welcome-1',
        conceptIds: ['repair-language'],
        responseKind: 'choice',
        prompt: { en: 'Ask Rie to repeat that.', ja: 'りえ先生に、もう一度言ってもらいましょう。' },
        payload: {
            reviewSeedId: 'review:please-repeat',
            reviewContent: {
                expression: 'もう一度お願いします',
                reading: 'もういちどおねがいします',
                meanings: ['One more time, please.'],
                sentence: 'すみません。もう一度お願いします。',
            },
            options: [
                {
                    id: 'again-please',
                    label: { en: 'One more time, please.', ja: 'もう一度お願いします。' },
                    correct: true,
                    explanation: { en: 'That politely asks for repetition.', ja: '丁寧に繰り返しを頼めました。' },
                },
                {
                    id: 'understand',
                    label: { en: 'I understand.', ja: 'わかります。' },
                    correct: false,
                    errorTag: 'meaning',
                    explanation: { en: 'This says you understand; it does not ask for help.', ja: 'これは理解したという意味で、助けを頼んでいません。' },
                    repairPrompt: { en: 'Choose the phrase with “one more time”.', ja: '「もう一度」がある表現を選びましょう。' },
                    nearbyExample: { en: 'Please say your name one more time.', ja: '名前をもう一度お願いします。' },
                },
            ],
        },
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
    };
}

describe('activity runtime', () => {
    it('turns a wrong answer into precise repair evidence and a future review seed', () => {
        const runtime = createActivityRuntime([choiceActivityPlugin]);
        const evaluation = runtime.evaluate(model(), 'understand');

        expect(evaluation.result).toMatchObject({ outcome: 'lapse', score: 0, errorTags: ['meaning'] });
        expect(evaluation.result.feedback.repairPrompt?.ja).toContain('もう一度');
        expect(evaluation.attempt).toMatchObject({
            kind: 'attempt-recorded',
            activityId: 'activity:please-repeat',
            sourceQuestionId: 'question:welcome-1',
            outcome: 'lapse',
        });
        expect(evaluation.reviewSeeds).toEqual([{
            id: 'review:please-repeat:repair-language',
            conceptId: 'repair-language',
            reason: 'repair',
            sourceQuestionId: 'question:welcome-1',
            content: {
                expression: 'もう一度お願いします',
                reading: 'もういちどおねがいします',
                meanings: ['One more time, please.'],
                sentence: 'すみません。もう一度お願いします。',
            },
        }]);
    });

    it('renders buttons with stable Japanese text and displays the full repair without duplicate controls', async () => {
        const runtime = createActivityRuntime([choiceActivityPlugin]);
        const hostRoot = document.createElement('main');
        document.body.replaceChildren(hostRoot);
        const announcements: string[] = [];
        const controller = runtime.mount(model(), {
            replace(view) { hostRoot.replaceChildren(view); },
            announce(message) { announcements.push(message); },
        }, () => undefined);

        const wrong = hostRoot.querySelector<HTMLButtonElement>('[data-choice-id="understand"]');
        wrong?.click();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(hostRoot.querySelectorAll('button')).toHaveLength(2);
        expect(hostRoot.querySelectorAll('input')).toHaveLength(0);
        expect(hostRoot.querySelector('.academy-feedback-repair .academy-japanese')?.textContent).toContain('もう一度');
        expect(announcements.at(-1)).toContain('does not ask for help');
        expect(wrong?.disabled).toBe(false);
        controller.dispose();
    });

    it('refuses a wrong choice without the repair ladder', () => {
        const invalid = model();
        const bad = {
            ...invalid,
            payload: {
                ...invalid.payload,
                options: invalid.payload.options.map(option => option.correct ? option : { ...option, repairPrompt: undefined }),
            },
        };
        const issues = createActivityRuntime([choiceActivityPlugin]).validate(bad);
        expect(issues.some(issue => issue.message.includes('repair'))).toBe(true);
    });

    it('rejects assessed activity support that reveals answer-bearing copy before commitment', () => {
        const unsafe = {
            ...model(),
            answerSupport: {
                ...ACADEMY_ASSESSED_ANSWER_SUPPORT,
                englishUiPreCommit: { ...ACADEMY_ASSESSED_ANSWER_SUPPORT.englishUiPreCommit, modelAnswers: 'visible' },
            },
        } as unknown as ChoiceActivityModel;
        expect(createActivityRuntime([choiceActivityPlugin]).validate(unsafe)).toContainEqual(expect.objectContaining({
            path: 'answerSupport.englishUiPreCommit.modelAnswers',
        }));
    });
});

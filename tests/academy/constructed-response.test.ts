import {
    constructedResponseActivityPlugin,
    normalizeJapaneseResponse,
    type ConstructedResponseActivityModel,
} from '../../src/academy/activities/constructed-response';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT, createActivityRuntime } from '../../src/academy/domain/activity-runtime';

function model(): ConstructedResponseActivityModel {
    return {
        id: 'activity:lesson-zero-reconstruct-repair',
        kind: 'constructed-japanese',
        sourceQuestionId: 'source-question:classroom-phrase-09',
        conceptIds: ['concept:classroom-repair-repeat'],
        responseKind: 'reconstruct',
        prompt: {
            en: 'Rie moved on. Ask her to repeat.',
            ja: '聞き取れませんでした。りえ先生に繰り返してもらってください。',
        },
        payload: {
            acceptedAnswers: ['もう一度お願いします', 'もういちどおねがいします'],
            passFeedback: {
                en: 'Rie repeats the line more slowly.',
                ja: 'りえ先生が、ゆっくり繰り返します。',
            },
            lapseFeedback: {
                errorTag: 'classroom-repair-form',
                contrast: {
                    en: 'That does not yet ask the listener to repeat.',
                    ja: 'まだ、相手に繰り返しを頼む形になっていません。',
                },
                repairPrompt: {
                    en: 'Build the request with お願いします.',
                    ja: '「お願いします」を使って、頼む形にしてください。',
                },
                nearbyExample: {
                    en: 'Use the polite request pattern from the handout.',
                    ja: 'プリントの丁寧な頼み方と比べてください。',
                },
            },
            reviewSeedId: 'review:lesson-zero-repeat',
            reviewContent: {
                expression: 'もう一度お願いします',
                reading: 'もういちどおねがいします',
                meanings: ['One more time, please.'],
                sentence: 'すみません。もう一度お願いします。',
            },
            promptReadingSupport: {
                reading: 'ききとれませんでした。りえせんせいにくりかえしてもらってください。',
                pitch: 'prompt phrase pitch',
            },
        },
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
    };
}

function flush(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}

describe('constructed Japanese response activity', () => {
    it('normalises spaces and Japanese or ASCII punctuation without inventing lexical variants', () => {
        const runtime = createActivityRuntime([constructedResponseActivityPlugin]);

        expect(normalizeJapaneseResponse(' もう　一度 お願いします。 ')).toBe('もう一度お願いします');
        expect(runtime.evaluate(model(), 'もう 一度 お願いします。').result.outcome).toBe('pass');
        expect(runtime.evaluate(model(), 'もういちどおねがいします!').result.outcome).toBe('pass');
        expect(runtime.evaluate(model(), 'もう一回お願いします。').result.outcome).toBe('lapse');
    });

    it('returns the exact authored contrast and smaller repair prompt', () => {
        const evaluation = createActivityRuntime([constructedResponseActivityPlugin]).evaluate(model(), 'わかりました');

        expect(evaluation.result).toMatchObject({
            outcome: 'lapse',
            score: 0,
            errorTags: ['classroom-repair-form'],
            feedback: {
                explanation: model().payload.lapseFeedback.contrast,
                repairPrompt: model().payload.lapseFeedback.repairPrompt,
                nearbyExample: model().payload.lapseFeedback.nearbyExample,
            },
        });
    });

    it('selects an authored post-commit diagnostic without exposing it in the prompt', () => {
        const withDiagnostic: ConstructedResponseActivityModel = {
            ...model(),
            payload: {
                ...model().payload,
                lapseDiagnostics: [{
                    responseIncludesAny: ['左'],
                    feedback: {
                        errorTag: 'wrong-side',
                        contrast: { en: 'That is left.', ja: 'それは左です。' },
                        repairPrompt: { en: 'Use the other side.', ja: '反対側を使ってください。' },
                        nearbyExample: { en: 'Compare left and right.', ja: '左と右を比べてください。' },
                    },
                }],
            },
        };
        const runtime = createActivityRuntime([constructedResponseActivityPlugin]);

        expect(runtime.validate(withDiagnostic)).toEqual([]);
        expect(runtime.evaluate(withDiagnostic, '左です').result).toMatchObject({
            outcome: 'lapse',
            errorTags: ['wrong-side'],
            feedback: { explanation: { en: 'That is left.', ja: 'それは左です。' } },
        });
    });

    it('keeps a lapse editable, retries in place, and changes Rie reaction', async () => {
        const runtime = createActivityRuntime([constructedResponseActivityPlugin]);
        const hostRoot = document.createElement('main');
        const reactions: string[] = [];
        document.body.replaceChildren(hostRoot);
        runtime.mount(model(), {
            language: 'en',
            replace(view) { hostRoot.replaceChildren(view); },
            announce() {},
            react(reaction) { reactions.push(reaction.expression); },
        }, () => undefined);

        const form = hostRoot.querySelector<HTMLFormElement>('form')!;
        const input = hostRoot.querySelector<HTMLInputElement>('input')!;
        input.value = 'わかりました';
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await flush();

        expect(input.disabled).toBe(false);
        expect(input.value).toBe('わかりました');
        expect(hostRoot.querySelector('.academy-constructed-feedback-contrast')?.textContent)
            .toBe(model().payload.lapseFeedback.contrast.en);
        expect(hostRoot.querySelector('.academy-constructed-feedback-repair')?.textContent)
            .toBe(model().payload.lapseFeedback.repairPrompt.en);
        expect(hostRoot.querySelector('.academy-constructed-feedback-example')?.textContent)
            .toBe(model().payload.lapseFeedback.nearbyExample.en);
        expect(reactions).toEqual(['neutral', 'encouraging', 'repair']);

        input.value = 'もう一度お願いします。';
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await flush();

        expect(input.disabled).toBe(true);
        expect(reactions).toEqual(['neutral', 'encouraging', 'repair', 'encouraging', 'happy']);
    });

    it('keeps English meanings, model answers, and review content out of the pre-commit surface', () => {
        const hostRoot = document.createElement('main');
        document.body.replaceChildren(hostRoot);
        createActivityRuntime([constructedResponseActivityPlugin]).mount(model(), {
            language: 'en',
            replace(view) { hostRoot.replaceChildren(view); },
            announce() {},
        }, () => undefined);

        expect(hostRoot.textContent).not.toContain('One more time, please');
        expect(hostRoot.textContent).not.toContain('もう一度お願いします');
        expect(hostRoot.querySelector<HTMLInputElement>('input')?.value).toBe('');
        const prompt = hostRoot.querySelector<HTMLElement>('.academy-constructed-response-prompt')!;
        expect(prompt.dataset.jpdbReaderSurfaceIgnore).toBe('');
        expect(prompt.dataset.yomuRuntimeSurface).toBeUndefined();

        hostRoot.querySelector<HTMLButtonElement>('.academy-constructed-prompt-support-toggle')?.click();
        expect(prompt.dataset.yomuRuntimeSurface).toBe('academy-activity');
        expect(prompt.dataset.yomuFuriganaMode).toBe('all');
        expect(hostRoot.textContent).not.toContain('One more time, please');
        expect(hostRoot.textContent).not.toContain('もう一度お願いします');
    });

    it('creates review evidence only after a non-empty learner commitment', async () => {
        const hostRoot = document.createElement('main');
        const evaluations: unknown[] = [];
        document.body.replaceChildren(hostRoot);
        createActivityRuntime([constructedResponseActivityPlugin]).mount(model(), {
            replace(view) { hostRoot.replaceChildren(view); },
            announce() {},
        }, evaluation => { evaluations.push(evaluation); });
        const form = hostRoot.querySelector<HTMLFormElement>('form')!;

        expect(evaluations).toHaveLength(0);
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await flush();
        expect(evaluations).toHaveLength(0);

        hostRoot.querySelector<HTMLInputElement>('input')!.value = 'もう一度お願いします';
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await flush();
        expect(evaluations).toHaveLength(1);
        expect(evaluations[0]).toMatchObject({
            reviewSeeds: [{
                id: 'review:lesson-zero-repeat',
                reason: 'new-learning',
            }],
        });
    });

    it('emits one canonical, idempotent review item for a multi-concept expression', () => {
        const runtime = createActivityRuntime([constructedResponseActivityPlugin]);
        const multiConcept = {
            ...model(),
            conceptIds: [
                'concept:classroom-repair-repeat',
                'concept:polite-request',
                'concept:classroom-repair-repeat',
            ],
        };

        const lapse = runtime.evaluate(multiConcept, 'わかりました');
        const pass = runtime.evaluate(multiConcept, 'もう一度お願いします');

        expect(lapse.reviewSeeds).toEqual([expect.objectContaining({
            id: 'review:lesson-zero-repeat',
            conceptId: 'concept:classroom-repair-repeat',
            reason: 'repair',
            sourceQuestionId: 'source-question:classroom-phrase-09',
        })]);
        expect(pass.reviewSeeds).toEqual([expect.objectContaining({
            id: 'review:lesson-zero-repeat',
            conceptId: 'concept:classroom-repair-repeat',
            reason: 'new-learning',
            sourceQuestionId: 'source-question:classroom-phrase-09',
        })]);
        expect(pass.attempt.conceptIds).toEqual([
            'concept:classroom-repair-repeat',
            'concept:polite-request',
        ]);
    });

    it('rejects missing answers, bilingual feedback gaps, and pre-commit answer leakage', () => {
        const runtime = createActivityRuntime([constructedResponseActivityPlugin]);
        const missingAnswers = { ...model(), payload: { ...model().payload, acceptedAnswers: [] } };
        expect(runtime.validate(missingAnswers)).toContainEqual(expect.objectContaining({ path: 'payload.acceptedAnswers' }));
        const nonJapaneseAnswer = { ...model(), payload: { ...model().payload, acceptedAnswers: ['again please'] } };
        expect(runtime.validate(nonJapaneseAnswer)).toContainEqual(expect.objectContaining({ path: 'payload.acceptedAnswers.0' }));

        const missingJapaneseFeedback = {
            ...model(),
            payload: {
                ...model().payload,
                lapseFeedback: {
                    ...model().payload.lapseFeedback,
                    contrast: { en: 'A precise contrast.', ja: '' },
                },
            },
        };
        expect(runtime.validate(missingJapaneseFeedback)).toContainEqual(expect.objectContaining({
            path: 'payload.lapseFeedback.contrast',
        }));

        const japaneseLeak = { ...model(), prompt: { en: 'Ask Rie to repeat.', ja: 'もう一度お願いします。' } };
        expect(runtime.validate(japaneseLeak)).toContainEqual(expect.objectContaining({
            message: expect.stringContaining('must not reveal an accepted answer'),
        }));

        const englishLeak = { ...model(), prompt: { en: 'Type “One more time, please.”', ja: model().prompt.ja } };
        expect(runtime.validate(englishLeak)).toContainEqual(expect.objectContaining({ path: 'prompt.en' }));
    });
});

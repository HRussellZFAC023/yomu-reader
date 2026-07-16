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
        const repairHint = hostRoot.querySelector<HTMLButtonElement>('.academy-lesson-repair-hints .academy-progressive-hint-button')!;
        expect(hostRoot.querySelector('.academy-constructed-feedback-repair')).toBeNull();
        repairHint.click();
        expect(hostRoot.querySelector('.academy-constructed-feedback-repair')?.textContent)
            .toContain(model().payload.lapseFeedback.repairPrompt.en);
        repairHint.click();
        expect(hostRoot.querySelector('.academy-constructed-feedback-example')?.textContent)
            .toContain(model().payload.lapseFeedback.nearbyExample.en);
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
        const readingToggle = hostRoot.querySelector<HTMLButtonElement>('.academy-constructed-prompt-support-toggle')!;
        expect(prompt.dataset.jpdbReaderSurfaceIgnore).toBe('');
        expect(prompt.dataset.yomuRuntimeSurface).toBeUndefined();
        expect(readingToggle.getAttribute('aria-label')).toBe('Show readings');
        expect(readingToggle.title).toBe('Show readings');
        expect(readingToggle.dataset.tooltip).toBe('Show readings');

        readingToggle.click();
        expect(readingToggle.getAttribute('aria-label')).toBe('Hide readings');
        expect(readingToggle.title).toBe('Hide readings');
        expect(readingToggle.dataset.tooltip).toBe('Hide readings');
        expect(prompt.dataset.yomuRuntimeSurface).toBe('academy-activity');
        expect(prompt.dataset.yomuFuriganaMode).toBe('all');
        expect(hostRoot.textContent).not.toContain('One more time, please');
        expect(hostRoot.textContent).not.toContain('もう一度お願いします');
    });

    it('unlocks one progressive hint sequence after a lapse and keeps answer fill last', async () => {
        const hostRoot = document.createElement('main');
        const recordSupportUse = vi.fn();
        const announce = vi.fn();
        const base = model();
        const hinted = {
            ...base,
            payload: {
                ...base.payload,
                hints: [
                    { text: { en: 'Start with もう一度.', ja: '「もう一度」から。' } },
                    {
                        text: { en: 'Add お願いします.', ja: '「お願いします」を足します。' },
                        fillResponse: 'もう一度お願いします',
                    },
                ],
            },
        };
        document.body.replaceChildren(hostRoot);
        createActivityRuntime([constructedResponseActivityPlugin]).mount(hinted, {
            language: 'en',
            replace(view) { hostRoot.replaceChildren(view); },
            announce,
            recordSupportUse,
        }, () => undefined);

        expect(hostRoot.textContent).not.toContain('Start with もう一度.');
        const support = hostRoot.querySelector<HTMLElement>('.academy-lesson-repair-hints')!;
        const button = hostRoot.querySelector<HTMLButtonElement>('.academy-progressive-hint-button')!;
        expect(support.hidden).toBe(true);
        button.click();
        expect(hostRoot.textContent).not.toContain('Start with もう一度.');
        expect(recordSupportUse).not.toHaveBeenCalled();

        const input = hostRoot.querySelector<HTMLInputElement>('input')!;
        input.value = 'わかりました';
        hostRoot.querySelector<HTMLFormElement>('form')!
            .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await flush();

        expect(support.hidden).toBe(false);
        expect(announce).toHaveBeenLastCalledWith(
            'That does not yet ask the listener to repeat. Hint support is now available.',
        );
        expect(hostRoot.querySelectorAll('.academy-progressive-hint-button')).toHaveLength(1);
        button.click();
        expect(hostRoot.textContent).toContain('Start with もう一度.');
        expect(hostRoot.querySelector('.academy-progressive-hint-fill')).toBeNull();
        expect(button.textContent).toBe('Another hint');
        button.click();
        expect(hostRoot.textContent).toContain('Build the request with お願いします.');
        expect(hostRoot.querySelector('.academy-progressive-hint-fill')).toBeNull();
        button.click();
        expect(hostRoot.textContent).toContain('Use the polite request pattern from the handout.');
        expect(hostRoot.querySelector('.academy-progressive-hint-fill')).toBeNull();
        button.click();
        expect(hostRoot.textContent).toContain('Add お願いします.');
        expect(button.isConnected).toBe(false);
        const fill = hostRoot.querySelector<HTMLButtonElement>('.academy-progressive-hint-fill')!;
        expect(document.activeElement).toBe(fill);
        fill.click();
        expect(input.value).toBe('もう一度お願いします');
        expect(document.activeElement).toBe(input);
        expect(recordSupportUse.mock.calls.map(call => call[0].choiceId)).toEqual([
            'progressive-hint:1',
            'progressive-repair:1',
            'progressive-repair:2',
            'progressive-hint:2',
        ]);
    });

    it('uses learner evidence to resume the beginner hint ladder without revealing a full answer', async () => {
        const hostRoot = document.createElement('main');
        const recordSupportUse = vi.fn();
        const base = model();
        const hinted: ConstructedResponseActivityModel = {
            ...base,
            payload: {
                ...base.payload,
                hints: [
                    {
                        tier: 'task-meaning',
                        text: { en: 'Ask Rie to say the classroom phrase again.', ja: 'りえ先生に教室のことばをもう一度言ってもらいます。' },
                    },
                    {
                        tier: 'vocabulary-reading',
                        text: { en: 'Use the request words below.', ja: '下の頼むことばを使います。' },
                        vocabulary: [{
                            expression: 'もう一度',
                            reading: 'もういちど',
                            meaning: { en: 'one more time', ja: 'もう一回' },
                        }, {
                            expression: 'お願いします',
                            reading: 'おねがいします',
                            meaning: { en: 'please', ja: '頼みます' },
                        }],
                    },
                    {
                        tier: 'form-scaffold',
                        text: { en: 'Put the request together.', ja: '頼み方を組み立てます。' },
                        scaffold: { en: '[one more time] + [please]', ja: '［もう一度］＋［お願いします］' },
                    },
                ],
            },
        };
        const orderedRoot = document.createElement('main');
        document.body.replaceChildren(orderedRoot);
        createActivityRuntime([constructedResponseActivityPlugin]).mount(hinted, {
            language: 'en',
            replace(view) { orderedRoot.replaceChildren(view); },
            announce() {},
            recordSupportUse,
        }, () => undefined);
        orderedRoot.querySelector<HTMLInputElement>('input')!.value = 'わかりました';
        orderedRoot.querySelector<HTMLFormElement>('form')!
            .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await flush();
        orderedRoot.querySelector<HTMLButtonElement>('.academy-progressive-hint-button')!.click();
        expect(orderedRoot.querySelector('.academy-progressive-hint-task-meaning')?.textContent)
            .toContain('Ask Rie to say the classroom phrase again.');
        expect(orderedRoot.querySelector('.academy-progressive-hint-vocabulary')).toBeNull();

        document.body.replaceChildren(hostRoot);
        createActivityRuntime([constructedResponseActivityPlugin]).mount(hinted, {
            language: 'en',
            replace(view) { hostRoot.replaceChildren(view); },
            announce() {},
            recordSupportUse,
            learnerSupportUses: [{
                activityId: hinted.id,
                supportKind: 'hint',
                choiceId: 'progressive-hint:task-meaning',
            }],
        }, () => undefined);

        const input = hostRoot.querySelector<HTMLInputElement>('input')!;
        input.value = 'わかりました';
        hostRoot.querySelector<HTMLFormElement>('form')!
            .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await flush();

        const button = hostRoot.querySelector<HTMLButtonElement>('.academy-progressive-hint-button')!;
        expect(hostRoot.textContent).not.toContain('Ask Rie to say the classroom phrase again.');
        expect(hostRoot.textContent).not.toContain('もう一度お願いします');
        button.click();
        expect(hostRoot.querySelector('.academy-progressive-hint-vocabulary')?.textContent).toContain('もう一度 (もういちど)');
        expect(hostRoot.querySelector('.academy-progressive-hint-scaffold')).toBeNull();
        expect(hostRoot.querySelector('.academy-progressive-hint-fill')).toBeNull();
        button.click();
        expect(hostRoot.querySelector('.academy-progressive-hint-scaffold')?.textContent).toContain('[one more time] + [please]');
        expect(hostRoot.textContent).not.toContain('もう一度お願いします');
        expect(recordSupportUse.mock.calls.map(call => call[0].choiceId)).toEqual([
            'progressive-hint:task-meaning',
            'progressive-hint:vocabulary-reading',
            'progressive-hint:form-scaffold',
        ]);
    });

    it('resets the single hint sequence when a retry produces a different diagnostic', async () => {
        const hostRoot = document.createElement('main');
        const diagnostic: ConstructedResponseActivityModel = {
            ...model(),
            payload: {
                ...model().payload,
                lapseDiagnostics: [{
                    responseIncludesAny: ['左'],
                    feedback: {
                        errorTag: 'wrong-side',
                        contrast: { en: 'That is left.', ja: 'それは左です。' },
                        repairPrompt: { en: 'Use right instead.', ja: '代わりに右を使ってください。' },
                        nearbyExample: { en: '右 is right.', ja: '「右」は right です。' },
                    },
                }],
            },
        };
        document.body.replaceChildren(hostRoot);
        createActivityRuntime([constructedResponseActivityPlugin]).mount(diagnostic, {
            language: 'en',
            replace(view) { hostRoot.replaceChildren(view); },
            announce() {},
        }, () => undefined);

        const form = hostRoot.querySelector<HTMLFormElement>('form')!;
        const input = hostRoot.querySelector<HTMLInputElement>('input')!;
        input.value = 'わかりました';
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await flush();
        hostRoot.querySelector<HTMLButtonElement>('.academy-progressive-hint-button')!.click();
        expect(hostRoot.textContent).toContain('Build the request with お願いします.');

        input.value = '左です';
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await flush();

        expect(hostRoot.querySelectorAll('.academy-progressive-hint-button')).toHaveLength(1);
        expect(hostRoot.textContent).not.toContain('Build the request with お願いします.');
        hostRoot.querySelector<HTMLButtonElement>('.academy-progressive-hint-button')!.click();
        expect(hostRoot.textContent).toContain('Use right instead.');
    });

    it('restores already-earned hint state when a retry cannot be persisted', async () => {
        const hostRoot = document.createElement('main');
        let rejectPersistence = false;
        document.body.replaceChildren(hostRoot);
        createActivityRuntime([constructedResponseActivityPlugin]).mount(model(), {
            language: 'en',
            replace(view) { hostRoot.replaceChildren(view); },
            announce() {},
        }, () => {
            if (rejectPersistence) throw new Error('save failed');
        });

        const form = hostRoot.querySelector<HTMLFormElement>('form')!;
        const input = hostRoot.querySelector<HTMLInputElement>('input')!;
        input.value = 'わかりました';
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await flush();
        const support = hostRoot.querySelector<HTMLElement>('.academy-lesson-repair-hints')!;
        const hint = support.querySelector<HTMLButtonElement>('.academy-progressive-hint-button')!;
        hint.click();
        expect(hint.textContent).toBe('Another hint');

        rejectPersistence = true;
        input.value = '左です';
        form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        await flush();

        expect(support.hidden).toBe(false);
        expect(hint.isConnected).toBe(true);
        expect(hint.textContent).toBe('Another hint');
        expect(hostRoot.textContent).toContain('Build the request with お願いします.');
        expect(input.disabled).toBe(false);
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

        const leakingTieredHint = {
            ...model(),
            payload: {
                ...model().payload,
                hints: [{ tier: 'task-meaning', text: { en: 'Ask again.', ja: 'もう一度お願いします。' } }],
            },
        };
        expect(runtime.validate(leakingTieredHint)).toContainEqual(expect.objectContaining({
            message: expect.stringContaining('must not reveal a complete accepted answer'),
        }));
    });
});

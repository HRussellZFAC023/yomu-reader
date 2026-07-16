import { readFileSync } from 'node:fs';
import path from 'node:path';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT, createActivityRuntime, type ActivityEvaluation } from '../../src/academy/domain/activity-runtime';
import {
    phraseKarutaManifest,
    phraseKarutaPlugin,
    type PhraseKarutaModel,
} from '../../src/academy/minigames/phrase-karuta';

function model(): PhraseKarutaModel {
    return {
        id: 'minigame:lesson-zero-classroom-grab',
        kind: 'phrase-karuta',
        sourceQuestionId: 'source-question:classroom-phrase-09',
        conceptIds: [
            'concept:classroom-repair-repeat',
            'concept:classroom-understanding-check',
            'concept:classroom-understanding-response',
        ],
        responseKind: 'phrase-karuta',
        prompt: {
            en: 'Grab the classroom phrase that fits each moment.',
            ja: '場面に合う教室表現を取りましょう。',
        },
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        payload: {
            passScore: 1,
            cards: [
                {
                    id: 'repeat',
                    phrase: 'もう一度お願いします',
                    conceptId: 'concept:classroom-repair-repeat',
                    reviewSeedId: 'review:classroom-repeat',
                    reviewContent: {
                        expression: 'もう一度お願いします',
                        reading: 'もういちどおねがいします',
                        meanings: ['One more time, please.'],
                    },
                },
                {
                    id: 'check',
                    phrase: 'わかりますか',
                    conceptId: 'concept:classroom-understanding-check',
                    reviewSeedId: 'review:classroom-understanding-check',
                    reviewContent: {
                        expression: 'わかりますか',
                        meanings: ['Do you understand?'],
                    },
                },
                {
                    id: 'understand',
                    phrase: 'はい、わかります',
                    conceptId: 'concept:classroom-understanding-response',
                    reviewSeedId: 'review:classroom-understanding-response',
                    reviewContent: {
                        expression: 'はい、わかります',
                        meanings: ['Yes, I understand.'],
                    },
                },
            ],
            rounds: [
                {
                    id: 'missed-instruction',
                    cue: {
                        en: 'You missed the instruction. Ask for it again politely.',
                        ja: '指示を聞き逃しました。丁寧に繰り返しを頼んでください。',
                    },
                    correctCardId: 'repeat',
                    errorTag: 'classroom-repeat-request',
                },
                {
                    id: 'check-partner',
                    cue: {
                        en: 'Check whether your partner understood.',
                        ja: '相手が理解できたか確認してください。',
                    },
                    correctCardId: 'check',
                    errorTag: 'understanding-check-question',
                },
            ],
            feedback: {
                pass: {
                    explanation: {
                        en: 'You matched both classroom moments to useful phrases.',
                        ja: '二つの教室場面に合う表現を選べました。',
                    },
                },
                lapse: {
                    explanation: {
                        en: 'One or more phrases did not match the classroom moment.',
                        ja: '教室場面と合わない表現がありました。',
                    },
                    repairPrompt: {
                        en: 'Contrast asking for repetition with checking understanding.',
                        ja: '繰り返しの依頼と理解の確認を比べましょう。',
                    },
                    nearbyExample: {
                        en: 'A missed instruction needs a request; a partner needs a question.',
                        ja: '聞き逃したときは依頼し、相手には質問します。',
                    },
                },
            },
        },
    };
}

describe('phrase karuta minigame', () => {
    it('publishes a reusable, injected-content manifest and validates grounded Lesson Zero concepts', () => {
        expect(phraseKarutaManifest).toMatchObject({
            kind: 'phrase-karuta',
            content: 'injected',
            evaluation: 'deterministic',
            input: ['keyboard', 'touch'],
            reducedMotion: true,
        });
        expect(createActivityRuntime([phraseKarutaPlugin]).validate(model())).toEqual([]);
    });

    it('grades the same committed deck deterministically into ActivityEvaluation evidence', () => {
        const runtime = createActivityRuntime([phraseKarutaPlugin]);
        const response = {
            selections: [
                { roundId: 'missed-instruction', cardId: 'understand' },
                { roundId: 'check-partner', cardId: 'check' },
            ],
        } as const;

        expect(runtime.evaluate(model(), response)).toEqual(runtime.evaluate(model(), response));
        const evaluation = runtime.evaluate(model(), response);
        expect(evaluation.result).toMatchObject({
            outcome: 'lapse',
            score: 0.5,
            errorTags: ['classroom-repeat-request'],
        });
        expect(evaluation.attempt).toMatchObject({
            kind: 'attempt-recorded',
            activityId: 'minigame:lesson-zero-classroom-grab',
            responseKind: 'phrase-karuta',
            outcome: 'lapse',
            score: 0.5,
        });
        expect(evaluation.reviewSeeds).toEqual(expect.arrayContaining([
            expect.objectContaining({
                id: 'review:classroom-repeat:concept:classroom-repair-repeat',
                conceptId: 'concept:classroom-repair-repeat',
                reason: 'repair',
            }),
            expect.objectContaining({
                id: 'review:classroom-understanding-check:concept:classroom-understanding-check',
                conceptId: 'concept:classroom-understanding-check',
                reason: 'repair',
            }),
        ]));
    });

    it('rejects incomplete or reordered responses instead of guessing at a grade', () => {
        const runtime = createActivityRuntime([phraseKarutaPlugin]);
        expect(() => runtime.evaluate(model(), {
            selections: [{ roundId: 'check-partner', cardId: 'check' }],
        })).toThrow('exactly one selection per round');
    });

    it('plays through with arrow/Enter keyboard input and a touch-compatible native click', async () => {
        const runtime = createActivityRuntime([phraseKarutaPlugin]);
        const hostRoot = document.createElement('main');
        document.body.replaceChildren(hostRoot);
        let evaluation: ActivityEvaluation | undefined;
        const controller = runtime.mount(model(), {
            replace(view) { hostRoot.replaceChildren(view); },
            announce() { /* exercised by every commitment and final result */ },
        }, result => { evaluation = result; });

        const firstCards = hostRoot.querySelectorAll<HTMLButtonElement>('[data-card-id]');
        firstCards[0].focus();
        firstCards[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        expect(document.activeElement).toBe(firstCards[1]);
        firstCards[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        expect(hostRoot.querySelector('.academy-phrase-karuta-progress')?.textContent).toContain('2 of 2');

        hostRoot.querySelector<HTMLButtonElement>('[data-card-id="check"]')?.click();
        await new Promise(resolve => setTimeout(resolve, 0));

        expect(evaluation?.result).toMatchObject({ outcome: 'lapse', score: 0.5 });
        expect(hostRoot.querySelector('.academy-phrase-karuta-score')?.textContent).toContain('50%');
        expect(hostRoot.querySelectorAll('[data-card-id]')).toHaveLength(3);
        controller.dispose();
    });

    it('ships explicit touch sizing and reduced-motion fallbacks with the plugin', () => {
        const cssPath = path.join(process.cwd(), 'src/academy/minigames/phrase-karuta/style.css');
        const css = readFileSync(cssPath, 'utf8');
        expect(css).toContain('touch-action: manipulation');
        expect(css).toContain('@media (prefers-reduced-motion: reduce)');
        expect(css).toContain('min-height: 64px');
    });
});

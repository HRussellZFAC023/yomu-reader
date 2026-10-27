import fs from 'node:fs';
import path from 'node:path';
import { LESSON_ZERO_CLASSROOM_EXPRESSIONS_URL, LESSON_ZERO_CLASSROOM_EXPRESSION_SOURCE_IDS, loadLessonZeroClassroomExpressions, validateLessonZeroClassroomExpressions } from '../../src/academy/content/lesson-zero-classroom-expressions';
import { buildClassroomExpressionSessionReport, readClassroomExpressionSession, startClassroomExpressionSession, transitionClassroomExpressionSession, type ClassroomExpressionSessionDefinition, type ClassroomExpressionSessionState } from '../../src/academy/domain/classroom-expression-session';
import { classroomStateForActivity, completedClassroomActivityIds } from '../../src/academy/content/lesson-zero-classroom-runtime';
import { createClassroomExpressionSessionScreen } from '../../src/academy/ui/classroom-expression-session-screen';

const CONTENT_PATH = path.resolve('public/academy/content/lessons/lesson-zero-classroom-expressions.v1.json');

const LESSON_ZERO_PATH = path.resolve('public/academy/content/lessons/lesson-zero.v1.json');

function packageJson(): ClassroomExpressionSessionDefinition {
    return JSON.parse(fs.readFileSync(CONTENT_PATH, 'utf8')) as ClassroomExpressionSessionDefinition;
}

function contentFetcher(): typeof fetch {
    return vi.fn(async (value: string | URL | Request) => {
        expect(String(value)).toBe(LESSON_ZERO_CLASSROOM_EXPRESSIONS_URL);
        return new Response(fs.readFileSync(CONTENT_PATH), {
            status: 200,
            headers: { 'content-type': 'application/json' },
        });
    }) as unknown as typeof fetch;
}

describe('Lesson 0 classroom-expression session', () => {
    it('preserves all fourteen source records as seventeen serious constructed-response probes', async () => {
        const definition = await loadLessonZeroClassroomExpressions(contentFetcher());
        const canonical = JSON.parse(fs.readFileSync(LESSON_ZERO_PATH, 'utf8')) as {
            sourceLibrary: { questions: Array<{ id: string }> };
        };

        expect(definition.expressions).toHaveLength(14);
        expect(definition.expressions.map(expression => expression.sourceQuestionId))
            .toEqual(LESSON_ZERO_CLASSROOM_EXPRESSION_SOURCE_IDS);
        expect(definition.expressions.map(expression => expression.sourceQuestionId))
            .toEqual(canonical.sourceLibrary.questions.map(question => question.id));
        expect(definition.expressions.flatMap(expression => expression.probes)).toHaveLength(17);
        expect(definition.expressions.find(expression => expression.id === 'expression:classroom-08')?.probes)
            .toHaveLength(3);
        expect(definition.expressions.find(expression => expression.id === 'expression:classroom-11')?.probes)
            .toHaveLength(2);
        expect(new Set(definition.expressions.map(expression => expression.responseKind)))
            .toEqual(new Set(['constructed-japanese']));
        expect(new Set(definition.expressions.map(expression => expression.inputMode)))
            .toEqual(new Set(['ime']));
        expect(JSON.stringify(definition)).not.toMatch(/"(?:choices|options|distractors|audioAssetId|voiceAssetId|browserTtsAllowed)"/u);
    });

    it('projects prompts without accepted answers, model answers, translations, or selectable distractors', () => {
        const definition = validateLessonZeroClassroomExpressions(packageJson());
        const started = startClassroomExpressionSession(definition);

        for (const expression of definition.expressions) {
            for (const probe of expression.probes) {
                const state: ClassroomExpressionSessionState = {
                    ...started,
                    cursor: { phaseId: expression.phaseId, expressionId: expression.id, probeId: probe.id },
                    visitedExpressionIds: [started.cursor.expressionId, expression.id]
                        .filter((id, index, values) => values.indexOf(id) === index),
                };
                const serialized = JSON.stringify(readClassroomExpressionSession(definition, state));
                for (const answer of probe.acceptedAnswers) expect(serialized).not.toContain(answer);
                expect(serialized).not.toContain(probe.modelAnswer);
                expect(serialized).not.toMatch(/acceptedAnswers|modelAnswer|translation|distractor|choice/iu);
            }
        }
    });

    it('places concise bilingual teaching and a non-answer worked example before every probe', () => {
        const definition = validateLessonZeroClassroomExpressions(packageJson());
        const started = startClassroomExpressionSession(definition);

        expect(definition.teachingBlocks).toHaveLength(6);
        expect(new Set(definition.teachingBlocks.flatMap(block => block.expressionIds)).size).toBe(14);
        for (const expression of definition.expressions) {
            const probe = expression.probes[0]!;
            const state: ClassroomExpressionSessionState = {
                ...started,
                cursor: { phaseId: expression.phaseId, expressionId: expression.id, probeId: probe.id },
                visitedExpressionIds: [started.cursor.expressionId, expression.id]
                    .filter((id, index, values) => values.indexOf(id) === index),
            };
            const teaching = readClassroomExpressionSession(definition, state).preAssessmentTeaching;
            expect(teaching.explanation.en).toBeTruthy();
            expect(teaching.explanation.ja).toBeTruthy();
            expect(teaching.workedExample.japanese).toMatch(/[ぁ-んァ-ヶ一-龠]/u);
            for (const accepted of expression.probes.flatMap(item => item.acceptedAnswers)) {
                expect(JSON.stringify(teaching)).not.toContain(accepted);
            }
        }
    });

    it('supports ordered next/back navigation, direct phase jumps, pause, and serialisable resume', () => {
        const definition = validateLessonZeroClassroomExpressions(packageJson());
        let state = startClassroomExpressionSession(definition);
        expect(state.cursor.probeId).toBe('probe:classroom-01-start');

        state = transitionClassroomExpressionSession(definition, state, {
            kind: 'navigate', target: { kind: 'phase', id: 'feedback' },
        }, 1).state;
        expect(state.cursor.probeId).toBe('probe:classroom-10-good');

        state = transitionClassroomExpressionSession(definition, state, {
            kind: 'navigate', target: { kind: 'previous' },
        }, 2).state;
        expect(state.cursor.probeId).toBe('probe:classroom-09-repeat');

        state = transitionClassroomExpressionSession(definition, state, {
            kind: 'navigate', target: { kind: 'expression', id: 'expression:classroom-14' },
        }, 3).state;
        expect(state.cursor.probeId).toBe('probe:classroom-14-example');

        const paused = transitionClassroomExpressionSession(definition, state, { kind: 'pause' }, 4).state;
        const restored = startClassroomExpressionSession(definition, JSON.parse(JSON.stringify(paused)));
        expect(restored.status).toBe('paused');
        const resumed = transitionClassroomExpressionSession(definition, restored, { kind: 'resume' }, 5).state;
        expect(resumed).toMatchObject({ status: 'active', cursor: state.cursor });
    });

    it('keeps a lapse in place, earns precise repair, and marks revealed retries as assisted', () => {
        const definition = validateLessonZeroClassroomExpressions(packageJson());
        let state = startClassroomExpressionSession(definition);

        const lapse = transitionClassroomExpressionSession(definition, state, {
            kind: 'submit', response: 'わかりました',
        }, 10);
        state = lapse.state;
        expect(state.cursor.probeId).toBe('probe:classroom-01-start');
        expect(lapse.evidence).toEqual([
            expect.objectContaining({
                kind: 'attempt-recorded',
                sourceQuestionId: 'source-question:classroom-phrase-01',
                outcome: 'lapse',
                errorTags: ['classroom-start-form'],
            }),
            expect.objectContaining({
                kind: 'learning-evidence-recorded',
                action: 'repair',
                independent: true,
            }),
        ]);
        expect(lapse.view.earnedRepair).toMatchObject({
            modelAnswerAvailable: true,
            retryPrompt: expect.objectContaining({ en: expect.any(String), ja: expect.any(String) }),
        });
        expect(lapse.view.earnedRepair).not.toHaveProperty('modelAnswer');

        const revealed = transitionClassroomExpressionSession(definition, state, { kind: 'reveal-model' }, 11);
        state = revealed.state;
        expect(revealed.evidence).toEqual([expect.objectContaining({
            kind: 'support-used', supportKind: 'model-answer',
        })]);
        expect(revealed.view.earnedRepair?.modelAnswer).toBe('はじめましょう');

        const repaired = transitionClassroomExpressionSession(definition, state, {
            kind: 'submit', response: '始めましょう。',
        }, 12);
        expect(repaired.state.cursor.probeId).toBe('probe:classroom-02-finish');
        expect(repaired.evidence).toContainEqual(expect.objectContaining({
            kind: 'learning-evidence-recorded',
            outcome: 'pass',
            action: 'repair',
            independent: false,
        }));
        expect(repaired.view.progress.probes.repaired).toBe(1);
    });

    it('does not treat a jump to the final item as lesson completion', () => {
        const definition = validateLessonZeroClassroomExpressions(packageJson());
        let state = startClassroomExpressionSession(definition);
        state = transitionClassroomExpressionSession(definition, state, {
            kind: 'navigate', target: { kind: 'expression', id: 'expression:classroom-14' },
        }, 20).state;
        state = transitionClassroomExpressionSession(definition, state, {
            kind: 'submit', response: 'れい',
        }, 21).state;

        const report = buildClassroomExpressionSessionReport(definition, state);
        expect(state.status).toBe('active');
        expect(report.sourceQuestions).toMatchObject({ total: 14, completed: 1 });
        expect(report.sourceQuestions.unresolvedIds).toHaveLength(13);
    });

    it('completes only after every probe passes and emits source-linked evidence for all fourteen records', () => {
        const definition = validateLessonZeroClassroomExpressions(packageJson());
        const probeById = new Map(definition.expressions.flatMap(expression =>
            expression.probes.map(probe => [probe.id, probe] as const)));
        let state = startClassroomExpressionSession(definition);
        const evidence = [];
        let at = 100;
        while (state.status === 'active') {
            const answer = probeById.get(state.cursor.probeId)?.modelAnswer;
            expect(answer).toBeDefined();
            const transition = transitionClassroomExpressionSession(definition, state, {
                kind: 'submit', response: answer!,
            }, at++);
            evidence.push(...transition.evidence);
            state = transition.state;
        }

        const report = buildClassroomExpressionSessionReport(definition, state);
        expect(state.status).toBe('complete');
        expect(report.sourceQuestions).toEqual({
            total: 14,
            attempted: 14,
            completed: 14,
            completedIds: LESSON_ZERO_CLASSROOM_EXPRESSION_SOURCE_IDS,
            unresolvedIds: [],
        });
        expect(report.probes).toEqual({ total: 17, completed: 17, repaired: 0 });
        const sourceEvidence = evidence
            .filter(event => event.kind === 'attempt-recorded')
            .map(event => event.sourceQuestionId);
        expect(new Set(sourceEvidence)).toEqual(new Set(LESSON_ZERO_CLASSROOM_EXPRESSION_SOURCE_IDS));
    });

    it('rejects answer leakage, multiple-choice structure, unverified audio, and dishonest completion snapshots', () => {
        const leaked = packageJson() as unknown as {
            expressions: Array<{ probes: Array<{ prompt: { ja: string } }> }>;
        };
        leaked.expressions[0]!.probes[0]!.prompt.ja = 'はじめましょうと入力してください。';
        expect(() => validateLessonZeroClassroomExpressions(leaked)).toThrow(/exposes an accepted answer/i);

        const teachingLeak = packageJson() as unknown as {
            teachingBlocks: Array<{ workedExample: { japanese: string } }>;
        };
        teachingLeak.teachingBlocks[0]!.workedExample.japanese = 'はじめましょう。';
        expect(() => validateLessonZeroClassroomExpressions(teachingLeak)).toThrow(/teaching block.*exposes/i);

        const crossLeak = packageJson() as unknown as {
            teachingBlocks: Array<{ explanation: { ja: string } }>;
        };
        crossLeak.teachingBlocks[0]!.explanation.ja = 'しゅくだいを確認します。';
        expect(() => validateLessonZeroClassroomExpressions(crossLeak))
            .toThrow(/teaching block.*classroom-13-homework/i);

        const choice = packageJson() as ClassroomExpressionSessionDefinition & { choices?: string[] };
        choice.choices = ['answer'];
        expect(() => validateLessonZeroClassroomExpressions(choice)).toThrow(/introduces choices or unverified audio/i);

        const fakeAudio = packageJson() as ClassroomExpressionSessionDefinition & { audioAssetId?: string };
        fakeAudio.audioAssetId = 'audio:fake';
        expect(() => validateLessonZeroClassroomExpressions(fakeAudio)).toThrow(/introduces choices or unverified audio/i);

        const definition = validateLessonZeroClassroomExpressions(packageJson());
        const invalid = { ...startClassroomExpressionSession(definition), status: 'complete' };
        expect(() => startClassroomExpressionSession(definition, invalid)).toThrow(/completion must match/i);
    });
});

describe('classroom-expression-session-screen behavior', () => {
    const CONTENT_PATH = path.resolve('public/academy/content/lessons/lesson-zero-classroom-expressions.v1.json');
    
    function definition() {
        return validateLessonZeroClassroomExpressions(JSON.parse(fs.readFileSync(CONTENT_PATH, 'utf8')));
    }
    
    describe('Classroom expression session screen', () => {
        it('teaches before commitment, keeps the answer hidden, then earns repair and the model', async () => {
            const content = definition();
            const initial = classroomStateForActivity(
                content,
                startClassroomExpressionSession(content),
                'activity:lesson-zero-reconstruct-repair',
            );
            const onTransition = vi.fn(async () => undefined);
            const screen = createClassroomExpressionSessionScreen({
                language: 'en',
                activityId: 'activity:lesson-zero-reconstruct-repair',
                definition: content,
                initialState: initial,
                pronunciation: { play: vi.fn(async () => ({ dispose() {} })) } as never,
                onTransition,
                onRestart: vi.fn(),
                onBack: vi.fn(),
            });
    
            expect(screen.element.textContent).toContain('Notice the pattern');
            expect(screen.element.querySelector('.academy-classroom-expression-overall')?.textContent)
                .toBe('0 of 8 moments answered');
            expect(screen.element.querySelector<HTMLButtonElement>('.academy-classroom-expression-back')).toMatchObject({
                textContent: '←',
            });
            expect(screen.element.querySelector('.academy-classroom-expression-back')?.getAttribute('aria-label'))
                .toBe('Back');
            expect(screen.element.textContent).not.toContain('わかりますか');
            const input = screen.element.querySelector<HTMLInputElement>('.academy-classroom-expression-input')!;
            input.value = 'わかりました';
            screen.element.querySelector<HTMLFormElement>('.academy-classroom-expression-form')!
                .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    
            await vi.waitFor(() => expect(onTransition).toHaveBeenCalledOnce());
            await vi.waitFor(() => expect(screen.element.querySelector('[data-repair-earned="true"]')).not.toBeNull());
            expect(screen.element.textContent).not.toContain('わかりますか');
            screen.element.querySelector<HTMLButtonElement>('.academy-classroom-expression-reveal')?.click();
            await vi.waitFor(() => expect(onTransition).toHaveBeenCalledTimes(2));
            await vi.waitFor(() => expect(screen.element.textContent).toContain('わかりますか'));
            screen.dispose();
        });
    
        it('offers a full replay after the selected activity is complete', async () => {
            const content = definition();
            const answers = new Map(content.expressions.flatMap(expression =>
                expression.probes.map(probe => [probe.id, probe.modelAnswer] as const)));
            let state = classroomStateForActivity(
                content,
                startClassroomExpressionSession(content),
                'activity:lesson-zero-desk-language',
            );
            while (!completedClassroomActivityIds(content, state).includes('activity:lesson-zero-desk-language')) {
                state = transitionClassroomExpressionSession(content, state, {
                    kind: 'submit', response: answers.get(state.cursor.probeId)!,
                }, state.attempts.length + 1).state;
            }
            const onRestart = vi.fn(async () => undefined);
            const screen = createClassroomExpressionSessionScreen({
                language: 'en',
                activityId: 'activity:lesson-zero-desk-language',
                definition: content,
                initialState: state,
                pronunciation: { play: vi.fn(async () => ({ dispose() {} })) } as never,
                onTransition: vi.fn(),
                onRestart,
                onBack: vi.fn(),
            });
    
            expect(screen.element.textContent).toContain('You can read the desk.');
            expect(screen.element.querySelector('.academy-classroom-expression-overall')?.textContent)
                .toBe('2 of 2 moments answered');
            expect(screen.element.querySelector<HTMLImageElement>('.academy-classroom-expression-desk-image')?.src)
                .toContain('/academy/art/items/classroom-belongings__v001.jpg');
            expect(screen.element.querySelector('[data-desk-slot="homework"]')?.textContent).toContain('しゅくだい');
            expect(screen.element.querySelector('[data-desk-slot="example"]')?.textContent).toContain('れい');
            const replay = [...screen.element.querySelectorAll<HTMLButtonElement>('button')]
                .find(button => button.textContent?.includes('Label the desk again'))!;
            replay.click();
            await vi.waitFor(() => expect(onRestart).toHaveBeenCalledOnce());
            await vi.waitFor(() => expect(screen.element.querySelector('.academy-classroom-expression-form')).not.toBeNull());
            screen.dispose();
        });
    
        it('keeps both desk labels blank until the learner earns each one', async () => {
            const content = definition();
            const initial = classroomStateForActivity(
                content,
                startClassroomExpressionSession(content),
                'activity:lesson-zero-desk-language',
            );
            const screen = createClassroomExpressionSessionScreen({
                language: 'en',
                activityId: 'activity:lesson-zero-desk-language',
                definition: content,
                initialState: initial,
                pronunciation: { play: vi.fn(async () => ({ dispose() {} })) } as never,
                onTransition: vi.fn(async () => undefined),
                onRestart: vi.fn(),
                onBack: vi.fn(),
            });
    
            const homework = screen.element.querySelector<HTMLElement>('[data-desk-slot="homework"]')!;
            const example = screen.element.querySelector<HTMLElement>('[data-desk-slot="example"]')!;
            expect(homework.dataset.earned).toBe('false');
            expect(example.dataset.earned).toBe('false');
            expect(homework.textContent).not.toContain('しゅくだい');
            expect(example.textContent).not.toContain('れい');
    
            const input = screen.element.querySelector<HTMLInputElement>('.academy-classroom-expression-input')!;
            input.value = 'しゅくだい';
            screen.element.querySelector<HTMLFormElement>('.academy-classroom-expression-form')!
                .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    
            await vi.waitFor(() => expect(
                screen.element.querySelector<HTMLElement>('[data-desk-slot="homework"]')?.dataset.earned,
            ).toBe('true'));
            expect(screen.element.querySelector('[data-desk-slot="homework"]')?.textContent).toContain('しゅくだい');
            expect(screen.element.querySelector<HTMLElement>('[data-desk-slot="example"]')?.dataset.earned).toBe('false');
            expect(screen.element.querySelector('[data-desk-slot="example"]')?.textContent).not.toContain('れい');
            screen.dispose();
        });
    });
});

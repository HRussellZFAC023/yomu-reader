import { describe, expect, it } from 'vitest';

import { gradeAnswer, normalizeAnswer, type GradingExercise, type LearnerInput } from '../../src/academy/grading';

describe('normalizeAnswer', () => {
    it('uses NFKC and canonicalizes whitespace and Japanese punctuation', () => {
        expect(normalizeAnswer('　ｶﾀｶﾅ　、　ＡＢＣ！　')).toBe('カタカナ,ABC!');
        expect(normalizeAnswer('  ice\t\tcream  ')).toBe('ice cream');
    });

    it('can ignore punctuation and whitespace when an exercise explicitly allows it', () => {
        expect(normalizeAnswer(' お は よ う！ ', {
            whitespace: 'ignore',
            punctuation: 'ignore',
        })).toBe('おはよう');
    });
});

describe('gradeAnswer exact answers', () => {
    it('matches normalized text and only declared kana/kanji alternatives', () => {
        const exercise = {
            kind: 'exact' as const,
            answer: {
                primary: '食べる',
                alternatives: ['たべる'],
            },
        };

        const kanaResult = gradeAnswer(exercise, '　たべる　');
        expect(kanaResult).toMatchObject({
            learnerInput: '　たべる　',
            normalizedInput: 'たべる',
            autoGrade: {
                status: 'graded',
                correct: true,
                explanation: 'accepted-answer',
            },
        });

        const romanizedResult = gradeAnswer(exercise, 'taberu');
        expect(romanizedResult.autoGrade).toMatchObject({
            status: 'graded',
            correct: false,
            explanation: 'answer-not-accepted',
            mismatch: {
                code: 'answer-not-accepted',
                accepted: ['食べる', 'たべる'],
            },
        });
    });

    it('accepts punctuation equivalents without silently accepting omitted punctuation', () => {
        const exercise = {
            kind: 'exact' as const,
            answer: { primary: '日本語、勉強中。' },
        };

        expect(gradeAnswer(exercise, ' 日本語， 勉強中． ').autoGrade.correct).toBe(true);
        expect(gradeAnswer(exercise, '日本語勉強中').autoGrade.correct).toBe(false);
    });

    it('uses per-exercise opt-in policies for intentionally loose answers', () => {
        const result = gradeAnswer({
            kind: 'exact',
            answer: { primary: 'おはよう' },
            normalization: {
                whitespace: 'ignore',
                punctuation: 'ignore',
            },
        }, 'お は よ う！');

        expect(result.autoGrade.correct).toBe(true);
    });
});

describe('gradeAnswer selections and ordering', () => {
    it('accepts union-typed exercise and learner input at an application boundary', () => {
        const exercise: GradingExercise = {
            kind: 'choice',
            correctOptionId: 'particle-ga',
        };
        const learnerInput: LearnerInput = 'particle-ga';

        expect(gradeAnswer(exercise, learnerInput).autoGrade).toMatchObject({
            status: 'graded',
            correct: true,
            explanation: 'correct-choice',
        });
    });

    it('grades a single choice and returns a concise no-selection mismatch', () => {
        const result = gradeAnswer({
            kind: 'choice',
            correctOptionId: 'particle-ga',
        }, null);

        expect(result).toMatchObject({
            learnerInput: null,
            autoGrade: {
                status: 'graded',
                correct: false,
                explanation: 'no-choice-selected',
                mismatch: {
                    code: 'no-choice-selected',
                    expected: 'particle-ga',
                    received: null,
                },
            },
        });
    });

    it('treats multi-choice input as an unordered set while rejecting duplicate selections', () => {
        const exercise = {
            kind: 'multi-choice' as const,
            correctOptionIds: ['verb', 'adjective'],
        };
        const selected = ['adjective', 'verb'];
        const correctResult = gradeAnswer(exercise, selected);

        selected[0] = 'changed-after-grading';
        expect(correctResult.learnerInput).toEqual(['adjective', 'verb']);
        expect(correctResult.autoGrade.correct).toBe(true);

        const duplicateResult = gradeAnswer(exercise, ['verb', 'verb', 'adjective']);
        expect(duplicateResult.autoGrade).toMatchObject({
            correct: false,
            explanation: 'multiple-choice-mismatch',
            mismatch: {
                code: 'multiple-choice-mismatch',
                missing: [],
                unexpected: [],
                duplicateSelections: ['verb'],
            },
        });
    });

    it('reports the first order mismatch and multiset differences', () => {
        const result = gradeAnswer({
            kind: 'order',
            correctOrder: ['topic', 'topic', 'verb'],
        }, ['topic', 'verb', 'extra']);

        expect(result.autoGrade).toMatchObject({
            status: 'graded',
            correct: false,
            explanation: 'order-mismatch',
            mismatch: {
                code: 'order-mismatch',
                firstDifferentIndex: 1,
                expected: 'topic',
                received: 'verb',
                missing: ['topic'],
                unexpected: ['extra'],
            },
        });
    });
});

describe('gradeAnswer cloze answers', () => {
    it('keeps the whole submission and grades each blank with declared alternatives', () => {
        const submission = {
            day: 'きょう',
            verb: '食べる',
            ungradedDraft: 'preserved',
        };
        const result = gradeAnswer({
            kind: 'cloze',
            blanks: [
                {
                    id: 'day',
                    answer: {
                        primary: '今日',
                        alternatives: ['きょう'],
                    },
                },
                {
                    id: 'verb',
                    answer: { primary: '食べます' },
                },
            ],
        }, submission);

        submission.day = 'changed-after-grading';
        expect(result.learnerInput).toEqual({
            day: 'きょう',
            verb: '食べる',
            ungradedDraft: 'preserved',
        });
        expect(result.blanks).toMatchObject([
            {
                id: 'day',
                learnerInput: 'きょう',
                autoGrade: { correct: true },
            },
            {
                id: 'verb',
                learnerInput: '食べる',
                autoGrade: {
                    correct: false,
                    mismatch: { code: 'answer-not-accepted' },
                },
            },
        ]);
        expect(result.autoGrade).toMatchObject({
            correct: false,
            explanation: 'cloze-answer-mismatch',
            mismatch: {
                code: 'cloze-answer-mismatch',
                blankIds: ['verb'],
            },
        });
    });

    it('distinguishes a missing cloze answer from an answered-but-wrong blank', () => {
        const result = gradeAnswer({
            kind: 'cloze',
            blanks: [{ id: 'subject', answer: { primary: '私' } }],
        }, {});

        expect(result.blanks[0]?.autoGrade).toMatchObject({
            correct: false,
            explanation: 'missing-answer',
            mismatch: {
                code: 'missing-answer',
                accepted: ['私'],
            },
        });
    });
});

describe('gradeAnswer open writing', () => {
    it('keeps auto grading separate from target-pattern and rubric evidence', () => {
        const learnerInput = '私は　りんごを　食べます。';
        const result = gradeAnswer({
            kind: 'open-writing',
            targetPatterns: [
                { id: 'polite-verb', pattern: '食べます。' },
                { id: 'sentence-shape', pattern: '^私は.*食べます\\.$', mode: 'regex' },
                { id: 'past-tense', pattern: '食べました', mode: 'includes' },
            ],
            rubrics: [
                { id: 'naturalness', criterion: 'Uses a natural sentence for the prompt.' },
            ],
        }, learnerInput);

        expect(result.learnerInput).toBe(learnerInput);
        expect(result.normalizedInput).toBe('私は りんごを 食べます.');
        expect(result.autoGrade).toEqual({
            status: 'not-graded',
            explanation: 'open-writing-requires-review',
        });
        expect(result.autoGrade).not.toHaveProperty('correct');
        expect(result.writingChecks).toEqual({
            targetPatterns: [
                {
                    id: 'polite-verb',
                    mode: 'includes',
                    status: 'matched',
                    explanation: 'target-pattern-matched',
                },
                {
                    id: 'sentence-shape',
                    mode: 'regex',
                    status: 'matched',
                    explanation: 'target-pattern-matched',
                },
                {
                    id: 'past-tense',
                    mode: 'includes',
                    status: 'not-matched',
                    explanation: 'target-pattern-not-matched',
                },
            ],
            rubrics: [
                {
                    id: 'naturalness',
                    criterion: 'Uses a natural sentence for the prompt.',
                    status: 'review-required',
                },
            ],
        });
    });

    it('reports malformed target regexes as advisory configuration errors', () => {
        const result = gradeAnswer({
            kind: 'open-writing',
            targetPatterns: [{ id: 'broken', pattern: '(', mode: 'regex' }],
        }, '書きます。');

        expect(result.autoGrade.status).toBe('not-graded');
        expect(result.writingChecks.targetPatterns).toEqual([{
            id: 'broken',
            mode: 'regex',
            status: 'invalid',
            explanation: 'invalid-target-pattern',
        }]);
    });
});

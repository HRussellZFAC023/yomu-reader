import fs from 'node:fs';
import path from 'node:path';
import { createLessonZeroSentenceFrameDefinition } from '../../src/academy/content/lesson-zero-sentence-frames';
import { validateLessonZeroPackage } from '../../src/academy/content/lesson-zero-validator';
import {
    lessonZeroSentenceFrameSessionSnapshotShapeIsValid,
    startLessonZeroSentenceFrameSession,
    transitionLessonZeroSentenceFrameSession,
    type LessonZeroSentenceFrameSessionDefinition,
    type LessonZeroSentenceFrameSessionState,
} from '../../src/academy/domain/lesson-zero-sentence-frame-session';

function definition(): LessonZeroSentenceFrameSessionDefinition {
    const lesson = validateLessonZeroPackage(JSON.parse(fs.readFileSync(
        path.resolve('public/academy/content/lessons/lesson-zero.v1.json'),
        'utf8',
    ))).lesson;
    return createLessonZeroSentenceFrameDefinition(
        lesson.activities.find(activity => activity.id === 'activity:lesson-zero-build-sentence-frames')!,
    );
}

function started(content = definition()): LessonZeroSentenceFrameSessionState {
    return transitionLessonZeroSentenceFrameSession(
        content,
        startLessonZeroSentenceFrameSession(content),
        { kind: 'start' },
        1,
    ).state;
}

function selectOrder(
    content: LessonZeroSentenceFrameSessionDefinition,
    state: LessonZeroSentenceFrameSessionState,
    order: readonly string[],
): LessonZeroSentenceFrameSessionState {
    let next = state.stage === 'teach'
        ? transitionLessonZeroSentenceFrameSession(content, state, { kind: 'open-build' }, 2).state
        : state;
    for (const tokenId of order) {
        next = transitionLessonZeroSentenceFrameSession(content, next, { kind: 'select-token', tokenId }, 3).state;
    }
    return next;
}

describe('Lesson Zero first-sentence session', () => {
    it('binds all five canonical patterns to connected true classroom turns', () => {
        const content = definition();
        expect(content.frames.map(frame => frame.pattern)).toEqual([
            'N は N です',
            'N は N じゃありません',
            'N は N ですか',
            'N の N',
            'N も N です',
        ]);
        expect(content.frames.map(frame => frame.target.japanese)).toEqual([
            'わたしは学生です。',
            'りえ先生は学生じゃありません。',
            'ソフィーさんは学生ですか。',
            'りえ先生のクラスです。',
            'ソフィーさんも学生です。',
        ]);
        expect(content.frames.every(frame => frame.nearbyExample.japanese !== frame.target.japanese)).toBe(true);
    });

    it('records a lapse, earns exact support, then schedules the repaired line', () => {
        const content = definition();
        const frame = content.frames[0]!;
        let state = selectOrder(content, started(content), frame.target.bankOrder);
        const lapse = transitionLessonZeroSentenceFrameSession(content, state, { kind: 'check' }, 4);
        expect(lapse.evaluation).toMatchObject({
            attempt: {
                activityId: 'activity:lesson-zero-build-sentence-frames:identity',
                outcome: 'lapse',
                responseKind: 'tapped-token-order',
            },
            reviewSeeds: [],
        });
        expect(lapse.supportEvents).toEqual([]);

        const support = transitionLessonZeroSentenceFrameSession(
            content,
            lapse.state,
            { kind: 'reveal-model' },
            5,
        );
        expect(support.supportEvents.map(event => event.supportKind)).toEqual([
            'transcript',
            'translation',
            'model-answer',
        ]);
        state = transitionLessonZeroSentenceFrameSession(content, support.state, { kind: 'retry' }, 6).state;
        state = selectOrder(content, state, frame.target.correctOrder);
        const repaired = transitionLessonZeroSentenceFrameSession(content, state, { kind: 'check' }, 7);
        expect(repaired.evaluation?.reviewSeeds).toEqual([
            expect.objectContaining({
                id: 'review:lesson-zero:sentence-frame:identity',
                reason: 'repair',
            }),
        ]);
        expect(repaired.adaptive).toMatchObject({ action: 'repair', independent: false, skill: 'writing' });
        expect(repaired.state.stage).toBe('result');
    });

    it('repairs a recall lapse without scheduling a duplicate review card', () => {
        const content = definition();
        let state = started(content);
        for (const [index, frame] of content.frames.entries()) {
            state = selectOrder(content, state, frame.target.correctOrder);
            const checked = transitionLessonZeroSentenceFrameSession(content, state, { kind: 'check' }, 80 + index);
            state = index < content.frames.length - 1
                ? transitionLessonZeroSentenceFrameSession(
                    content,
                    checked.state,
                    { kind: 'next-frame' },
                    90 + index,
                ).state
                : transitionLessonZeroSentenceFrameSession(
                    content,
                    checked.state,
                    { kind: 'begin-transfer' },
                    100,
                ).state;
        }

        const frame = content.frames[0]!;
        state = selectOrder(content, state, frame.target.bankOrder);
        const lapse = transitionLessonZeroSentenceFrameSession(content, state, { kind: 'check' }, 101);
        expect(lapse.evaluation).toMatchObject({
            attempt: {
                responseKind: 'tapped-token-order-transfer',
                outcome: 'lapse',
            },
            reviewSeeds: [],
        });
        const support = transitionLessonZeroSentenceFrameSession(
            content,
            lapse.state,
            { kind: 'reveal-model' },
            102,
        );
        expect(support.state.revealedTransferModelFrameIds).toEqual(['identity']);
        expect(support.supportEvents.map(event => event.supportKind)).toEqual([
            'transcript',
            'translation',
            'model-answer',
        ]);
        state = transitionLessonZeroSentenceFrameSession(content, support.state, { kind: 'retry' }, 103).state;
        state = selectOrder(content, state, frame.target.correctOrder);
        const repaired = transitionLessonZeroSentenceFrameSession(content, state, { kind: 'check' }, 104);
        expect(repaired.evaluation?.reviewSeeds).toEqual([]);
        expect(repaired.adaptive).toMatchObject({ action: 'repair', independent: false, skill: 'writing' });
        expect(repaired.state.stage).toBe('transfer-result');
    });

    it('completes only after five guided builds and five unscaffolded recalls', () => {
        const content = definition();
        let state = started(content);
        for (const [index, frame] of content.frames.entries()) {
            state = selectOrder(content, state, frame.target.correctOrder);
            const checked = transitionLessonZeroSentenceFrameSession(content, state, { kind: 'check' }, 10 + index);
            expect(checked.evaluation?.attempt.activityId).toBe(frame.activityId);
            expect(checked.evaluation?.attempt.responseKind).toBe('tapped-token-order');
            expect(checked.evaluation?.reviewSeeds).toEqual([
                expect.objectContaining({ id: `review:lesson-zero:sentence-frame:${frame.id}` }),
            ]);
            expect(checked.completionEvaluation).toBeUndefined();
            if (index < content.frames.length - 1) {
                state = transitionLessonZeroSentenceFrameSession(content, checked.state, { kind: 'next-frame' }, 20 + index).state;
            } else {
                state = transitionLessonZeroSentenceFrameSession(
                    content,
                    checked.state,
                    { kind: 'begin-transfer' },
                    30,
                ).state;
            }
        }
        expect(state).toMatchObject({ stage: 'transfer-build', cursor: 0, status: 'active' });

        for (const [index, frame] of content.frames.entries()) {
            state = selectOrder(content, state, frame.target.correctOrder);
            const recalled = transitionLessonZeroSentenceFrameSession(content, state, { kind: 'check' }, 40 + index);
            expect(recalled.evaluation).toMatchObject({
                attempt: {
                    activityId: frame.activityId,
                    responseKind: 'tapped-token-order-transfer',
                    outcome: 'pass',
                },
                reviewSeeds: [],
            });
            expect(recalled.adaptive).toMatchObject({
                action: 'transfer',
                independent: true,
                skill: 'writing',
            });
            if (index < content.frames.length - 1) {
                expect(recalled.completionEvaluation).toBeUndefined();
                state = transitionLessonZeroSentenceFrameSession(
                    content,
                    recalled.state,
                    { kind: 'next-transfer' },
                    50 + index,
                ).state;
            } else {
                expect(recalled.completionEvaluation?.attempt).toMatchObject({
                    activityId: 'activity:lesson-zero-build-sentence-frames',
                    responseKind: 'sentence-constructions',
                    outcome: 'pass',
                });
                state = recalled.state;
            }
        }
        expect(state.status).toBe('complete');
        expect(state.passedFrameIds).toEqual(['identity', 'correction', 'question', 'noun-link', 'parallel']);
        expect(state.attempts.filter(attempt => attempt.phase === 'transfer')).toHaveLength(5);
    });

    it('round-trips a paused build and rejects impossible chronological completion', () => {
        const content = definition();
        let state = transitionLessonZeroSentenceFrameSession(content, started(content), { kind: 'open-build' }, 2).state;
        state = transitionLessonZeroSentenceFrameSession(content, state, { kind: 'select-token', tokenId: 'self' }, 3).state;
        const paused = transitionLessonZeroSentenceFrameSession(content, state, { kind: 'pause' }, 4).state;
        expect(startLessonZeroSentenceFrameSession(content, paused)).toEqual(paused);
        expect(lessonZeroSentenceFrameSessionSnapshotShapeIsValid({
            ...paused,
            status: 'complete',
            stage: 'complete',
        })).toBe(false);
        expect(() => startLessonZeroSentenceFrameSession(content, {
            ...paused,
            passedFrameIds: ['correction'],
        })).toThrow(/chronological/i);
    });

    it('keeps a completed checkpoint from the pre-recall release valid', () => {
        const content = definition();
        let state = started(content);
        for (const [index, frame] of content.frames.entries()) {
            state = selectOrder(content, state, frame.target.correctOrder);
            const checked = transitionLessonZeroSentenceFrameSession(content, state, { kind: 'check' }, 60 + index);
            const legacyAttempts = checked.state.attempts.map(({ phase: _phase, ...attempt }) => attempt);
            if (index < content.frames.length - 1) {
                state = transitionLessonZeroSentenceFrameSession(
                    content,
                    { ...checked.state, attempts: legacyAttempts },
                    { kind: 'next-frame' },
                    70 + index,
                ).state;
            } else {
                const legacy = {
                    ...checked.state,
                    status: 'complete' as const,
                    stage: 'complete' as const,
                    attempts: legacyAttempts,
                };
                expect(lessonZeroSentenceFrameSessionSnapshotShapeIsValid(legacy)).toBe(true);
                expect(startLessonZeroSentenceFrameSession(content, legacy)).toMatchObject({
                    status: 'complete',
                    stage: 'complete',
                });
            }
        }
    });
});

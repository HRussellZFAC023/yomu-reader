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
        'Henry',
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
            'わたしはHenryです。',
            'りえ先生は学生じゃありません。',
            'ソフィーさんは学生ですか。',
            'りえ先生のクラスです。',
            'わたしも学生です。',
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

    it('completes the canonical activity only after all five frames pass', () => {
        const content = definition();
        let state = started(content);
        for (const [index, frame] of content.frames.entries()) {
            state = selectOrder(content, state, frame.target.correctOrder);
            const checked = transitionLessonZeroSentenceFrameSession(content, state, { kind: 'check' }, 10 + index);
            expect(checked.evaluation?.attempt.activityId).toBe(frame.activityId);
            if (index < content.frames.length - 1) {
                expect(checked.completionEvaluation).toBeUndefined();
                state = transitionLessonZeroSentenceFrameSession(content, checked.state, { kind: 'next-frame' }, 20 + index).state;
            } else {
                expect(checked.completionEvaluation?.attempt).toMatchObject({
                    activityId: 'activity:lesson-zero-build-sentence-frames',
                    responseKind: 'sentence-constructions',
                    outcome: 'pass',
                });
                state = checked.state;
            }
        }
        expect(state.status).toBe('complete');
        expect(state.passedFrameIds).toEqual(['identity', 'correction', 'question', 'noun-link', 'parallel']);
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
});

import fs from 'node:fs';
import path from 'node:path';
import { createLessonZeroNameCardDefinition } from '../../src/academy/content/lesson-zero-name-card';
import { getCompleteLessonRegistration } from '../../src/academy/content/lesson-content-registry';
import { validateLessonZeroPackage } from '../../src/academy/content/lesson-zero-validator';
import {
    lessonZeroNameCardLine,
    lessonZeroNameCardSessionSnapshotShapeIsValid,
    startLessonZeroNameCardSession,
    transitionLessonZeroNameCardSession,
    type LessonZeroNameCardDefinition,
} from '../../src/academy/domain/lesson-zero-name-card-session';

const LESSON_PATH = path.resolve('public/academy/content/lessons/lesson-zero.v1.json');

function definition(): LessonZeroNameCardDefinition {
    const lesson = validateLessonZeroPackage(JSON.parse(fs.readFileSync(LESSON_PATH, 'utf8'))).lesson;
    return createLessonZeroNameCardDefinition(
        lesson.activities.find(activity => activity.id === 'activity:lesson-zero-name-card-draft')!,
        'Henry',
    );
}

describe('Lesson Zero name-card session', () => {
    it('transfers the saved player name into one familiar です frame', () => {
        const content = definition();
        expect(content.activityId).toBe('activity:lesson-zero-name-card-draft');
        expect(getCompleteLessonRegistration('lesson:foundation-00').trustedActivityIds)
            .toContain(content.activityId);
        expect(content.conceptIds).toEqual([
            'concept:self-introduction-name',
            'concept:copula-affirmative',
        ]);
        expect(content.correctOrder).toEqual(['learner-name', 'desu']);
        expect(lessonZeroNameCardLine(content)).toBe('Henryです。');
        expect(JSON.stringify(startLessonZeroNameCardSession(content))).not.toContain('Henry');
    });

    it('keeps the model locked until a committed lapse, then records an assisted repair', () => {
        const content = definition();
        let state = startLessonZeroNameCardSession(content);
        const earlyHelp = transitionLessonZeroNameCardSession(content, state, { kind: 'reveal-model' }, 2);
        expect(earlyHelp.state.modelRevealed).toBe(false);
        expect(earlyHelp.supportEvents).toEqual([]);

        state = transitionLessonZeroNameCardSession(content, state, { kind: 'select-token', tokenId: 'desu' }, 3).state;
        state = transitionLessonZeroNameCardSession(content, state, { kind: 'select-token', tokenId: 'learner-name' }, 4).state;
        const lapse = transitionLessonZeroNameCardSession(content, state, { kind: 'check' }, 5);
        expect(lapse.evaluation).toMatchObject({
            attempt: {
                outcome: 'lapse',
                responseKind: 'tapped-name-card-frame',
                errorTags: ['name-card:word-order'],
            },
            reviewSeeds: [],
        });

        const support = transitionLessonZeroNameCardSession(content, lapse.state, { kind: 'reveal-model' }, 6);
        expect(support.state.modelRevealed).toBe(true);
        expect(support.supportEvents.map(event => event.supportKind)).toEqual([
            'transcript', 'translation', 'model-answer',
        ]);
        state = transitionLessonZeroNameCardSession(content, support.state, { kind: 'retry' }, 7).state;
        state = transitionLessonZeroNameCardSession(content, state, { kind: 'select-token', tokenId: 'learner-name' }, 8).state;
        state = transitionLessonZeroNameCardSession(content, state, { kind: 'select-token', tokenId: 'desu' }, 9).state;
        const repaired = transitionLessonZeroNameCardSession(content, state, { kind: 'check' }, 10);

        expect(repaired.state.status).toBe('complete');
        expect(repaired.evaluation?.reviewSeeds).toEqual([
            expect.objectContaining({ id: 'review:lesson-zero:name-card:desu', reason: 'repair' }),
        ]);
        expect(repaired.adaptive).toMatchObject({ skill: 'grammar', action: 'repair', independent: false });
    });

    it('records an independent pass without requiring kana input', () => {
        const content = definition();
        let state = startLessonZeroNameCardSession(content);
        state = transitionLessonZeroNameCardSession(content, state, { kind: 'select-token', tokenId: 'learner-name' }, 2).state;
        state = transitionLessonZeroNameCardSession(content, state, { kind: 'select-token', tokenId: 'desu' }, 3).state;
        const result = transitionLessonZeroNameCardSession(content, state, { kind: 'check' }, 4);

        expect(result.evaluation?.attempt).toMatchObject({ outcome: 'pass', score: 1 });
        expect(result.adaptive).toMatchObject({ skill: 'grammar', action: 'produce', independent: true });
    });

    it('round-trips a paused token order and rejects altered or impossible snapshots', () => {
        const content = definition();
        let state = startLessonZeroNameCardSession(content);
        state = transitionLessonZeroNameCardSession(content, state, { kind: 'select-token', tokenId: 'learner-name' }, 2).state;
        const paused = transitionLessonZeroNameCardSession(content, state, { kind: 'pause' }, 3).state;
        expect(startLessonZeroNameCardSession(content, paused)).toEqual(paused);
        expect(lessonZeroNameCardSessionSnapshotShapeIsValid({
            ...paused,
            status: 'complete',
            stage: 'complete',
        })).toBe(false);
        expect(() => startLessonZeroNameCardSession(content, {
            ...paused,
            selectedTokenIds: ['learner-name', 'learner-name'],
        })).toThrow(/invalid Lesson Zero name-card snapshot/i);
    });
});

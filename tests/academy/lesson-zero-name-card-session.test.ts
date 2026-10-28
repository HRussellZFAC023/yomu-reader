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
    it('makes the saved name a katakana-first naming moment without copying it into progress', () => {
        const content = definition();
        expect(content.activityId).toBe('activity:lesson-zero-name-card-draft');
        expect(getCompleteLessonRegistration('lesson:foundation-00').trustedActivityIds)
            .toContain(content.activityId);
        expect(content.conceptIds).toEqual([
            'concept:self-introduction-name',
            'concept:copula-affirmative',
        ]);
        expect(content.correctOrder).toEqual(['learner-name', 'desu']);
        expect(content).toMatchObject({
            usualName: 'Henry',
            katakanaName: 'ヘンリー',
            defaultNameVariant: 'katakana',
        });
        expect(lessonZeroNameCardLine(content)).toBe('ヘンリーです。');
        expect(lessonZeroNameCardLine(content, 'usual')).toBe('Henryです。');
        expect(JSON.stringify(startLessonZeroNameCardSession(content))).not.toMatch(/Henry|ヘンリー/);
    });

    it('repairs the name order and changed-person transfer before seeding SRS', () => {
        const content = definition();
        let state = startLessonZeroNameCardSession(content);
        const earlyHelp = transitionLessonZeroNameCardSession(content, state, { kind: 'reveal-model' }, 2);
        expect(earlyHelp.state.modelRevealed).toBe(false);
        expect(earlyHelp.supportEvents).toEqual([]);

        state = transitionLessonZeroNameCardSession(content, state, { kind: 'select-token', tokenId: 'desu' }, 3).state;
        state = transitionLessonZeroNameCardSession(content, state, { kind: 'select-token', tokenId: 'learner-name' }, 4).state;
        const buildLapse = transitionLessonZeroNameCardSession(content, state, { kind: 'check' }, 5);
        expect(buildLapse.state.stage).toBe('build-result');
        expect(buildLapse.evaluation).toMatchObject({
            attempt: {
                outcome: 'lapse',
                responseKind: 'tapped-name-card-frame',
                errorTags: ['name-card:word-order'],
            },
            reviewSeeds: [],
        });

        const buildSupport = transitionLessonZeroNameCardSession(content, buildLapse.state, { kind: 'reveal-model' }, 6);
        expect(buildSupport.state.modelRevealed).toBe(true);
        expect(buildSupport.supportEvents.map(event => event.supportKind)).toEqual([
            'transcript', 'translation', 'model-answer',
        ]);
        state = transitionLessonZeroNameCardSession(content, buildSupport.state, { kind: 'retry' }, 7).state;
        state = transitionLessonZeroNameCardSession(content, state, { kind: 'select-token', tokenId: 'learner-name' }, 8).state;
        state = transitionLessonZeroNameCardSession(content, state, { kind: 'select-token', tokenId: 'desu' }, 9).state;
        const buildPass = transitionLessonZeroNameCardSession(content, state, { kind: 'check' }, 10);
        expect(buildPass.state).toMatchObject({ status: 'active', stage: 'transfer' });
        expect(buildPass.evaluation?.reviewSeeds).toEqual([]);

        state = transitionLessonZeroNameCardSession(
            content,
            buildPass.state,
            { kind: 'select-transfer', transferId: 'learner' },
            11,
        ).state;
        const transferLapse = transitionLessonZeroNameCardSession(content, state, { kind: 'check' }, 12);
        expect(transferLapse.state.stage).toBe('transfer-result');
        expect(transferLapse.evaluation).toMatchObject({
            attempt: {
                outcome: 'lapse',
                responseKind: 'selected-changed-person-name-card',
                errorTags: ['name-card:changed-person'],
            },
            reviewSeeds: [],
        });

        const transferSupport = transitionLessonZeroNameCardSession(
            content,
            transferLapse.state,
            { kind: 'reveal-model' },
            13,
        );
        state = transitionLessonZeroNameCardSession(content, transferSupport.state, { kind: 'retry' }, 14).state;
        state = transitionLessonZeroNameCardSession(
            content,
            state,
            { kind: 'select-transfer', transferId: 'rie' },
            15,
        ).state;
        const repaired = transitionLessonZeroNameCardSession(content, state, { kind: 'check' }, 16);

        expect(repaired.state).toMatchObject({ status: 'complete', stage: 'complete' });
        expect(repaired.evaluation?.reviewSeeds).toEqual([
            expect.objectContaining({ id: 'review:lesson-zero:name-card:desu', reason: 'repair' }),
        ]);
        expect(repaired.adaptive).toMatchObject({ skill: 'grammar', action: 'repair', independent: false });
    });

    it('records independent production and transfer as separate evidence', () => {
        const content = definition();
        let state = startLessonZeroNameCardSession(content);
        state = transitionLessonZeroNameCardSession(content, state, { kind: 'select-token', tokenId: 'learner-name' }, 2).state;
        state = transitionLessonZeroNameCardSession(content, state, { kind: 'select-token', tokenId: 'desu' }, 3).state;
        const build = transitionLessonZeroNameCardSession(content, state, { kind: 'check' }, 4);
        expect(build.evaluation?.attempt).toMatchObject({ outcome: 'pass', score: 1 });
        expect(build.evaluation?.reviewSeeds).toEqual([]);
        expect(build.adaptive).toMatchObject({ action: 'produce', independent: true });

        state = transitionLessonZeroNameCardSession(
            content,
            build.state,
            { kind: 'select-transfer', transferId: 'rie' },
            5,
        ).state;
        const transfer = transitionLessonZeroNameCardSession(content, state, { kind: 'check' }, 6);
        expect(transfer.evaluation?.attempt).toMatchObject({
            outcome: 'pass',
            responseKind: 'selected-changed-person-name-card',
        });
        expect(transfer.evaluation?.reviewSeeds).toEqual([
            expect.objectContaining({ reason: 'new-learning' }),
        ]);
        expect(transfer.adaptive).toMatchObject({ action: 'transfer', independent: true });
    });

    it('round-trips a paused choice without storing names and rejects impossible snapshots', () => {
        const content = definition();
        let state = startLessonZeroNameCardSession(content);
        state = transitionLessonZeroNameCardSession(
            content,
            state,
            { kind: 'choose-name-variant', variant: 'usual' },
            2,
        ).state;
        state = transitionLessonZeroNameCardSession(content, state, { kind: 'select-token', tokenId: 'learner-name' }, 3).state;
        const paused = transitionLessonZeroNameCardSession(content, state, { kind: 'pause' }, 4).state;
        expect(startLessonZeroNameCardSession(content, paused)).toEqual(paused);
        expect(JSON.stringify(paused)).not.toMatch(/Henry|ヘンリー/);
        expect(paused.nameVariant).toBe('usual');
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

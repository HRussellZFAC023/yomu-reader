import { describe, expect, it } from 'vitest';
import {
    LESSON_ZERO_BASIC_HIRAGANA_COUNT,
    createLessonZeroHiraganaDefinition,
} from '../../src/academy/content/lesson-zero-hiragana';
import {
    lessonZeroHiraganaChoices,
    lessonZeroHiraganaCurrentItem,
    lessonZeroHiraganaSessionSnapshotShapeIsValid,
    startLessonZeroHiraganaSession,
    transitionLessonZeroHiraganaSession,
    type LessonZeroHiraganaSessionState,
} from '../../src/academy/domain/lesson-zero-hiragana-session';

describe('Lesson Zero full hiragana route', () => {
    it('covers the 46 modern basic hiragana once and changes order for final recall', () => {
        const definition = createLessonZeroHiraganaDefinition();

        expect(LESSON_ZERO_BASIC_HIRAGANA_COUNT).toBe(46);
        expect(definition.rows).toHaveLength(10);
        expect(definition.rows.flatMap(row => row.itemIds)).toHaveLength(46);
        expect(new Set(definition.items.map(item => item.kana))).toHaveLength(46);
        expect(new Set(definition.masteryOrder)).toHaveLength(46);
        expect(definition.masteryOrder).not.toEqual(definition.items.map(item => item.id));
        expect(definition.items.find(item => item.kana === 'し')?.acceptedRomaji).toEqual(['shi', 'si']);
        expect(definition.items.find(item => item.kana === 'を')?.acceptedRomaji).toEqual(['o', 'wo']);
    });

    it('drills every row, requeues lapses, and schedules all 46 only after cumulative recall', () => {
        const definition = createLessonZeroHiraganaDefinition();
        let state = startLessonZeroHiraganaSession(definition);
        state = step(definition, state, { kind: 'start-guided' });
        state = step(definition, state, { kind: 'begin-row' });

        const first = lessonZeroHiraganaCurrentItem(definition, state)!;
        const lapse = transitionLessonZeroHiraganaSession(
            definition,
            state,
            { kind: 'answer', response: 'wrong' },
            4,
        );
        expect(lapse.evaluation?.result.outcome).toBe('lapse');
        expect(lapse.state.queue.at(-1)).toBe(first.id);
        expect(lapse.state.repairedItemIds).toContain(first.id);
        state = lapse.state;

        while (state.stage !== 'mastery-ready') {
            if (state.stage === 'row-preview') state = step(definition, state, { kind: 'begin-row' });
            else if (state.stage === 'row-drill') {
                const item = lessonZeroHiraganaCurrentItem(definition, state)!;
                state = step(definition, state, { kind: 'answer', response: item.romaji });
            } else if (state.stage === 'row-result') state = step(definition, state, { kind: 'next-row' });
            else throw new Error(`Unexpected stage: ${state.stage}`);
        }
        expect(state.guidedPassedItemIds).toHaveLength(46);

        state = step(definition, state, { kind: 'begin-mastery' });
        let completion;
        while (state.stage === 'mastery') {
            const item = lessonZeroHiraganaCurrentItem(definition, state)!;
            const transition = transitionLessonZeroHiraganaSession(
                definition,
                state,
                { kind: 'answer', response: item.romaji },
                10_000 + state.attempts.length,
            );
            state = transition.state;
            completion = transition.completionEvaluation ?? completion;
        }

        expect(state.status).toBe('complete');
        expect(state.masteryPassedItemIds).toHaveLength(46);
        expect(completion?.reviewSeeds).toHaveLength(46);
        expect(completion?.reviewSeeds.find(seed => seed.id.endsWith(first.id))?.reason).toBe('repair');
        expect(completion?.reviewSeeds.every(seed => seed.schedule?.dueAfterMs === 86_400_000)).toBe(true);
        expect(lessonZeroHiraganaSessionSnapshotShapeIsValid(state)).toBe(true);
    });

    it('lets an experienced learner take the full placement check without repeating guided rows', () => {
        const definition = createLessonZeroHiraganaDefinition();
        let state = startLessonZeroHiraganaSession(definition);
        state = step(definition, state, { kind: 'start-placement' });
        expect(state.stage).toBe('mastery-ready');
        expect(state.guidedPassedItemIds).toEqual([]);

        state = step(definition, state, { kind: 'begin-mastery' });
        while (state.stage === 'mastery') {
            const item = lessonZeroHiraganaCurrentItem(definition, state)!;
            state = step(definition, state, { kind: 'answer', response: item.romaji });
        }

        expect(state).toMatchObject({
            route: 'placement',
            status: 'complete',
            stage: 'complete',
        });
        expect(state.masteryPassedItemIds).toHaveLength(46);
    });

    it('keeps deterministic, compact row choices and survives pause/resume', () => {
        const definition = createLessonZeroHiraganaDefinition();
        let state = startLessonZeroHiraganaSession(definition);
        state = step(definition, state, { kind: 'start-guided' });
        state = step(definition, state, { kind: 'begin-row' });
        const current = lessonZeroHiraganaCurrentItem(definition, state)!;

        expect(lessonZeroHiraganaChoices(definition, current.id)).toHaveLength(4);
        expect(lessonZeroHiraganaChoices(definition, current.id)).toContain(current.romaji);
        expect(lessonZeroHiraganaChoices(definition, current.id))
            .toEqual(lessonZeroHiraganaChoices(definition, current.id));

        state = step(definition, state, { kind: 'pause' });
        expect(state.status).toBe('paused');
        const resumed = startLessonZeroHiraganaSession(definition, state);
        expect(resumed.queue).toEqual(state.queue);
        expect(step(definition, resumed, { kind: 'resume' }).status).toBe('active');
    });
});

function step(
    definition: ReturnType<typeof createLessonZeroHiraganaDefinition>,
    state: LessonZeroHiraganaSessionState,
    action: Parameters<typeof transitionLessonZeroHiraganaSession>[2],
): LessonZeroHiraganaSessionState {
    return transitionLessonZeroHiraganaSession(
        definition,
        state,
        action,
        1_000 + state.attempts.length,
    ).state;
}

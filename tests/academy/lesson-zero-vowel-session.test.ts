import {
    createLessonZeroVowelBingo,
    createLessonZeroVowelSoundMap,
} from '../../src/academy/content/lesson-zero-vowel-sound-map';
import {
    lessonZeroVowelResponse,
    lessonZeroVowelSessionSnapshotShapeIsValid,
    startLessonZeroVowelSession,
    transitionLessonZeroVowelSession,
} from '../../src/academy/domain/lesson-zero-vowel-session';
import { createAcademyActivityRuntime } from '../../src/academy/minigames';

function taughtState() {
    const model = createLessonZeroVowelSoundMap();
    let state = transitionLessonZeroVowelSession(
        model,
        startLessonZeroVowelSession(model),
        { kind: 'start' },
        1,
    ).state;
    for (const item of model.payload.items) {
        state = transitionLessonZeroVowelSession(model, state, { kind: 'learn-item', itemId: item.id }, 2).state;
    }
    return { model, state };
}

function completeRound(
    model: ReturnType<typeof createLessonZeroVowelSoundMap>,
    input: ReturnType<typeof startLessonZeroVowelSession>,
    wrongFirst = false,
) {
    let state = input;
    for (let index = 0; index < state.roundOrder.length; index += 1) {
        const roundId = state.roundOrder[index];
        state = transitionLessonZeroVowelSession(model, state, { kind: 'mark-heard', roundId }, 10 + index).state;
        const target = wrongFirst && index === 0
            ? model.payload.items.find(item => item.id !== roundId)!.id
            : roundId;
        state = transitionLessonZeroVowelSession(model, state, { kind: 'select', kanaId: target }, 10 + index).state;
    }
    return state;
}

describe('Lesson Zero five-vowel session', () => {
    it('teaches all five anchors before a shuffled independent listening round', () => {
        const { model, state: taught } = taughtState();
        let state = transitionLessonZeroVowelSession(model, taught, { kind: 'begin-attempt' }, 3).state;
        expect(state.roundOrder).toHaveLength(5);
        expect(state.roundOrder).not.toEqual(model.payload.items.map(item => item.id));
        expect(() => transitionLessonZeroVowelSession(
            model,
            state,
            { kind: 'select', kanaId: state.roundOrder[0] },
            4,
        )).toThrow('Listen to the current sound');

        state = completeRound(model, state);
        const response = lessonZeroVowelResponse(model, state);
        const evaluation = createAcademyActivityRuntime().evaluate(model, response);
        const complete = transitionLessonZeroVowelSession(model, state, { kind: 'record-result', evaluation }, 20);
        expect(complete.state).toMatchObject({ status: 'complete', stage: 'complete', baseCompleted: true });
        expect(complete.evaluation?.reviewSeeds).toHaveLength(5);
        expect(complete.adaptive).toMatchObject({ skill: 'listening', action: 'listen', independent: true });
    });

    it('repairs only missed sounds and then requires the complete five-sound route again', () => {
        const { model, state: taught } = taughtState();
        let state = transitionLessonZeroVowelSession(model, taught, { kind: 'begin-attempt' }, 3).state;
        state = completeRound(model, state, true);
        const lapse = createAcademyActivityRuntime().evaluate(model, lessonZeroVowelResponse(model, state));
        const repair = transitionLessonZeroVowelSession(model, state, { kind: 'record-result', evaluation: lapse }, 20);
        expect(repair.state.stage).toBe('repair');
        expect(repair.state.repairItemIds).toHaveLength(1);

        state = transitionLessonZeroVowelSession(model, repair.state, { kind: 'choose-mode', mode: 'visual' }, 21).state;
        state = transitionLessonZeroVowelSession(
            model,
            state,
            { kind: 'complete-repair-item', itemId: state.repairItemIds[0] },
            22,
        ).state;
        state = transitionLessonZeroVowelSession(model, state, { kind: 'begin-retry' }, 23).state;
        expect(state).toMatchObject({ stage: 'attempt', mode: 'visual', selections: [] });
        expect(state.roundOrder).toHaveLength(5);
    });

    it('keeps bingo optional, repeatable and durable after the base lesson passes', () => {
        const { model, state: taught } = taughtState();
        let state = transitionLessonZeroVowelSession(model, taught, { kind: 'begin-attempt' }, 3).state;
        state = completeRound(model, state);
        const runtime = createAcademyActivityRuntime();
        state = transitionLessonZeroVowelSession(
            model,
            state,
            { kind: 'record-result', evaluation: runtime.evaluate(model, lessonZeroVowelResponse(model, state)) },
            20,
        ).state;
        state = transitionLessonZeroVowelSession(model, state, { kind: 'start-bingo' }, 21).state;
        state = completeRound(model, state);
        const bingo = createLessonZeroVowelBingo();
        state = transitionLessonZeroVowelSession(
            model,
            state,
            { kind: 'record-result', evaluation: runtime.evaluate(bingo, lessonZeroVowelResponse(model, state)) },
            30,
        ).state;
        expect(state).toMatchObject({ status: 'complete', variant: 'bingo', bingoWins: 1 });
        expect(startLessonZeroVowelSession(model, state)).toEqual(state);
        expect(lessonZeroVowelSessionSnapshotShapeIsValid(state)).toBe(true);
    });
});

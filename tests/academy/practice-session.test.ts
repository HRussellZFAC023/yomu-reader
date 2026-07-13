import {
    advancePracticeTime,
    answerPracticeItem,
    buildPracticeReport,
    disablePracticeTimePressure,
    pausePracticeSession,
    resumePracticeSession,
    savePracticeSession,
    startPracticeSession,
    currentPracticePrompt,
    type PracticePlan,
} from '../../src/academy/domain/practice-session';
import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../../src/academy/domain/activity-runtime';

function plan(modeId: PracticePlan['modeId'] = 'normal-challenge'): PracticePlan {
    return {
        sessionId: `session:${modeId}`,
        modeId,
        answerTimeMs: modeId === 'inferno-pressure' ? 5_000 : undefined,
        decks: [
            { deckId: 'a', weight: 2, range: { start: 2, end: 3 } },
            { deckId: 'b', weight: 1 },
        ],
        items: [
            item('a1', 'a', 1, 'いち'), item('a2', 'a', 2, 'に'), item('a3', 'a', 3, 'さん'), item('b1', 'b', 1, 'よん'),
        ],
    };
}

describe('practice session deep Module', () => {
    it('mixes weighted deck ranges with injected randomness and emits immutable learning evidence', () => {
        const session = startPracticeSession(plan(), () => 0);
        expect(session.queue).toEqual(['a2', 'a3', 'b1']);
        const prompt = currentPracticePrompt(plan(), session);
        expect(prompt).toMatchObject({ preCommitChoiceStyle: 'neutral', answerBearingSupport: 'hidden', earnedHintAvailable: false });
        expect(JSON.stringify(prompt)).not.toContain('に');
        expect(() => answerPracticeItem(plan(), session, { kind: 'preselected', response: 'に' } as never, 99)).toThrow('learner commitment');
        const transition = answerPracticeItem(plan(), session, { kind: 'learner-commitment', response: 'に' }, 100);
        expect(transition.evidence).toMatchObject({
            kind: 'learning-evidence-recorded',
            modeId: 'normal-challenge',
            outcome: 'pass',
            independent: true,
        });
        expect(transition.state.queue).toEqual(['a3', 'b1']);
    });

    it('revisits a conquest lapse until two later successful retrievals, then reports repair', () => {
        const masteryPlan = { ...plan('mastery-conquest'), decks: [{ deckId: 'b', weight: 1 }], items: [item('b1', 'b', 1, 'よん')] };
        let state = startPracticeSession(masteryPlan, () => 0);
        state = answerPracticeItem(masteryPlan, state, { kind: 'learner-commitment', response: 'wrong' }, 1).state;
        expect(state.queue).toEqual(['b1']);
        expect(currentPracticePrompt(masteryPlan, state).earnedHintAvailable).toBe(true);
        state = answerPracticeItem(masteryPlan, state, { kind: 'learner-commitment', response: 'よん' }, 2).state;
        expect(state.queue).toEqual(['b1']);
        state = answerPracticeItem(masteryPlan, state, { kind: 'learner-commitment', response: 'よん' }, 3).state;
        expect(state.status).toBe('complete');
        expect(buildPracticeReport(state)).toMatchObject({ repairedItemIds: ['b1'], unresolvedItemIds: [] });
    });

    it('saves/resumes all state and treats inferno timeout as repairable evidence', () => {
        const inferno = { ...plan('inferno-pressure'), decks: [{ deckId: 'b', weight: 1 }], items: [item('b1', 'b', 1, 'よん')] };
        const started = startPracticeSession(inferno, () => 0);
        const paused = pausePracticeSession(started);
        const resumed = resumePracticeSession(savePracticeSession(paused), inferno);
        expect(resumed.itemRemainingMs).toBe(5_000);
        const timedOut = advancePracticeTime(inferno, resumed, 5_000, 10);
        expect(timedOut.evidence).toMatchObject({ outcome: 'lapse' });
        expect(timedOut.state.status).toBe('complete');
        const untimed = disablePracticeTimePressure(startPracticeSession(inferno, () => 0));
        expect(advancePracticeTime(inferno, untimed, 50_000, 11)).toEqual({ state: untimed, evidence: null });
    });
});

function item(id: string, deckId: string, ordinal: number, answer: string) {
    return {
        id,
        deckId,
        ordinal,
        prompt: id,
        acceptedAnswers: [answer],
        conceptIds: [`concept:${id}`],
        skill: 'vocabulary' as const,
        action: 'recall' as const,
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
    };
}

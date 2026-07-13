import { buildLearnerDeckPracticePlan, validateLearnerDeck, type LearnerDeck } from '../../src/academy/domain/learner-deck';
import { currentPracticePrompt, startPracticeSession } from '../../src/academy/domain/practice-session';

describe('learner-built deck flow', () => {
    it('builds a bounded practice plan without exposing answers through the pre-commit prompt', () => {
        const plan = buildLearnerDeckPracticePlan(deck(), 'session:personal');
        const state = startPracticeSession(plan, () => 0);
        expect(plan.modeId).toBe('learner-deck');
        expect(currentPracticePrompt(plan, state)).toEqual({
            id: 'card:eki',
            prompt: 'Write the station word.',
            skill: 'vocabulary',
            action: 'produce',
            preCommitChoiceStyle: 'neutral',
            answerBearingSupport: 'hidden',
            earnedHintAvailable: false,
        });
    });

    it('rejects duplicate prompts and secure assessment content', () => {
        const unsafe = deck();
        unsafe.cards = [
            ...unsafe.cards,
            { ...unsafe.cards[0]!, id: 'card:secure', source: { id: 'mock:n1:secure', exposure: 'secure-assessment' } },
        ];
        const issues = validateLearnerDeck(unsafe);
        expect(issues).toContainEqual(expect.objectContaining({ path: 'cards[1].prompt' }));
        expect(issues).toContainEqual(expect.objectContaining({ path: 'cards[1].source.exposure' }));
    });
});

function deck(): LearnerDeck & { cards: LearnerDeck['cards'] extends readonly (infer Card)[] ? Card[] : never } {
    return {
        schemaVersion: 1,
        id: 'deck:personal',
        title: 'Station words',
        description: 'Words I met in Academy.',
        cards: [{
            id: 'card:eki',
            prompt: 'Write the station word.',
            acceptedAnswers: ['駅'],
            conceptIds: ['concept:vocabulary:station'],
            skill: 'vocabulary',
            action: 'produce',
            source: { id: 'source:week-1', exposure: 'practice-cleared' },
        }],
    };
}

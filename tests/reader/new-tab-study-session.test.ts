import { describe, expect, it } from 'vitest';

import type { JPDBCard } from '../../src/reader/app/types';
import { createNewTabStudySession } from '../../src/reader/newtab/study-session';

function sessionCard(overrides: Partial<JPDBCard> = {}): JPDBCard {
    return {
        vid: 10,
        sid: 20,
        rid: 0,
        spelling: '読む',
        reading: 'よむ',
        frequencyRank: 1200,
        partOfSpeech: ['v'],
        meanings: [{ glosses: ['to read'], partOfSpeech: ['v'] }],
        cardState: ['due'],
        pitchAccent: ['LH'],
        wordWithReading: null,
        source: 'jpdb',
        reviewSource: 'jpdb-api',
        sentence: '本を読む。',
        ...overrides,
    };
}

describe('new-tab review and practice model', () => {
    const options = { revealAnswer: false, renderAsKanji: false, hasRecallCloze: true, pitchAvailable: true };

    it('keeps the normal review to its prompt and answer', () => {
        const session = createNewTabStudySession(sessionCard(), options);
        expect(session.steps.map(step => step.kind)).toEqual(['word', 'final-reveal']);
        expect(session.activeStep.kind).toBe('word');
        expect(session.activity).toBe('review');
        expect(session.steps.filter(step => step.gradeable)).toEqual([session.gradeStep]);
    });

    it('shows the gradeable answer after reveal', () => {
        const session = createNewTabStudySession(sessionCard(), { ...options, revealAnswer: true });
        expect(session.activeStep).toBe(session.gradeStep);
        expect(session.activity).toBe('review');
    });

    it.each([false, true])('keeps selected practice separate when revealed=%s', revealAnswer => {
        const session = createNewTabStudySession(sessionCard(), { ...options, revealAnswer, activeStepId: 'type-word' });
        expect(session.activity).toBe('practice');
        expect(session.activeStep).toMatchObject({ kind: 'type-word', gradeable: false });
        expect(session.practiceSteps.every(step => !step.gradeable)).toBe(true);
    });

    it('preserves a native kanji question without adding word exercises to its review', () => {
        const session = createNewTabStudySession(sessionCard({ spelling: '読' }), { ...options, renderAsKanji: true });
        expect(session.activity).toBe('review');
        expect(session.steps.map(step => step.kind)).toEqual(['kanji-doodle', 'final-reveal']);
        expect(session.activeStep.kanji).toBe('読');
    });

    it('offers each distinct Japanese character as practice without revealing it in the identifier', () => {
        const session = createNewTabStudySession(sessionCard({ spelling: '𠮟る𩸽𠮟' }), options);
        expect(session.practiceSteps.filter(step => step.kind === 'kanji-doodle')).toEqual([
            { id: 'kanji-doodle:0', kind: 'kanji-doodle', kanji: '𠮟', gradeable: false },
            { id: 'kanji-doodle:1', kind: 'kanji-doodle', kanji: '𩸽', gradeable: false },
        ]);
        expect(session.activeStep.kind).toBe('word');
    });

    it('requires actual pitch and cloze content before offering those exercises', () => {
        const session = createNewTabStudySession(sessionCard({ spelling: 'よむ', pitchAccent: [] }), {
            ...options, pitchAvailable: false, hasRecallCloze: false,
        });
        expect(session.practiceSteps.map(step => step.kind)).toEqual(['type-word']);
    });

    it('offers available exercises without adding them to the review path', () => {
        const session = createNewTabStudySession(sessionCard(), options);
        expect(session.practiceSteps.map(step => step.kind)).toEqual([
            'kanji-doodle', 'type-word', 'recall-cloze', 'listen-pitch', 'speaking',
        ]);
        expect(session.steps.map(step => step.kind)).toEqual(['word', 'final-reveal']);
    });

    it('does not activate an unavailable exercise from a stale selection', () => {
        const session = createNewTabStudySession(sessionCard(), {
            ...options, pitchAvailable: false, activeStepId: 'speaking',
        });
        expect(session.activity).toBe('review');
        expect(session.activeStep.kind).toBe('word');
    });
});

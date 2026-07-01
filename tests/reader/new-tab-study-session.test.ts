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

describe('new-tab study session model', () => {
    it('expresses the merged learning pipeline with one final grade step', () => {
        const session = createNewTabStudySession(sessionCard(), {
            mode: 'word',
            listenSubMode: 'perceive',
            revealAnswer: false,
            renderAsKanji: false,
            hasPitchStep: true,
            hasRecallCloze: true,
        });

        expect(session.steps.map(step => step.kind)).toEqual([
            'kanji-doodle',
            'word',
            'recall-cloze',
            'listen-pitch',
            'speaking',
            'final-reveal',
        ]);
        expect(session.steps.filter(step => step.gradeable).map(step => step.kind)).toEqual(['final-reveal']);
        expect(session.activeStep.kind).toBe('kanji-doodle');
        expect(session.activeStep.kanji).toBe('読');
    });

    it('collapses gracefully for kana-only cards without pitch or sentence cloze', () => {
        const session = createNewTabStudySession(sessionCard({ spelling: 'よむ', pitchAccent: [] }), {
            mode: 'word',
            revealAnswer: true,
            renderAsKanji: false,
            hasPitchStep: false,
            hasRecallCloze: false,
        });

        expect(session.steps.map(step => step.kind)).toEqual(['word', 'final-reveal']);
        expect(session.activeStep.kind).toBe('final-reveal');
        expect(session.gradeStep.kind).toBe('final-reveal');
    });

    it('does not force live kanji cards back to the kanji step after the learner selects word', () => {
        const session = createNewTabStudySession(sessionCard(), {
            mode: 'word',
            listenSubMode: 'perceive',
            revealAnswer: false,
            renderAsKanji: true,
            hasPitchStep: true,
            hasRecallCloze: true,
            activeStepId: 'word',
        });

        expect(session.steps.map(step => step.kind)).toContain('kanji-doodle');
        expect(session.activeStep.kind).toBe('word');
    });

    it('uses the kanji step when a live kanji card is actually in kanji mode', () => {
        const session = createNewTabStudySession(sessionCard(), {
            mode: 'kanji',
            revealAnswer: false,
            renderAsKanji: true,
            hasPitchStep: true,
            hasRecallCloze: true,
        });

        expect(session.activeStep.kind).toBe('kanji-doodle');
    });

    it('creates one kanji drawing step for each kanji in a word', () => {
        const session = createNewTabStudySession(sessionCard({ spelling: '図鑑', reading: 'ずかん', sentence: '図鑑を見る。' }), {
            mode: 'word',
            revealAnswer: false,
            renderAsKanji: false,
            hasPitchStep: false,
            hasRecallCloze: true,
        });

        const kanjiSteps = session.steps.filter(step => step.kind === 'kanji-doodle');
        expect(kanjiSteps.map(step => step.kanji)).toEqual(['図', '鑑']);
        expect(kanjiSteps.map(step => step.id)).toEqual(['kanji-doodle:0:図', 'kanji-doodle:1:鑑']);
        expect(session.activeStep).toMatchObject({ kind: 'kanji-doodle', kanji: '図' });
    });

    it('uses configured order and disabled steps while keeping reveal last', () => {
        const session = createNewTabStudySession(sessionCard(), {
            mode: 'word',
            revealAnswer: false,
            renderAsKanji: false,
            hasPitchStep: true,
            hasRecallCloze: true,
            stepOrder: ['word', 'listen-pitch', 'recall-cloze', 'kanji-doodle', 'speaking'],
            disabledSteps: ['speaking'],
        });

        expect(session.steps.map(step => step.kind)).toEqual([
            'word',
            'listen-pitch',
            'recall-cloze',
            'kanji-doodle',
            'final-reveal',
        ]);
        expect(session.gradeStep.kind).toBe('final-reveal');
    });

    it('honors a disabled word step instead of forcing it back into the flow', () => {
        const session = createNewTabStudySession(sessionCard({ spelling: 'よむ', pitchAccent: [] }), {
            mode: 'word',
            revealAnswer: false,
            renderAsKanji: false,
            hasPitchStep: false,
            hasRecallCloze: false,
            disabledSteps: ['word'],
        });

        expect(session.steps.map(step => step.kind)).toEqual(['final-reveal']);
        expect(session.activeStep.kind).toBe('final-reveal');
        expect(session.gradeStep.kind).toBe('final-reveal');
    });
});

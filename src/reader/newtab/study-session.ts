import type { JPDBCard, NewTabStudyChallengeStep } from '../app/types';
import { usesJapaneseCharacterStudy } from '../languages/character-lookup';
import { isJapaneseKanjiCharacter } from '../lookup/japanese-script';

export type NewTabStudyStepKind = NewTabStudyChallengeStep | 'final-reveal';
export type NewTabStudyStepId = string;

export interface NewTabStudyStep {
    id: NewTabStudyStepId;
    kind: NewTabStudyStepKind;
    gradeable: boolean;
    kanji?: string;
}

export interface NewTabStudySession {
    activity: 'review' | 'practice';
    steps: NewTabStudyStep[];
    practiceSteps: NewTabStudyStep[];
    activeStep: NewTabStudyStep;
    gradeStep: NewTabStudyStep;
}

export interface NewTabStudySessionOptions {
    revealAnswer: boolean;
    renderAsKanji: boolean;
    hasRecallCloze: boolean;
    pitchAvailable?: boolean;
    activeStepId?: NewTabStudyStepId | null;
}

export function createNewTabStudySession(card: JPDBCard, options: NewTabStudySessionOptions): NewTabStudySession {
    const kanji = usesJapaneseCharacterStudy()
        ? [...new Set(Array.from(card.spelling).filter(isJapaneseKanjiCharacter))] : [];
    const prompt: NewTabStudyStep = options.renderAsKanji && kanji.length
        ? { id: 'review-prompt', kind: 'kanji-doodle', kanji: kanji[0], gradeable: false }
        : { id: 'review-prompt', kind: 'word', gradeable: false };
    const gradeStep: NewTabStudyStep = { id: 'final-reveal', kind: 'final-reveal', gradeable: true };
    const practiceSteps = availablePractice(kanji, options);
    const practice = practiceSteps.find(step => step.id === options.activeStepId);
    return {
        activity: practice ? 'practice' : 'review',
        steps: [prompt, gradeStep],
        practiceSteps,
        activeStep: practice ?? (options.revealAnswer ? gradeStep : prompt),
        gradeStep,
    };
}

function availablePractice(kanji: string[], options: NewTabStudySessionOptions): NewTabStudyStep[] {
    const steps: NewTabStudyStep[] = kanji.map((character, index) => ({
        // The prompt's answer must not appear in DOM identifiers.
        id: `kanji-doodle:${index}`, kind: 'kanji-doodle', kanji: character, gradeable: false,
    }));
    steps.push(practiceStep('type-word'));
    if (options.hasRecallCloze) steps.push(practiceStep('recall-cloze'));
    if (options.pitchAvailable) steps.push(practiceStep('listen-pitch'), practiceStep('speaking'));
    return steps;
}

function practiceStep(kind: NewTabStudyChallengeStep): NewTabStudyStep {
    return { id: kind, kind, gradeable: false };
}

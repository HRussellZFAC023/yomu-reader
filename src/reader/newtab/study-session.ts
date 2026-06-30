import type { JPDBCard } from '../app/types';
import type { NewTabStudyChallengeStep } from '../app/types';
import type { NewTabListenSubMode, NewTabMode } from './state';

export type NewTabStudyStepKind =
    | NewTabStudyChallengeStep
    | 'final-reveal';

export interface NewTabStudyStep {
    kind: NewTabStudyStepKind;
    mode: NewTabMode;
    label: string;
    gradeable: boolean;
}

export interface NewTabStudySession {
    steps: NewTabStudyStep[];
    activeStep: NewTabStudyStep;
    gradeStep: NewTabStudyStep;
}

export interface NewTabStudySessionOptions {
    mode: NewTabMode;
    listenSubMode?: NewTabListenSubMode;
    revealAnswer: boolean;
    renderAsKanji: boolean;
    hasPitchStep: boolean;
    hasRecallCloze: boolean;
    stepOrder?: NewTabStudyChallengeStep[];
    disabledSteps?: NewTabStudyChallengeStep[];
    activeStepKind?: NewTabStudyStepKind | null;
}

const KANJI_RE = /[\u3400-\u9fff々〆]/u;

const STUDY_STEP_LABELS: Record<NewTabStudyStepKind, string> = {
    'kanji-doodle': 'Kanji',
    word: 'Word',
    'recall-cloze': 'Recall',
    'listen-pitch': 'Listen',
    speaking: 'Speak',
    'final-reveal': 'Reveal',
};

export function createNewTabStudySession(card: JPDBCard, options: NewTabStudySessionOptions): NewTabStudySession {
    const steps = mergedStudyStepsForCard(card, options);
    const activeKind = activeStudyStepKind(options);
    const activeStep = steps.find(step => step.kind === activeKind) ?? steps[0] ?? studyStep('word', 'word');
    const gradeStep = steps.find(step => step.kind === 'final-reveal') ?? activeStep;
    return { steps, activeStep, gradeStep };
}

function mergedStudyStepsForCard(card: JPDBCard, options: NewTabStudySessionOptions): NewTabStudyStep[] {
    const available = new Set<NewTabStudyChallengeStep>();
    if (options.renderAsKanji || containsKanji(card.spelling)) available.add('kanji-doodle');
    available.add('word');
    if (options.hasRecallCloze) available.add('recall-cloze');
    if (options.hasPitchStep) {
        available.add('listen-pitch');
        available.add('speaking');
    }
    const disabled = new Set(options.disabledSteps ?? []);
    const ordered = normalizedChallengeStepOrder(options.stepOrder);
    const steps = ordered
        .filter(kind => available.has(kind) && !disabled.has(kind))
        .map(kind => studyStep(kind, studyModeForStep(kind)));
    steps.push(studyStep('final-reveal', options.renderAsKanji ? 'kanji' : 'word', true));
    return dedupeStudySteps(steps);
}

function activeStudyStepKind(options: NewTabStudySessionOptions): NewTabStudyStepKind {
    if (options.revealAnswer && options.mode !== 'listen') return 'final-reveal';
    if (options.activeStepKind) return options.activeStepKind;
    if (options.renderAsKanji) return 'kanji-doodle';
    if (options.mode === 'recall') return 'recall-cloze';
    if (options.mode === 'listen') return options.listenSubMode === 'shadow' ? 'speaking' : 'listen-pitch';
    return 'word';
}

function studyStep(kind: NewTabStudyStepKind, mode: NewTabMode, gradeable = false): NewTabStudyStep {
    return { kind, mode, gradeable, label: STUDY_STEP_LABELS[kind] };
}

function normalizedChallengeStepOrder(order: NewTabStudySessionOptions['stepOrder']): NewTabStudyChallengeStep[] {
    const configured = Array.isArray(order) ? order : [];
    return dedupeChallengeSteps([
        ...configured,
        'kanji-doodle',
        'word',
        'recall-cloze',
        'listen-pitch',
        'speaking',
    ]);
}

function dedupeChallengeSteps(steps: NewTabStudyChallengeStep[]): NewTabStudyChallengeStep[] {
    const seen = new Set<NewTabStudyChallengeStep>();
    return steps.filter(step => {
        if (seen.has(step)) return false;
        seen.add(step);
        return true;
    });
}

function studyModeForStep(kind: NewTabStudyChallengeStep): NewTabMode {
    if (kind === 'kanji-doodle') return 'kanji';
    if (kind === 'recall-cloze') return 'recall';
    if (kind === 'listen-pitch' || kind === 'speaking') return 'listen';
    return 'word';
}

function dedupeStudySteps(steps: NewTabStudyStep[]): NewTabStudyStep[] {
    const seen = new Set<NewTabStudyStepKind>();
    return steps.filter(step => {
        if (seen.has(step.kind)) return false;
        seen.add(step.kind);
        return true;
    });
}

function containsKanji(value: string): boolean {
    return Array.from(value).some(character => KANJI_RE.test(character));
}

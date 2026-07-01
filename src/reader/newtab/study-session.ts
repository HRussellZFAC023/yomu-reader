import type { JPDBCard } from '../app/types';
import type { NewTabStudyChallengeStep } from '../app/types';
import type { NewTabListenSubMode, NewTabMode } from './state';

export type NewTabStudyStepKind =
    | NewTabStudyChallengeStep
    | 'final-reveal';

export type NewTabStudyStepId = string;

export interface NewTabStudyStep {
    id: NewTabStudyStepId;
    kind: NewTabStudyStepKind;
    mode: NewTabMode;
    label: string;
    gradeable: boolean;
    kanji?: string;
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
    activeStepId?: NewTabStudyStepId | null;
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
    const activeStep = activeStudyStep(steps, options) ?? steps[0] ?? studyStep('word', 'word');
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
    const kanji = kanjiCharacters(card.spelling);
    const steps = ordered.flatMap(kind => {
        if (!available.has(kind) || disabled.has(kind)) return [];
        if (kind === 'kanji-doodle') {
            const characters = kanji.length ? kanji : [card.spelling[0] ?? '字'];
            return characters.map((character, index) => studyStep(kind, studyModeForStep(kind), false, character, index));
        }
        return [studyStep(kind, studyModeForStep(kind))];
    });
    steps.push(studyStep('final-reveal', options.renderAsKanji ? 'kanji' : 'word', true));
    return dedupeStudySteps(steps);
}

function activeStudyStep(steps: NewTabStudyStep[], options: NewTabStudySessionOptions): NewTabStudyStep | null {
    if (options.revealAnswer && options.mode !== 'listen') return steps.find(step => step.kind === 'final-reveal') ?? null;
    if (options.activeStepId) {
        const active = steps.find(step => step.id === options.activeStepId || step.kind === options.activeStepId);
        if (active) return active;
    }
    const modeStep = activeStudyStepForMode(steps, options);
    if (modeStep) return modeStep;
    return null;
}

function activeStudyStepForMode(steps: NewTabStudyStep[], options: NewTabStudySessionOptions): NewTabStudyStep | null {
    if (options.renderAsKanji) return steps.find(step => step.kind === 'kanji-doodle') ?? null;
    if (options.mode === 'kanji') return steps.find(step => step.kind === 'kanji-doodle') ?? null;
    if (options.mode === 'recall') return steps.find(step => step.kind === 'recall-cloze') ?? null;
    if (options.mode === 'listen') {
        const kind: NewTabStudyStepKind = options.listenSubMode === 'shadow' ? 'speaking' : 'listen-pitch';
        return steps.find(step => step.kind === kind) ?? null;
    }
    return null;
}

function studyStep(kind: NewTabStudyStepKind, mode: NewTabMode, gradeable = false, kanji?: string, index = 0): NewTabStudyStep {
    const id = kanji ? `${kind}:${index}:${kanji}` : kind;
    return { id, kind, mode, gradeable, kanji, label: STUDY_STEP_LABELS[kind] };
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
    const seen = new Set<NewTabStudyStepId>();
    return steps.filter(step => {
        if (seen.has(step.id)) return false;
        seen.add(step.id);
        return true;
    });
}

function containsKanji(value: string): boolean {
    return Array.from(value).some(character => KANJI_RE.test(character));
}

function kanjiCharacters(value: string): string[] {
    return [...new Set(Array.from(value).filter(character => KANJI_RE.test(character)))];
}

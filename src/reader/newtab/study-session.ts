import type { JPDBCard } from '../app/types';
import type { NewTabStudyChallengeStep } from '../app/types';
import { targetSupportsCharacterLookup } from '../languages/character-lookup';
import { isJapaneseKanjiCharacter } from '../lookup/japanese-script';

export type NewTabStudyStepKind =
    | NewTabStudyChallengeStep
    | 'final-reveal';

export type NewTabStudyStepId = string;

export interface NewTabStudyStep {
    id: NewTabStudyStepId;
    kind: NewTabStudyStepKind;
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
    /** Ignored source-compatibility input; queue selection no longer affects the step plan. */
    mode?: string;
    revealAnswer: boolean;
    renderAsKanji: boolean;
    hasRecallCloze: boolean;
    /** Exact, classifiable pitch is available for Listen/Speak. Omitted means unavailable. */
    pitchAvailable?: boolean;
    stepOrder?: NewTabStudyChallengeStep[];
    disabledSteps?: NewTabStudyChallengeStep[];
    activeStepId?: NewTabStudyStepId | null;
}

const STUDY_STEP_LABELS: Record<NewTabStudyStepKind, string> = {
    'kanji-doodle': 'Kanji',
    word: 'Word',
    'recall-cloze': 'Recall',
    'listen-pitch': 'Listen',
    speaking: 'Speak',
    'type-word': 'Type',
    'final-reveal': 'Reveal',
};

export function createNewTabStudySession(card: JPDBCard, options: NewTabStudySessionOptions): NewTabStudySession {
    const steps = mergedStudyStepsForCard(card, options);
    const activeStep = activeStudyStep(steps, options) ?? steps[0] ?? studyStep('word');
    const gradeStep = steps.find(step => step.kind === 'final-reveal') ?? activeStep;
    return { steps, activeStep, gradeStep };
}

function mergedStudyStepsForCard(card: JPDBCard, options: NewTabStudySessionOptions): NewTabStudyStep[] {
    const available = new Set<NewTabStudyChallengeStep>();
    const disabled = new Set(options.disabledSteps ?? []);
    const characterStudyEnabled = targetSupportsCharacterLookup();
    if (characterStudyEnabled && (options.renderAsKanji || containsKanji(card.spelling))) available.add('kanji-doodle');
    available.add('word');
    if (options.hasRecallCloze) available.add('recall-cloze');
    // Listen/Speak drill pitch accent, so they only make sense once pitch has
    // actually resolved for this card. Pitch may still enrich lazily after this
    // plan is pinned; the controller owns the monotonic upgrade.
    if (options.pitchAvailable) {
        available.add('listen-pitch');
        available.add('speaking');
    }
    // Type is part of the stable Word flow even while a sourced N+1 sentence
    // is still loading. The prompt upgrades to that cloze when it arrives;
    // without one, the learner can still reproduce the word itself.
    if (!disabled.has('word')) available.add('type-word');
    const ordered = normalizedChallengeStepOrder(options.stepOrder);
    const kanji = characterStudyEnabled ? kanjiCharacters(card.spelling) : [];
    const steps = ordered.flatMap(kind => {
        if (!available.has(kind) || disabled.has(kind)) return [];
        if (kind === 'kanji-doodle') {
            const characters = kanji.length ? kanji : [card.spelling[0] ?? '字'];
            return characters.map((character, index) => studyStep(kind, false, character, index));
        }
        return [studyStep(kind)];
    });
    steps.push(studyStep('final-reveal', true));
    return dedupeStudySteps(steps);
}

function activeStudyStep(steps: NewTabStudyStep[], options: NewTabStudySessionOptions): NewTabStudyStep | null {
    // A revealed kanji step is the composed-of drilldown from the word back —
    // it must survive the reveal shortcut below, which otherwise collapses
    // every revealed state onto the final-reveal step.
    if (options.revealAnswer && options.activeStepId) {
        const active = steps.find(step => step.id === options.activeStepId);
        if (active?.kind === 'kanji-doodle') return active;
    }
    if (options.activeStepId) {
        const active = steps.find(step => step.id === options.activeStepId || step.kind === options.activeStepId);
        if (active) return active;
    }
    if (options.revealAnswer) return steps.find(step => step.kind === 'final-reveal') ?? null;
    if (options.renderAsKanji) return steps.find(step => step.kind === 'kanji-doodle') ?? null;
    return null;
}

function studyStep(kind: NewTabStudyStepKind, gradeable = false, kanji?: string, index = 0): NewTabStudyStep {
    // Step ids are rendered into the DOM so they must remain opaque. The target
    // kanji stays on the in-memory step model; including it in the id exposed
    // the answer before a learner committed their drawing.
    const id = kanji ? `${kind}:${index}` : kind;
    return { id, kind, gradeable, kanji, label: STUDY_STEP_LABELS[kind] };
}

function normalizedChallengeStepOrder(order: NewTabStudySessionOptions['stepOrder']): NewTabStudyChallengeStep[] {
    const configured = Array.isArray(order) ? order : [];
    const steps = dedupeChallengeSteps([
        ...configured,
        'kanji-doodle',
        'word',
        'type-word',
        'recall-cloze',
        'listen-pitch',
        'speaking',
    ]);
    const withoutType: NewTabStudyChallengeStep[] = steps.filter(step => step !== 'type-word');
    const wordIndex = withoutType.indexOf('word');
    withoutType.splice(wordIndex < 0 ? 0 : wordIndex + 1, 0, 'type-word');
    return withoutType;
}

function dedupeChallengeSteps(steps: NewTabStudyChallengeStep[]): NewTabStudyChallengeStep[] {
    const seen = new Set<NewTabStudyChallengeStep>();
    return steps.filter(step => {
        if (seen.has(step)) return false;
        seen.add(step);
        return true;
    });
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
    return Array.from(value).some(isJapaneseKanjiCharacter);
}

function kanjiCharacters(value: string): string[] {
    return [...new Set(Array.from(value).filter(isJapaneseKanjiCharacter))];
}

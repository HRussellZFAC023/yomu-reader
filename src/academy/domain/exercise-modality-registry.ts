export type AcademyExerciseModalityId =
    | 'japanese-to-english'
    | 'english-to-japanese'
    | 'multiple-choice'
    | 'free-response'
    | 'listening'
    | 'speaking'
    | 'drawing'
    | 'ordering'
    | 'matching'
    | 'cloze'
    | 'reading'
    | 'srs-grading';

export type AcademyExerciseConformanceStatus = 'native' | 'guided-only';

export interface AcademyExerciseModalityRegistration {
    readonly id: AcademyExerciseModalityId;
    readonly status: AcademyExerciseConformanceStatus;
    readonly surface: 'activity-plugin' | 'runtime-ui' | 'srs-integration';
    readonly runtimeKinds: readonly string[];
    readonly responseKinds: readonly string[];
    readonly evidence: string;
    readonly limitation?: string;
}

/**
 * Runtime claims are deliberately narrower than authored component labels.
 * A modality is native only when the learner commits that modality and its
 * dedicated runtime path grades the resulting response.
 */
export const ACADEMY_EXERCISE_MODALITY_REGISTRY: readonly AcademyExerciseModalityRegistration[] = Object.freeze([
    {
        id: 'japanese-to-english',
        status: 'native',
        surface: 'activity-plugin',
        runtimeKinds: ['academy-source-vocabulary-sheet'],
        responseKinds: ['source-vocabulary-recall'],
        evidence: 'Odd source rows present Japanese and grade an English meaning.',
    },
    {
        id: 'english-to-japanese',
        status: 'native',
        surface: 'activity-plugin',
        runtimeKinds: ['academy-source-vocabulary-sheet'],
        responseKinds: ['source-vocabulary-recall'],
        evidence: 'Even source rows present English and grade a Japanese word or reading.',
    },
    {
        id: 'multiple-choice',
        status: 'native',
        surface: 'activity-plugin',
        runtimeKinds: ['choice'],
        responseKinds: ['choice'],
        evidence: 'The choice plugin commits one stable option id and grades its authored key.',
    },
    {
        id: 'free-response',
        status: 'native',
        surface: 'activity-plugin',
        runtimeKinds: ['academy-typed-response'],
        responseKinds: ['kana-input', 'written-description'],
        evidence: 'The typed-response plugin grades unrevealed Japanese text, including multiline production.',
    },
    {
        id: 'listening',
        status: 'native',
        surface: 'activity-plugin',
        runtimeKinds: ['academy-moodle-listening-choice'],
        responseKinds: ['moodle-audio-a-or-b-choice'],
        evidence: 'The listening plugin renders source audio and grades answers bound to its tracks.',
    },
    {
        id: 'speaking',
        status: 'guided-only',
        surface: 'runtime-ui',
        runtimeKinds: [],
        responseKinds: [],
        evidence: 'The world language lab can cue and acknowledge speak-aloud rehearsal.',
        limitation: 'No mounted microphone capture or speech-evaluation path currently produces graded speaking evidence.',
    },
    {
        id: 'drawing',
        status: 'native',
        surface: 'activity-plugin',
        runtimeKinds: ['kanji-writing'],
        responseKinds: ['doodle-then-reading'],
        evidence: 'Kanji writing accepts Doodle canvas evidence and rejects keyboard-shaped handwriting payloads.',
    },
    {
        id: 'ordering',
        status: 'native',
        surface: 'activity-plugin',
        runtimeKinds: ['academy-sequence'],
        responseKinds: ['ordered-items'],
        evidence: 'The sequence plugin grades the submitted item order.',
    },
    {
        id: 'matching',
        status: 'native',
        surface: 'activity-plugin',
        runtimeKinds: ['academy-drag-sort'],
        responseKinds: ['drag-or-keyboard-sort'],
        evidence: 'The drag-sort plugin grades every item-to-zone placement and provides keyboard movement controls.',
    },
    {
        id: 'cloze',
        status: 'native',
        surface: 'activity-plugin',
        runtimeKinds: ['academy-bank-listening-cloze'],
        responseKinds: ['moodle-track-78-bank-cloze'],
        evidence: 'The bank-listening cloze grades eight independently bound source blanks plus the source choice.',
    },
    {
        id: 'reading',
        status: 'native',
        surface: 'activity-plugin',
        runtimeKinds: ['academy-story-reader'],
        responseKinds: ['extended-reading-checkpoint'],
        evidence: 'The story reader renders a multi-section Japanese passage before its comprehension checkpoints.',
    },
    {
        id: 'srs-grading',
        status: 'native',
        surface: 'srs-integration',
        runtimeKinds: ['yomu-local'],
        responseKinds: ['again', 'hard', 'good', 'easy'],
        evidence: 'The canonical local SRS applies distinct lapse, interval, and ease updates for all four grades.',
    },
]);

export type AuthoredExerciseDelivery =
    | 'preserved'
    | 'mixed-preserved'
    | 'generic-fallback'
    | 'omitted'
    | 'ungraded';

export interface AuthoredExerciseDeliveryRegistration {
    readonly sourceKind: string;
    readonly modality: AcademyExerciseModalityId;
    readonly delivery: AuthoredExerciseDelivery;
    readonly expectedSourceExercises: number;
    readonly expectedLinkedExercises: number;
    readonly expectedRuntimeActivities: number;
    readonly expectedRuntimeKinds: readonly string[];
}

/**
 * Current registered authored-week census. Updating authored source formats or
 * their adapter delivery requires an intentional registry and audit update.
 */
export const AUTHORED_EXERCISE_DELIVERY_REGISTRY: readonly AuthoredExerciseDeliveryRegistration[] = Object.freeze([
    sourceDelivery('choice', 'multiple-choice', 'mixed-preserved', 368, 361, 361, ['choice']),
    sourceDelivery('match', 'matching', 'preserved', 45, 45, 45, ['academy-authored-matching']),
    sourceDelivery('cloze', 'cloze', 'preserved', 81, 81, 81, ['academy-authored-cloze']),
    sourceDelivery('order', 'ordering', 'preserved', 4, 4, 4, ['academy-authored-ordering']),
    sourceDelivery('multi-choice', 'multiple-choice', 'preserved', 6, 6, 6, ['academy-authored-multi-choice']),
    sourceDelivery('exact', 'free-response', 'mixed-preserved', 78, 71, 71, ['text']),
    sourceDelivery('writing', 'free-response', 'ungraded', 2, 0, 0, []),
    sourceDelivery('quarantined-listening-choice', 'listening', 'mixed-preserved', 18, 11, 11, ['choice']),
    sourceDelivery('drag-sort', 'matching', 'omitted', 2, 0, 0, []),
    sourceDelivery('ordering', 'ordering', 'mixed-preserved', 8, 7, 7, ['academy-authored-ordering']),
    sourceDelivery('class-simulation', 'speaking', 'ungraded', 11, 0, 0, []),
    sourceDelivery('image-fill-blank', 'cloze', 'ungraded', 1, 0, 0, []),
    sourceDelivery('matching', 'matching', 'preserved', 1, 1, 1, ['academy-authored-matching']),
    sourceDelivery('character-doodle', 'drawing', 'ungraded', 2, 0, 0, []),
]);

export function academyExerciseModality(id: AcademyExerciseModalityId): AcademyExerciseModalityRegistration {
    const registration = ACADEMY_EXERCISE_MODALITY_REGISTRY.find(candidate => candidate.id === id);
    if (!registration) throw new TypeError(`Unregistered Academy exercise modality: ${id}`);
    return registration;
}

export function authoredExerciseDelivery(sourceKind: string): AuthoredExerciseDeliveryRegistration {
    const registration = AUTHORED_EXERCISE_DELIVERY_REGISTRY.find(candidate => candidate.sourceKind === sourceKind);
    if (!registration) throw new TypeError(`Unregistered authored exercise kind: ${sourceKind}`);
    return registration;
}

function sourceDelivery(
    sourceKind: string,
    modality: AcademyExerciseModalityId,
    delivery: AuthoredExerciseDelivery,
    expectedSourceExercises: number,
    expectedLinkedExercises: number,
    expectedRuntimeActivities: number,
    expectedRuntimeKinds: readonly string[],
): AuthoredExerciseDeliveryRegistration {
    return Object.freeze({
        sourceKind,
        modality,
        delivery,
        expectedSourceExercises,
        expectedLinkedExercises,
        expectedRuntimeActivities,
        expectedRuntimeKinds: Object.freeze([...expectedRuntimeKinds]),
    });
}

import type { ActivityEvaluation, ReviewSeed } from './activity-runtime';
import type { LearnerEventInput, LearningAction, LearningSkill } from './learner-record';
import type { LocalizedText } from './source-library';

const LESSON_ZERO_SOUND_INTRODUCTION_LINE_IDS = Object.freeze([
    'line:lesson-zero-sound-xingyu',
    'line:lesson-zero-sound-mika',
] as const);

const LESSON_ZERO_SOUND_CHECK_LINE_IDS = Object.freeze([
    'line:lesson-zero-sound-mika-names-xingyu',
    'line:lesson-zero-sound-xingyu-names-mika',
] as const);

const LESSON_ZERO_SOUND_LINE_IDS = Object.freeze([
    ...LESSON_ZERO_SOUND_INTRODUCTION_LINE_IDS,
    ...LESSON_ZERO_SOUND_CHECK_LINE_IDS,
] as const);

const LESSON_ZERO_SOUND_SPEAKER_IDS = Object.freeze(['xingyu', 'mika'] as const);

export type LessonZeroSoundLineId = typeof LESSON_ZERO_SOUND_LINE_IDS[number];
export type LessonZeroSoundSpeakerId = typeof LESSON_ZERO_SOUND_SPEAKER_IDS[number];

export interface LessonZeroSoundLine {
    readonly id: LessonZeroSoundLineId;
    readonly phase: 'introduction' | 'check';
    /** The character performing the line. */
    readonly speakerId: LessonZeroSoundSpeakerId;
    /** The name the learner must recognize. This differs from the performer in the check round. */
    readonly targetSpeakerId: LessonZeroSoundSpeakerId;
    readonly japanese: string;
    readonly reading: string;
    readonly meaning: LocalizedText;
    readonly audioUrl: string;
}

export interface LessonZeroSoundSpeaker {
    readonly id: LessonZeroSoundSpeakerId;
    readonly displayName: string;
    readonly katakanaName: string;
    readonly portraitUrl?: string;
}

export interface LessonZeroSoundDefinition {
    readonly schemaVersion: 1;
    readonly id: 'session:lesson-zero-sound-input';
    readonly activityId: 'activity:lesson-zero-sound-input';
    readonly contentRevision: string;
    readonly conceptIds: readonly string[];
    readonly lines: readonly LessonZeroSoundLine[];
    readonly speakers: readonly LessonZeroSoundSpeaker[];
}

export interface LessonZeroSoundSelection {
    readonly lineId: LessonZeroSoundLineId;
    readonly speakerId: LessonZeroSoundSpeakerId;
}

export interface LessonZeroSoundAttempt {
    readonly selections: readonly LessonZeroSoundSelection[];
    readonly outcome: 'pass' | 'lapse';
    readonly score: number;
    readonly missedLineIds: readonly LessonZeroSoundLineId[];
    readonly at: number;
}

export interface LessonZeroSoundSessionState {
    readonly schemaVersion: 1;
    readonly sessionId: LessonZeroSoundDefinition['id'];
    readonly status: 'active' | 'paused' | 'complete';
    readonly stage: 'meet' | 'attempt' | 'repair' | 'complete';
    /**
     * Optional only for checkpoints written before the introductions stage.
     * Incomplete legacy checkpoints restart at the short teaching exchange.
     */
    readonly introduced?: boolean;
    readonly heardLineIds: readonly LessonZeroSoundLineId[];
    readonly selections: readonly LessonZeroSoundSelection[];
    readonly repairedLineIds: readonly LessonZeroSoundLineId[];
    readonly attempts: readonly LessonZeroSoundAttempt[];
    readonly modelRevealed: boolean;
}

export type LessonZeroSoundSessionAction =
    | { readonly kind: 'mark-heard'; readonly lineId: LessonZeroSoundLineId }
    | { readonly kind: 'begin-check' }
    | { readonly kind: 'select-speaker'; readonly lineId: LessonZeroSoundLineId; readonly speakerId: LessonZeroSoundSpeakerId }
    | { readonly kind: 'check' }
    | { readonly kind: 'mark-repair-heard'; readonly lineId: LessonZeroSoundLineId }
    | { readonly kind: 'reveal-model' }
    | { readonly kind: 'retry' }
    | { readonly kind: 'pause' }
    | { readonly kind: 'resume' };

export interface LessonZeroSoundAdaptiveEvidence {
    readonly eventId: string;
    readonly at: number;
    readonly modeId: 'lesson-zero-sound-match';
    readonly skill: LearningSkill;
    readonly action: LearningAction;
    readonly sourceId: LessonZeroSoundDefinition['activityId'];
    readonly independent: boolean;
}

export interface LessonZeroSoundSessionTransition {
    readonly state: LessonZeroSoundSessionState;
    readonly evaluation?: ActivityEvaluation;
    readonly adaptive?: LessonZeroSoundAdaptiveEvidence;
    readonly supportEvents: readonly Extract<LearnerEventInput, { kind: 'support-used' }>[];
}

export function startLessonZeroSoundSession(
    definition: LessonZeroSoundDefinition,
    snapshot?: LessonZeroSoundSessionState,
): LessonZeroSoundSessionState {
    validateDefinition(definition);
    if (snapshot !== undefined) {
        if (!lessonZeroSoundSessionSnapshotShapeIsValid(snapshot)) {
            throw new TypeError('Invalid Lesson Zero sound-mission snapshot.');
        }
        validateSnapshotAgainstDefinition(definition, snapshot);
        if (snapshot.status === 'complete') {
            return { ...structuredClone(snapshot), introduced: true };
        }
        if (snapshot.introduced === undefined) {
            return freshState(definition, snapshot.status === 'paused' ? 'paused' : 'active');
        }
        return structuredClone(snapshot);
    }
    return freshState(definition, 'active');
}

export function transitionLessonZeroSoundSession(
    definition: LessonZeroSoundDefinition,
    state: LessonZeroSoundSessionState,
    action: LessonZeroSoundSessionAction,
    at: number,
): LessonZeroSoundSessionTransition {
    state = startLessonZeroSoundSession(definition, state);
    if (!Number.isFinite(at)) throw new TypeError('Sound-mission transitions need a finite timestamp.');
    if (action.kind === 'pause') {
        if (state.status !== 'active') return unchanged(state);
        return unchanged({ ...state, status: 'paused' });
    }
    if (action.kind === 'resume') {
        if (state.status !== 'paused') return unchanged(state);
        return unchanged({ ...state, status: 'active' });
    }
    if (state.status !== 'active' || state.stage === 'complete') return unchanged(state);

    if (action.kind === 'mark-heard') {
        const expectedPhase = state.stage === 'meet' ? 'introduction' : state.stage === 'attempt' ? 'check' : null;
        const line = definition.lines.find(candidate => candidate.id === action.lineId);
        if (!expectedPhase || line?.phase !== expectedPhase) return unchanged(state);
        return unchanged({ ...state, heardLineIds: unique([...state.heardLineIds, action.lineId]) });
    }
    if (action.kind === 'begin-check') {
        if (state.stage !== 'meet'
            || introductionLines(definition).some(line => !state.heardLineIds.includes(line.id))) {
            return unchanged(state);
        }
        return unchanged({
            ...state,
            stage: 'attempt',
            introduced: true,
            heardLineIds: [],
            selections: [],
        });
    }
    if (action.kind === 'select-speaker') {
        if (state.stage !== 'attempt'
            || !state.heardLineIds.includes(action.lineId)
            || !lineExists(definition, action.lineId)
            || !speakerExists(definition, action.speakerId)) return unchanged(state);
        return unchanged({
            ...state,
            selections: [
                ...state.selections.filter(selection => selection.lineId !== action.lineId),
                { lineId: action.lineId, speakerId: action.speakerId },
            ],
        });
    }
    if (action.kind === 'check') return check(definition, state, at);
    if (action.kind === 'mark-repair-heard') {
        const missed = state.attempts.at(-1)?.missedLineIds ?? [];
        if (state.stage !== 'repair' || !missed.includes(action.lineId)) return unchanged(state);
        return unchanged({ ...state, repairedLineIds: unique([...state.repairedLineIds, action.lineId]) });
    }
    if (action.kind === 'reveal-model') return revealModel(definition, state, at);
    if (action.kind === 'retry') {
        const missed = state.attempts.at(-1)?.missedLineIds ?? [];
        if (state.stage !== 'repair' || missed.some(lineId => !state.repairedLineIds.includes(lineId))) {
            return unchanged(state);
        }
        return unchanged({
            ...state,
            stage: 'attempt',
            heardLineIds: [],
            selections: [],
        });
    }
    return unchanged(state);
}

export function lessonZeroSoundSessionSnapshotShapeIsValid(
    value: unknown,
): value is LessonZeroSoundSessionState {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<LessonZeroSoundSessionState>;
    if (candidate.schemaVersion !== 1
        || candidate.sessionId !== 'session:lesson-zero-sound-input'
        || !['active', 'paused', 'complete'].includes(candidate.status ?? '')
        || !['meet', 'attempt', 'repair', 'complete'].includes(candidate.stage ?? '')
        || !lineIdSetIsValid(candidate.heardLineIds)
        || !selectionListIsValid(candidate.selections)
        || !lineIdSetIsValid(candidate.repairedLineIds)
        || !Array.isArray(candidate.attempts)
        || !candidate.attempts.every(attemptShapeIsValid)
        || typeof candidate.modelRevealed !== 'boolean'
        || (candidate.introduced !== undefined && typeof candidate.introduced !== 'boolean')) return false;
    if (candidate.status === 'complete') {
        const legacyComplete = candidate.introduced === undefined;
        const last = candidate.attempts.at(-1);
        return candidate.stage === 'complete'
            && Boolean(last)
            && (last?.outcome === 'pass'
                || (!legacyComplete && candidate.modelRevealed && candidate.attempts.length === 2));
    }
    if (candidate.stage === 'complete') return false;
    if (candidate.stage === 'repair') return candidate.attempts.at(-1)?.outcome === 'lapse';
    if (candidate.stage === 'meet') {
        return candidate.introduced !== true
            && candidate.selections.length === 0
            && candidate.attempts.length === 0;
    }
    if (candidate.introduced === false) return false;
    return true;
}

function check(
    definition: LessonZeroSoundDefinition,
    state: LessonZeroSoundSessionState,
    at: number,
): LessonZeroSoundSessionTransition {
    const lines = attemptLines(definition, state);
    if (state.stage !== 'attempt'
        || lines.some(line => !state.heardLineIds.includes(line.id))
        || lines.some(line => !state.selections.some(selection => selection.lineId === line.id))) {
        return unchanged(state);
    }
    const missedLineIds = lines
        .filter(line => state.selections.find(selection => selection.lineId === line.id)?.speakerId !== line.targetSpeakerId)
        .map(line => line.id);
    const score = (lines.length - missedLineIds.length) / lines.length;
    const outcome = missedLineIds.length === 0 ? 'pass' : 'lapse';
    const attempt: LessonZeroSoundAttempt = {
        selections: lines.map(line => state.selections.find(selection => selection.lineId === line.id)!),
        outcome,
        score,
        missedLineIds,
        at,
    };
    const hadLapse = state.attempts.some(candidate => candidate.outcome === 'lapse');
    const repairing = outcome === 'lapse' || hadLapse;
    const assistedComplete = outcome === 'lapse' && hadLapse;
    const complete = outcome === 'pass' || assistedComplete;
    const eventId = `${definition.id}:attempt:${state.attempts.length + 1}:${at}`;
    return {
        state: {
            ...state,
            status: complete ? 'complete' : 'active',
            stage: complete ? 'complete' : 'repair',
            attempts: [...state.attempts, attempt],
            repairedLineIds: [],
            modelRevealed: state.modelRevealed || assistedComplete,
        },
        evaluation: evaluationFor(definition, attempt, repairing, complete, eventId),
        adaptive: {
            eventId: `${eventId}:learning`,
            at,
            modeId: 'lesson-zero-sound-match',
            skill: 'listening',
            action: repairing ? 'repair' : 'listen',
            sourceId: definition.activityId,
            independent: !repairing,
        },
        supportEvents: assistedComplete ? [
            supportEvent(definition.activityId, 'transcript', `${eventId}:assisted:transcript`, at),
            supportEvent(definition.activityId, 'translation', `${eventId}:assisted:translation`, at),
            supportEvent(definition.activityId, 'model-answer', `${eventId}:assisted:model`, at),
        ] : [],
    };
}

function revealModel(
    definition: LessonZeroSoundDefinition,
    state: LessonZeroSoundSessionState,
    at: number,
): LessonZeroSoundSessionTransition {
    if (state.stage !== 'repair' || state.modelRevealed) return unchanged(state);
    const stem = `${definition.id}:support:${at}`;
    return {
        state: { ...state, modelRevealed: true },
        supportEvents: [
            supportEvent(definition.activityId, 'transcript', `${stem}:transcript`, at),
            supportEvent(definition.activityId, 'translation', `${stem}:translation`, at),
            supportEvent(definition.activityId, 'model-answer', `${stem}:model`, at),
        ],
    };
}

function evaluationFor(
    definition: LessonZeroSoundDefinition,
    attempt: LessonZeroSoundAttempt,
    repairing: boolean,
    complete: boolean,
    eventId: string,
): ActivityEvaluation {
    const errorTags = attempt.missedLineIds.map(lineId => {
        const line = definition.lines.find(candidate => candidate.id === lineId);
        return `listening:name:${line?.targetSpeakerId ?? 'unknown'}`;
    });
    const reviewSeeds: readonly ReviewSeed[] = complete ? [
        {
            id: 'review:lesson-zero:name:xingyu',
            conceptId: 'concept:introduction-listening-gist',
            reason: repairing ? 'repair' : 'new-learning',
            content: {
                expression: 'シンユ',
                reading: 'シンユ',
                meanings: ["Xingyu's name"],
                sentence: 'こちらはシンユさんです。',
            },
        },
        {
            id: 'review:lesson-zero:name:mika',
            conceptId: 'concept:introduction-listening-detail',
            reason: repairing ? 'repair' : 'new-learning',
            content: {
                expression: 'ミカ',
                reading: 'ミカ',
                meanings: ["Mika's name"],
                sentence: 'こちらはミカさんです。',
            },
        },
    ] : [];
    return {
        attempt: {
            kind: 'attempt-recorded',
            eventId,
            at: attempt.at,
            activityId: definition.activityId,
            conceptIds: definition.conceptIds,
            responseKind: 'audio-name-match',
            outcome: attempt.outcome,
            score: attempt.score,
            ...(errorTags.length ? { errorTags } : {}),
        },
        result: {
            outcome: attempt.outcome,
            score: attempt.score,
            errorTags,
            feedback: complete
                ? {
                    explanation: {
                        en: attempt.outcome === 'pass'
                            ? 'You recognized both names in a new exchange.'
                            : 'Those two names are saved for another short review.',
                        ja: attempt.outcome === 'pass'
                            ? '別の会話でも、二人の名前を聞き取れました。'
                            : '二人の名前は、あとでもう一度短く復習します。',
                    },
                }
                : {
                    explanation: {
                        en: 'Replay only the name you missed.',
                        ja: '間違えた名前だけを、もう一度聞きましょう。',
                    },
                    repairPrompt: {
                        en: 'Listen once, then choose that name again.',
                        ja: '一度聞いてから、その名前をもう一度選びましょう。',
                    },
                },
        },
        reviewSeeds,
    };
}

function validateDefinition(definition: LessonZeroSoundDefinition): void {
    if (definition.schemaVersion !== 1
        || definition.id !== 'session:lesson-zero-sound-input'
        || definition.activityId !== 'activity:lesson-zero-sound-input'
        || !definition.contentRevision.trim()
        || definition.conceptIds.length !== 2
        || !sameList(definition.lines.map(line => line.id), LESSON_ZERO_SOUND_LINE_IDS)
        || !sameList(definition.speakers.map(speaker => speaker.id), LESSON_ZERO_SOUND_SPEAKER_IDS)
        || !sameList(introductionLines(definition).map(line => line.id), LESSON_ZERO_SOUND_INTRODUCTION_LINE_IDS)
        || !sameList(checkLines(definition).map(line => line.id), LESSON_ZERO_SOUND_CHECK_LINE_IDS)
        || definition.lines.some(line => !line.japanese.trim()
            || !line.reading.trim()
            || !line.audioUrl.startsWith('/academy/audio/')
            || !speakerExists(definition, line.speakerId)
            || !speakerExists(definition, line.targetSpeakerId))
        || checkLines(definition).some(line => line.speakerId === line.targetSpeakerId)
        || definition.speakers.some(speaker => !speaker.displayName.trim() || !speaker.katakanaName.trim())) {
        throw new TypeError('Invalid Lesson Zero sound-mission definition.');
    }
}

function validateSnapshotAgainstDefinition(
    definition: LessonZeroSoundDefinition,
    snapshot: LessonZeroSoundSessionState,
): void {
    const lineIds = new Set(definition.lines.map(line => line.id));
    const speakerIds = new Set(definition.speakers.map(speaker => speaker.id));
    if ([...snapshot.heardLineIds, ...snapshot.repairedLineIds].some(id => !lineIds.has(id))
        || snapshot.selections.some(selection => !lineIds.has(selection.lineId) || !speakerIds.has(selection.speakerId))
        || snapshot.attempts.some(attempt => attempt.selections.some(selection =>
            !lineIds.has(selection.lineId) || !speakerIds.has(selection.speakerId)))) {
        throw new TypeError('Lesson Zero sound-mission snapshot contains an unknown line or speaker.');
    }
}

function lineExists(definition: LessonZeroSoundDefinition, lineId: LessonZeroSoundLineId): boolean {
    return definition.lines.some(line => line.id === lineId);
}

function speakerExists(definition: LessonZeroSoundDefinition, speakerId: LessonZeroSoundSpeakerId): boolean {
    return definition.speakers.some(speaker => speaker.id === speakerId);
}

function lineIdSetIsValid(value: unknown): value is readonly LessonZeroSoundLineId[] {
    return Array.isArray(value)
        && new Set(value).size === value.length
        && value.every(id => typeof id === 'string'
            && (LESSON_ZERO_SOUND_LINE_IDS as readonly string[]).includes(id));
}

function selectionListIsValid(value: unknown): value is readonly LessonZeroSoundSelection[] {
    if (!Array.isArray(value)) return false;
    const selections = value.filter((selection): selection is Record<string, unknown> =>
        Boolean(selection) && typeof selection === 'object');
    return selections.length === value.length
        && new Set(selections.map(selection => selection.lineId)).size === selections.length
        && selections.every(selection => typeof selection.lineId === 'string'
            && typeof selection.speakerId === 'string'
            && (LESSON_ZERO_SOUND_LINE_IDS as readonly string[]).includes(selection.lineId)
            && (LESSON_ZERO_SOUND_SPEAKER_IDS as readonly string[]).includes(selection.speakerId));
}

function attemptShapeIsValid(value: unknown): value is LessonZeroSoundAttempt {
    if (!value || typeof value !== 'object') return false;
    const attempt = value as Partial<LessonZeroSoundAttempt>;
    return selectionListIsValid(attempt.selections)
        && attempt.selections.length >= 1
        && attempt.selections.length <= LESSON_ZERO_SOUND_CHECK_LINE_IDS.length
        && (attempt.outcome === 'pass' || attempt.outcome === 'lapse')
        && typeof attempt.score === 'number'
        && Number.isFinite(attempt.score)
        && attempt.score >= 0
        && attempt.score <= 1
        && lineIdSetIsValid(attempt.missedLineIds)
        && typeof attempt.at === 'number'
        && Number.isFinite(attempt.at);
}

function freshState(
    definition: LessonZeroSoundDefinition,
    status: 'active' | 'paused',
): LessonZeroSoundSessionState {
    return {
        schemaVersion: 1,
        sessionId: definition.id,
        status,
        stage: 'meet',
        introduced: false,
        heardLineIds: [],
        selections: [],
        repairedLineIds: [],
        attempts: [],
        modelRevealed: false,
    };
}

function introductionLines(definition: LessonZeroSoundDefinition): readonly LessonZeroSoundLine[] {
    return definition.lines.filter(line => line.phase === 'introduction');
}

function checkLines(definition: LessonZeroSoundDefinition): readonly LessonZeroSoundLine[] {
    return definition.lines.filter(line => line.phase === 'check');
}

function attemptLines(
    definition: LessonZeroSoundDefinition,
    state: LessonZeroSoundSessionState,
): readonly LessonZeroSoundLine[] {
    const retryIds = state.attempts.at(-1)?.outcome === 'lapse' && state.repairedLineIds.length > 0
        ? new Set(state.repairedLineIds)
        : null;
    const lines = checkLines(definition);
    return retryIds ? lines.filter(line => retryIds.has(line.id)) : lines;
}

function supportEvent(
    activityId: LessonZeroSoundDefinition['activityId'],
    supportKind: 'transcript' | 'translation' | 'model-answer',
    eventId: string,
    at: number,
): Extract<LearnerEventInput, { kind: 'support-used' }> {
    return { kind: 'support-used', eventId, at, activityId, supportKind };
}

function unique<T>(values: readonly T[]): readonly T[] {
    return [...new Set(values)];
}

function sameList<T>(actual: readonly T[], expected: readonly T[]): boolean {
    return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
}

function unchanged(state: LessonZeroSoundSessionState): LessonZeroSoundSessionTransition {
    return { state, supportEvents: [] };
}

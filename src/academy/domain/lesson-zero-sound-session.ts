import type { ActivityEvaluation, ReviewSeed } from './activity-runtime';
import type { LearnerEventInput, LearningAction, LearningSkill } from './learner-record';
import type { LocalizedText } from './source-library';

const LESSON_ZERO_SOUND_LINE_IDS = Object.freeze([
    'line:lesson-zero-sound-xingyu',
    'line:lesson-zero-sound-mika',
] as const);

const LESSON_ZERO_SOUND_SPEAKER_IDS = Object.freeze(['xingyu', 'mika'] as const);

export type LessonZeroSoundLineId = typeof LESSON_ZERO_SOUND_LINE_IDS[number];
export type LessonZeroSoundSpeakerId = typeof LESSON_ZERO_SOUND_SPEAKER_IDS[number];

export interface LessonZeroSoundLine {
    readonly id: LessonZeroSoundLineId;
    readonly speakerId: LessonZeroSoundSpeakerId;
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
    readonly stage: 'attempt' | 'repair' | 'complete';
    readonly heardLineIds: readonly LessonZeroSoundLineId[];
    readonly selections: readonly LessonZeroSoundSelection[];
    readonly repairedLineIds: readonly LessonZeroSoundLineId[];
    readonly attempts: readonly LessonZeroSoundAttempt[];
    readonly modelRevealed: boolean;
}

export type LessonZeroSoundSessionAction =
    | { readonly kind: 'mark-heard'; readonly lineId: LessonZeroSoundLineId }
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
        return structuredClone(snapshot);
    }
    return {
        schemaVersion: 1,
        sessionId: definition.id,
        status: 'active',
        stage: 'attempt',
        heardLineIds: [],
        selections: [],
        repairedLineIds: [],
        attempts: [],
        modelRevealed: false,
    };
}

export function transitionLessonZeroSoundSession(
    definition: LessonZeroSoundDefinition,
    state: LessonZeroSoundSessionState,
    action: LessonZeroSoundSessionAction,
    at: number,
): LessonZeroSoundSessionTransition {
    startLessonZeroSoundSession(definition, state);
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
        if (state.stage !== 'attempt' || !lineExists(definition, action.lineId)) return unchanged(state);
        return unchanged({ ...state, heardLineIds: unique([...state.heardLineIds, action.lineId]) });
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
            repairedLineIds: [],
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
        || !['attempt', 'repair', 'complete'].includes(candidate.stage ?? '')
        || !lineIdSetIsValid(candidate.heardLineIds)
        || !selectionListIsValid(candidate.selections)
        || !lineIdSetIsValid(candidate.repairedLineIds)
        || !Array.isArray(candidate.attempts)
        || !candidate.attempts.every(attemptShapeIsValid)
        || typeof candidate.modelRevealed !== 'boolean') return false;
    if (candidate.status === 'complete') {
        return candidate.stage === 'complete' && candidate.attempts.at(-1)?.outcome === 'pass';
    }
    if (candidate.stage === 'complete') return false;
    if (candidate.stage === 'repair') return candidate.attempts.at(-1)?.outcome === 'lapse';
    return true;
}

function check(
    definition: LessonZeroSoundDefinition,
    state: LessonZeroSoundSessionState,
    at: number,
): LessonZeroSoundSessionTransition {
    if (state.stage !== 'attempt'
        || definition.lines.some(line => !state.heardLineIds.includes(line.id))
        || definition.lines.some(line => !state.selections.some(selection => selection.lineId === line.id))) {
        return unchanged(state);
    }
    const missedLineIds = definition.lines
        .filter(line => state.selections.find(selection => selection.lineId === line.id)?.speakerId !== line.speakerId)
        .map(line => line.id);
    const score = (definition.lines.length - missedLineIds.length) / definition.lines.length;
    const outcome = missedLineIds.length === 0 ? 'pass' : 'lapse';
    const attempt: LessonZeroSoundAttempt = {
        selections: definition.lines.map(line => state.selections.find(selection => selection.lineId === line.id)!),
        outcome,
        score,
        missedLineIds,
        at,
    };
    const repairing = outcome === 'lapse' || state.attempts.some(candidate => candidate.outcome === 'lapse');
    const eventId = `${definition.id}:attempt:${state.attempts.length + 1}:${at}`;
    return {
        state: {
            ...state,
            status: outcome === 'pass' ? 'complete' : 'active',
            stage: outcome === 'pass' ? 'complete' : 'repair',
            attempts: [...state.attempts, attempt],
            repairedLineIds: [],
        },
        evaluation: evaluationFor(definition, attempt, repairing, eventId),
        adaptive: {
            eventId: `${eventId}:learning`,
            at,
            modeId: 'lesson-zero-sound-match',
            skill: 'listening',
            action: repairing ? 'repair' : 'listen',
            sourceId: definition.activityId,
            independent: !repairing,
        },
        supportEvents: [],
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
    eventId: string,
): ActivityEvaluation {
    const errorTags = attempt.missedLineIds.map(lineId => `listening:speaker:${lineId.split('-').at(-1)}`);
    const reviewSeeds: readonly ReviewSeed[] = attempt.outcome === 'pass' ? [
        {
            id: 'review:lesson-zero:sound:hajimemashite',
            conceptId: 'concept:introduction-listening-gist',
            reason: repairing ? 'repair' : 'new-learning',
            content: {
                expression: 'はじめまして',
                reading: 'はじめまして',
                meanings: ['nice to meet you'],
                sentence: 'はじめまして。シンユです。',
            },
        },
        {
            id: 'review:lesson-zero:sound:yoroshiku',
            conceptId: 'concept:introduction-listening-detail',
            reason: repairing ? 'repair' : 'new-learning',
            content: {
                expression: 'よろしくお願いします',
                reading: 'よろしくおねがいします',
                meanings: ['a polite close to a first introduction'],
                sentence: 'ミカです。よろしくお願いします。',
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
            responseKind: 'audio-speaker-match',
            outcome: attempt.outcome,
            score: attempt.score,
            ...(errorTags.length ? { errorTags } : {}),
        },
        result: {
            outcome: attempt.outcome,
            score: attempt.score,
            errorTags,
            feedback: attempt.outcome === 'pass'
                ? {
                    explanation: {
                        en: 'You caught both names immediately before です.',
                        ja: '「です」のすぐ前にある二人の名前を聞き取れました。',
                    },
                }
                : {
                    explanation: {
                        en: 'Listen for the name immediately before です. You do not need every word.',
                        ja: '「です」のすぐ前の名前を聞きましょう。全部分からなくても大丈夫です。',
                    },
                    repairPrompt: {
                        en: 'Replay only the voice you missed, then match both again.',
                        ja: '間違えた声だけをもう一度聞いてから、二人をもう一度合わせましょう。',
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
        || definition.lines.some(line => !line.japanese.trim() || !line.reading.trim() || !line.audioUrl.startsWith('/academy/audio/'))
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
        && attempt.selections.length === LESSON_ZERO_SOUND_LINE_IDS.length
        && (attempt.outcome === 'pass' || attempt.outcome === 'lapse')
        && typeof attempt.score === 'number'
        && Number.isFinite(attempt.score)
        && attempt.score >= 0
        && attempt.score <= 1
        && lineIdSetIsValid(attempt.missedLineIds)
        && typeof attempt.at === 'number'
        && Number.isFinite(attempt.at);
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

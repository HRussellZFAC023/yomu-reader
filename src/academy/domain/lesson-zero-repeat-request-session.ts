import type { ActivityEvaluation, ReviewSeed } from './activity-runtime';
import type { LearnerEventInput, LearningAction, LearningSkill } from './learner-record';
import type { LocalizedText } from './source-library';

export type LessonZeroRepeatRequestChunkId = 'once-more' | 'please' | 'desu';
export type LessonZeroRepeatRequestRound = 'practice' | 'transfer';
export type LessonZeroRepeatRequestStage =
    | 'meet'
    | 'practice'
    | 'practice-repair'
    | 'transfer-ready'
    | 'transfer'
    | 'transfer-repair'
    | 'complete';

export interface LessonZeroRepeatRequestChunk {
    readonly id: LessonZeroRepeatRequestChunkId;
    readonly japanese: string;
    readonly reading: string;
    readonly soundCue: string;
    readonly meaning: LocalizedText;
}

export interface LessonZeroRepeatRequestDefinition {
    readonly schemaVersion: 1;
    readonly id: 'session:lesson-zero-repeat-request';
    readonly activityId: 'activity:lesson-zero-reconstruct-repair';
    readonly sourceQuestionId: 'source-question:classroom-phrase-09';
    readonly conceptIds: readonly string[];
    readonly target: Readonly<{
        japanese: 'もう一度お願いします。';
        reading: 'もういちどおねがいします';
        meaning: LocalizedText;
        voiceBindingId: 'world-practice:lab-classroom-repeat';
    }>;
    readonly chunks: readonly LessonZeroRepeatRequestChunk[];
    readonly practiceChunkIds: readonly ['once-more', 'please'];
    readonly transferChunkIds: readonly ['once-more', 'please'];
    readonly transferChoiceIds: readonly ['desu', 'please', 'once-more'];
}

export interface LessonZeroRepeatRequestAttempt {
    readonly round: LessonZeroRepeatRequestRound;
    readonly chosenChunkIds: readonly LessonZeroRepeatRequestChunkId[];
    readonly outcome: 'pass' | 'lapse';
    readonly errorTag?: string;
    readonly slippedChunkId?: LessonZeroRepeatRequestChunkId;
    readonly at: number;
}

export interface LessonZeroRepeatRequestSessionState {
    readonly schemaVersion: 1;
    readonly sessionId: LessonZeroRepeatRequestDefinition['id'];
    readonly status: 'ready' | 'active' | 'paused' | 'complete';
    readonly stage: LessonZeroRepeatRequestStage;
    readonly selectedChunkIds: readonly LessonZeroRepeatRequestChunkId[];
    readonly practicePassed: boolean;
    readonly transferPassed: boolean;
    readonly attempts: readonly LessonZeroRepeatRequestAttempt[];
}

export type LessonZeroRepeatRequestSessionAction =
    | { readonly kind: 'start' }
    | { readonly kind: 'select'; readonly chunkId: LessonZeroRepeatRequestChunkId }
    | { readonly kind: 'submit' }
    | { readonly kind: 'begin-retry' }
    | { readonly kind: 'begin-transfer' }
    | { readonly kind: 'pause' }
    | { readonly kind: 'resume' };

export interface LessonZeroRepeatRequestAdaptiveEvidence {
    readonly eventId: string;
    readonly at: number;
    readonly modeId: string;
    readonly skill: LearningSkill;
    readonly action: LearningAction;
    readonly sourceId: string;
    readonly independent: boolean;
}

export interface LessonZeroRepeatRequestSessionTransition {
    readonly state: LessonZeroRepeatRequestSessionState;
    readonly attempt?: LessonZeroRepeatRequestAttempt;
    readonly evaluation?: ActivityEvaluation;
    readonly adaptive?: LessonZeroRepeatRequestAdaptiveEvidence;
    readonly supportEvents: readonly Extract<LearnerEventInput, { kind: 'support-used' }>[];
}

export function startLessonZeroRepeatRequestSession(
    definition: LessonZeroRepeatRequestDefinition,
    snapshot?: LessonZeroRepeatRequestSessionState,
): LessonZeroRepeatRequestSessionState {
    validateDefinition(definition);
    if (snapshot !== undefined) {
        if (!lessonZeroRepeatRequestSessionSnapshotShapeIsValid(snapshot)) {
            throw new TypeError('Invalid Lesson Zero repeat-request snapshot.');
        }
        validateSnapshotAgainstDefinition(definition, snapshot);
        return structuredClone(snapshot);
    }
    return {
        schemaVersion: 1,
        sessionId: definition.id,
        status: 'ready',
        stage: 'meet',
        selectedChunkIds: [],
        practicePassed: false,
        transferPassed: false,
        attempts: [],
    };
}

export function transitionLessonZeroRepeatRequestSession(
    definition: LessonZeroRepeatRequestDefinition,
    state: LessonZeroRepeatRequestSessionState,
    action: LessonZeroRepeatRequestSessionAction,
    at: number,
): LessonZeroRepeatRequestSessionTransition {
    const current = startLessonZeroRepeatRequestSession(definition, state);
    if (!Number.isFinite(at)) throw new TypeError('Repeat-request transitions need a finite timestamp.');
    if (action.kind === 'start') {
        if (current.status !== 'ready') return unchanged(current);
        return unchanged({ ...current, status: 'active', stage: 'practice' });
    }
    if (action.kind === 'pause') {
        if (current.status !== 'active') return unchanged(current);
        return unchanged({ ...current, status: 'paused' });
    }
    if (action.kind === 'resume') {
        if (current.status !== 'paused') return unchanged(current);
        return unchanged({ ...current, status: 'active' });
    }
    if (current.status !== 'active') return unchanged(current);
    if (action.kind === 'begin-retry') {
        if (current.stage !== 'practice-repair' && current.stage !== 'transfer-repair') {
            return unchanged(current);
        }
        return unchanged({
            ...current,
            stage: current.stage === 'practice-repair' ? 'practice' : 'transfer',
            selectedChunkIds: [],
        });
    }
    if (action.kind === 'begin-transfer') {
        if (current.stage !== 'transfer-ready') return unchanged(current);
        return unchanged({ ...current, stage: 'transfer', selectedChunkIds: [] });
    }
    if (action.kind === 'select') {
        if (current.stage !== 'practice' && current.stage !== 'transfer') return unchanged(current);
        const allowed = new Set(
            current.stage === 'practice' ? definition.practiceChunkIds : definition.transferChoiceIds,
        );
        if (!allowed.has(action.chunkId)) return unchanged(current);
        const selected = current.selectedChunkIds.includes(action.chunkId)
            ? current.selectedChunkIds.filter(id => id !== action.chunkId)
            : current.selectedChunkIds.length < definition.transferChunkIds.length
                ? [...current.selectedChunkIds, action.chunkId]
                : current.selectedChunkIds;
        return unchanged({ ...current, selectedChunkIds: selected });
    }
    if (action.kind !== 'submit'
        || (current.stage !== 'practice' && current.stage !== 'transfer')) {
        return unchanged(current);
    }

    const round: LessonZeroRepeatRequestRound =
        current.stage === 'practice' ? 'practice' : 'transfer';
    const expected = round === 'practice'
        ? definition.practiceChunkIds
        : definition.transferChunkIds;
    const diagnosis = diagnose(current.selectedChunkIds, expected);
    const outcome = diagnosis.errorTag ? 'lapse' : 'pass';
    const attemptNumber = current.attempts.filter(attempt => attempt.round === round).length + 1;
    const eventStem = `${definition.id}:${round}:attempt:${attemptNumber}`;
    const attempt: LessonZeroRepeatRequestAttempt = {
        round,
        chosenChunkIds: [...current.selectedChunkIds],
        outcome,
        ...(diagnosis.errorTag ? { errorTag: diagnosis.errorTag } : {}),
        ...(diagnosis.slippedChunkId ? { slippedChunkId: diagnosis.slippedChunkId } : {}),
        at,
    };
    const practicePassed = current.practicePassed || (round === 'practice' && outcome === 'pass');
    const transferPassed = current.transferPassed || (round === 'transfer' && outcome === 'pass');
    const repairing = current.attempts.some(candidate =>
        candidate.round === round && candidate.outcome === 'lapse');
    const stage: LessonZeroRepeatRequestStage = outcome === 'lapse'
        ? round === 'practice' ? 'practice-repair' : 'transfer-repair'
        : round === 'practice' ? 'transfer-ready' : 'complete';
    const nextState: LessonZeroRepeatRequestSessionState = {
        ...current,
        status: transferPassed ? 'complete' : 'active',
        stage,
        selectedChunkIds: [],
        practicePassed,
        transferPassed,
        attempts: [...current.attempts, attempt],
    };
    return {
        state: nextState,
        attempt,
        evaluation: evaluationFor(definition, attempt, repairing, eventStem),
        adaptive: {
            eventId: `${eventStem}:learning`,
            at,
            modeId: 'lesson-zero-repeat-request',
            skill: round === 'transfer' ? 'transfer' : 'repair',
            action: repairing ? 'repair' : round === 'transfer' ? 'transfer' : 'produce',
            sourceId: definition.sourceQuestionId,
            independent: round === 'transfer' && outcome === 'pass' && !repairing,
        },
        supportEvents: outcome === 'lapse' ? [{
            kind: 'support-used',
            eventId: `${eventStem}:support:hint`,
            at,
            activityId: definition.activityId,
            supportKind: 'hint',
            ...(diagnosis.slippedChunkId ? { choiceId: diagnosis.slippedChunkId } : {}),
        }] : [],
    };
}

export function lessonZeroRepeatRequestSessionSnapshotShapeIsValid(
    value: unknown,
): value is LessonZeroRepeatRequestSessionState {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<LessonZeroRepeatRequestSessionState>;
    return candidate.schemaVersion === 1
        && candidate.sessionId === 'session:lesson-zero-repeat-request'
        && ['ready', 'active', 'paused', 'complete'].includes(candidate.status ?? '')
        && [
            'meet',
            'practice',
            'practice-repair',
            'transfer-ready',
            'transfer',
            'transfer-repair',
            'complete',
        ].includes(candidate.stage ?? '')
        && chunkIdArray(candidate.selectedChunkIds)
        && typeof candidate.practicePassed === 'boolean'
        && typeof candidate.transferPassed === 'boolean'
        && Array.isArray(candidate.attempts)
        && candidate.attempts.every(attemptShapeIsValid);
}

function evaluationFor(
    definition: LessonZeroRepeatRequestDefinition,
    attempt: LessonZeroRepeatRequestAttempt,
    repairing: boolean,
    eventStem: string,
): ActivityEvaluation {
    const reviewSeeds: readonly ReviewSeed[] =
        attempt.outcome === 'pass' && attempt.round === 'practice' ? [{
            id: 'review:lesson-zero:classroom-09-repeat',
            conceptId: 'concept:classroom-repair-repeat',
            reason: repairing ? 'repair' : 'new-learning',
            sourceQuestionId: definition.sourceQuestionId,
            content: {
                expression: definition.target.japanese,
                reading: definition.target.reading,
                meanings: [definition.target.meaning.en],
            },
        }] : [];
    const errorTags = attempt.errorTag ? [attempt.errorTag] : [];
    return {
        attempt: {
            kind: 'attempt-recorded',
            eventId: eventStem,
            at: attempt.at,
            activityId: `${definition.activityId}:${attempt.round}`,
            sourceQuestionId: definition.sourceQuestionId,
            conceptIds: definition.conceptIds,
            responseKind: 'ordered-sound-chunks',
            outcome: attempt.outcome,
            score: attempt.outcome === 'pass' ? 1 : 0,
            ...(errorTags.length ? { errorTags } : {}),
        },
        result: {
            outcome: attempt.outcome,
            score: attempt.outcome === 'pass' ? 1 : 0,
            errorTags,
            feedback: attempt.outcome === 'pass'
                ? {
                    explanation: attempt.round === 'transfer'
                        ? {
                            en: 'You used the same request when the scene changed.',
                            ja: '場面が変わっても、同じ頼み方を使えました。',
                        }
                        : {
                            en: 'The request lands in the right order.',
                            ja: '頼み方を正しい順番で組み立てられました。',
                        },
                }
                : {
                    explanation: repairExplanation(attempt),
                    repairPrompt: {
                        en: 'Fix only that part, then rebuild the request.',
                        ja: 'そこだけ直して、もう一度組み立てましょう。',
                    },
                },
        },
        reviewSeeds,
    };
}

function repairExplanation(attempt: LessonZeroRepeatRequestAttempt): LocalizedText {
    if (attempt.errorTag === 'repeat-request-known-pattern-intrusion') {
        return {
            en: 'です finishes a statement. This time you need the polite request ending.',
            ja: '「です」は文を結びます。ここでは丁寧な依頼の結びを使います。',
        };
    }
    if (attempt.errorTag === 'repeat-request-order') {
        return {
            en: 'Say “one more time” first; finish with the polite request.',
            ja: '先に「もう一度」、最後に丁寧な依頼を置きます。',
        };
    }
    return attempt.slippedChunkId === 'please'
        ? {
            en: 'The second sound makes it a polite request: onegaishimasu.',
            ja: '二つ目は丁寧な依頼の「お願いします」です。',
        }
        : {
            en: 'Begin with the sound for “one more time”: mou ichido.',
            ja: '最初は「もう一度」の音です。',
        };
}

function diagnose(
    actual: readonly LessonZeroRepeatRequestChunkId[],
    expected: readonly LessonZeroRepeatRequestChunkId[],
): Readonly<{ errorTag?: string; slippedChunkId?: LessonZeroRepeatRequestChunkId }> {
    if (actual.length === expected.length
        && actual.every((chunkId, index) => chunkId === expected[index])) {
        return {};
    }
    if (actual.includes('desu')) {
        return { errorTag: 'repeat-request-known-pattern-intrusion', slippedChunkId: 'please' };
    }
    if (actual.length === expected.length
        && actual[0] === expected[1]
        && actual[1] === expected[0]) {
        return { errorTag: 'repeat-request-order', slippedChunkId: 'once-more' };
    }
    const slippedIndex = expected.findIndex((chunkId, index) => actual[index] !== chunkId);
    return {
        errorTag: 'repeat-request-missing-chunk',
        slippedChunkId: expected[Math.max(0, slippedIndex)] ?? 'once-more',
    };
}

function validateDefinition(definition: LessonZeroRepeatRequestDefinition): void {
    if (definition.schemaVersion !== 1
        || definition.id !== 'session:lesson-zero-repeat-request'
        || definition.activityId !== 'activity:lesson-zero-reconstruct-repair'
        || definition.sourceQuestionId !== 'source-question:classroom-phrase-09'
        || definition.target.japanese !== 'もう一度お願いします。'
        || definition.target.reading !== 'もういちどおねがいします'
        || definition.target.voiceBindingId !== 'world-practice:lab-classroom-repeat') {
        throw new TypeError('Invalid Lesson Zero repeat-request definition.');
    }
    const ids = definition.chunks.map(chunk => chunk.id);
    if (new Set(ids).size !== ids.length
        || !definition.practiceChunkIds.every(id => ids.includes(id))
        || !definition.transferChoiceIds.every(id => ids.includes(id))
        || definition.practiceChunkIds.join('|') !== 'once-more|please'
        || definition.transferChunkIds.join('|') !== 'once-more|please') {
        throw new TypeError('Repeat-request definition has an invalid chunk sequence.');
    }
}

function validateSnapshotAgainstDefinition(
    definition: LessonZeroRepeatRequestDefinition,
    snapshot: LessonZeroRepeatRequestSessionState,
): void {
    const known = new Set(definition.chunks.map(chunk => chunk.id));
    if (snapshot.selectedChunkIds.some(id => !known.has(id))
        || snapshot.attempts.some(attempt =>
            attempt.chosenChunkIds.some(id => !known.has(id))
            || (attempt.slippedChunkId !== undefined && !known.has(attempt.slippedChunkId)))) {
        throw new TypeError('Repeat-request snapshot contains an unknown chunk.');
    }
    if (snapshot.status === 'complete' && (!snapshot.practicePassed || !snapshot.transferPassed)) {
        throw new TypeError('Repeat-request snapshot completes without both passes.');
    }
}

function attemptShapeIsValid(value: unknown): value is LessonZeroRepeatRequestAttempt {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<LessonZeroRepeatRequestAttempt>;
    return (candidate.round === 'practice' || candidate.round === 'transfer')
        && chunkIdArray(candidate.chosenChunkIds)
        && (candidate.outcome === 'pass' || candidate.outcome === 'lapse')
        && (candidate.errorTag === undefined || typeof candidate.errorTag === 'string')
        && (candidate.slippedChunkId === undefined || isChunkId(candidate.slippedChunkId))
        && typeof candidate.at === 'number'
        && Number.isFinite(candidate.at);
}

function chunkIdArray(value: unknown): value is readonly LessonZeroRepeatRequestChunkId[] {
    return Array.isArray(value)
        && value.length <= 3
        && new Set(value).size === value.length
        && value.every(isChunkId);
}

function isChunkId(value: unknown): value is LessonZeroRepeatRequestChunkId {
    return value === 'once-more' || value === 'please' || value === 'desu';
}

function unchanged(
    state: LessonZeroRepeatRequestSessionState,
): LessonZeroRepeatRequestSessionTransition {
    return { state, supportEvents: [] };
}

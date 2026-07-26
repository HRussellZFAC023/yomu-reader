import type { ActivityEvaluation, ReviewSeed } from './activity-runtime';
import type { LearnerEventInput, LearningAction, LearningSkill } from './learner-record';
import type { LocalizedText } from './source-library';

export type LessonZeroDeskWordId = 'homework' | 'example';
export type LessonZeroDeskPropId = 'take-home-sheet' | 'worked-example';
export type LessonZeroDeskRound = 'practice' | 'transfer';
export type LessonZeroDeskStage =
    | 'meet-homework'
    | 'meet-example'
    | 'practice'
    | 'practice-repair'
    | 'transfer-ready'
    | 'transfer'
    | 'transfer-repair'
    | 'complete';

export interface LessonZeroDeskWord {
    readonly id: LessonZeroDeskWordId;
    readonly japanese: string;
    readonly reading: string;
    readonly soundCue: string;
    readonly meaning: LocalizedText;
    readonly sourceQuestionId: string;
    readonly conceptId: string;
    readonly voiceBindingId: string;
    readonly voiceJapanese: string;
    readonly propId: LessonZeroDeskPropId;
}

export interface LessonZeroDeskLanguageDefinition {
    readonly schemaVersion: 1;
    readonly id: 'session:lesson-zero-desk-language';
    readonly activityId: 'activity:lesson-zero-desk-language';
    readonly conceptIds: readonly string[];
    readonly words: readonly [LessonZeroDeskWord, LessonZeroDeskWord];
    readonly practiceOrder: readonly ['homework', 'example'];
    readonly transferOrder: readonly ['example', 'homework'];
}

export interface LessonZeroDeskAttempt {
    readonly round: LessonZeroDeskRound;
    readonly wordId: LessonZeroDeskWordId;
    readonly chosenPropId: LessonZeroDeskPropId;
    readonly outcome: 'pass' | 'lapse';
    readonly errorTag?: string;
    readonly at: number;
}

export interface LessonZeroDeskLanguageSessionState {
    readonly schemaVersion: 1;
    readonly sessionId: LessonZeroDeskLanguageDefinition['id'];
    readonly status: 'ready' | 'active' | 'paused' | 'complete';
    readonly stage: LessonZeroDeskStage;
    readonly practiceIndex: number;
    readonly transferIndex: number;
    readonly practicePassedWordIds: readonly LessonZeroDeskWordId[];
    readonly transferPassedWordIds: readonly LessonZeroDeskWordId[];
    readonly attempts: readonly LessonZeroDeskAttempt[];
}

export type LessonZeroDeskLanguageAction =
    | { readonly kind: 'start' }
    | { readonly kind: 'next-introduction' }
    | { readonly kind: 'choose-prop'; readonly propId: LessonZeroDeskPropId }
    | { readonly kind: 'begin-retry' }
    | { readonly kind: 'begin-transfer' }
    | { readonly kind: 'pause' }
    | { readonly kind: 'resume' };

export interface LessonZeroDeskAdaptiveEvidence {
    readonly eventId: string;
    readonly at: number;
    readonly modeId: string;
    readonly skill: LearningSkill;
    readonly action: LearningAction;
    readonly sourceId: string;
    readonly independent: boolean;
}

export interface LessonZeroDeskLanguageTransition {
    readonly state: LessonZeroDeskLanguageSessionState;
    readonly attempt?: LessonZeroDeskAttempt;
    readonly evaluation?: ActivityEvaluation;
    readonly adaptive?: LessonZeroDeskAdaptiveEvidence;
    readonly supportEvents: readonly Extract<LearnerEventInput, { kind: 'support-used' }>[];
}

export function startLessonZeroDeskLanguageSession(
    definition: LessonZeroDeskLanguageDefinition,
    snapshot?: LessonZeroDeskLanguageSessionState,
): LessonZeroDeskLanguageSessionState {
    validateDefinition(definition);
    if (snapshot !== undefined) {
        if (!lessonZeroDeskLanguageSessionSnapshotShapeIsValid(snapshot)) {
            throw new TypeError('Invalid Lesson Zero desk-language snapshot.');
        }
        validateSnapshotAgainstDefinition(definition, snapshot);
        return structuredClone(snapshot);
    }
    return {
        schemaVersion: 1,
        sessionId: definition.id,
        status: 'ready',
        stage: 'meet-homework',
        practiceIndex: 0,
        transferIndex: 0,
        practicePassedWordIds: [],
        transferPassedWordIds: [],
        attempts: [],
    };
}

export function transitionLessonZeroDeskLanguageSession(
    definition: LessonZeroDeskLanguageDefinition,
    state: LessonZeroDeskLanguageSessionState,
    action: LessonZeroDeskLanguageAction,
    at: number,
): LessonZeroDeskLanguageTransition {
    const current = startLessonZeroDeskLanguageSession(definition, state);
    if (!Number.isFinite(at)) throw new TypeError('Desk-language transitions need a finite timestamp.');
    if (action.kind === 'start') {
        if (current.status !== 'ready') return unchanged(current);
        return unchanged({ ...current, status: 'active' });
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
    if (action.kind === 'next-introduction') {
        if (current.stage === 'meet-homework') {
            return unchanged({ ...current, stage: 'meet-example' });
        }
        if (current.stage === 'meet-example') {
            return unchanged({ ...current, stage: 'practice' });
        }
        return unchanged(current);
    }
    if (action.kind === 'begin-retry') {
        if (current.stage !== 'practice-repair' && current.stage !== 'transfer-repair') {
            return unchanged(current);
        }
        return unchanged({
            ...current,
            stage: current.stage === 'practice-repair' ? 'practice' : 'transfer',
        });
    }
    if (action.kind === 'begin-transfer') {
        if (current.stage !== 'transfer-ready') return unchanged(current);
        return unchanged({ ...current, stage: 'transfer', transferIndex: 0 });
    }
    if (action.kind !== 'choose-prop'
        || (current.stage !== 'practice' && current.stage !== 'transfer')) {
        return unchanged(current);
    }

    const round: LessonZeroDeskRound = current.stage;
    const order = round === 'practice' ? definition.practiceOrder : definition.transferOrder;
    const index = round === 'practice' ? current.practiceIndex : current.transferIndex;
    const wordId = order[index];
    if (!wordId) return unchanged(current);
    const word = wordFor(definition, wordId);
    const outcome = action.propId === word.propId ? 'pass' : 'lapse';
    const errorTag = outcome === 'lapse'
        ? `desk-language-${word.id}-confused-with-${word.id === 'homework' ? 'example' : 'homework'}`
        : undefined;
    const attemptNumber = current.attempts.filter(candidate =>
        candidate.round === round && candidate.wordId === wordId).length + 1;
    const eventStem = `${definition.id}:${round}:${wordId}:attempt:${attemptNumber}`;
    const attempt: LessonZeroDeskAttempt = {
        round,
        wordId,
        chosenPropId: action.propId,
        outcome,
        ...(errorTag ? { errorTag } : {}),
        at,
    };
    const repaired = current.attempts.some(candidate =>
        candidate.round === round
        && candidate.wordId === wordId
        && candidate.outcome === 'lapse');
    if (outcome === 'lapse') {
        const nextState = {
            ...current,
            stage: round === 'practice' ? 'practice-repair' : 'transfer-repair',
            attempts: [...current.attempts, attempt],
        } satisfies LessonZeroDeskLanguageSessionState;
        return {
            state: nextState,
            attempt,
            evaluation: evaluationFor(definition, word, attempt, repaired, eventStem),
            adaptive: adaptiveFor(word, attempt, repaired, eventStem),
            supportEvents: [{
                kind: 'support-used',
                eventId: `${eventStem}:support:hint`,
                at,
                activityId: definition.activityId,
                supportKind: 'hint',
                choiceId: wordId,
            }],
        };
    }

    const practicePassedWordIds = round === 'practice'
        ? unique([...current.practicePassedWordIds, wordId])
        : current.practicePassedWordIds;
    const transferPassedWordIds = round === 'transfer'
        ? unique([...current.transferPassedWordIds, wordId])
        : current.transferPassedWordIds;
    const nextIndex = index + 1;
    const roundFinished = nextIndex >= order.length;
    const complete = round === 'transfer' && roundFinished;
    const nextState: LessonZeroDeskLanguageSessionState = {
        ...current,
        status: complete ? 'complete' : 'active',
        stage: complete
            ? 'complete'
            : round === 'practice' && roundFinished
                ? 'transfer-ready'
                : round,
        practiceIndex: round === 'practice' ? nextIndex : current.practiceIndex,
        transferIndex: round === 'transfer' ? nextIndex : current.transferIndex,
        practicePassedWordIds,
        transferPassedWordIds,
        attempts: [...current.attempts, attempt],
    };
    return {
        state: nextState,
        attempt,
        evaluation: evaluationFor(definition, word, attempt, repaired, eventStem),
        adaptive: adaptiveFor(word, attempt, repaired, eventStem),
        supportEvents: [],
    };
}

export function currentLessonZeroDeskWord(
    definition: LessonZeroDeskLanguageDefinition,
    state: LessonZeroDeskLanguageSessionState,
): LessonZeroDeskWord {
    if (state.stage === 'meet-homework') return wordFor(definition, 'homework');
    if (state.stage === 'meet-example') return wordFor(definition, 'example');
    if (state.stage === 'practice' || state.stage === 'practice-repair') {
        return wordFor(
            definition,
            definition.practiceOrder[Math.min(state.practiceIndex, definition.practiceOrder.length - 1)]!,
        );
    }
    return wordFor(
        definition,
        definition.transferOrder[Math.min(state.transferIndex, definition.transferOrder.length - 1)]!,
    );
}

export function lessonZeroDeskLanguageSessionSnapshotShapeIsValid(
    value: unknown,
): value is LessonZeroDeskLanguageSessionState {
    if (!value || typeof value !== 'object') return false;
    const candidate = value as Partial<LessonZeroDeskLanguageSessionState>;
    return candidate.schemaVersion === 1
        && candidate.sessionId === 'session:lesson-zero-desk-language'
        && ['ready', 'active', 'paused', 'complete'].includes(candidate.status ?? '')
        && [
            'meet-homework',
            'meet-example',
            'practice',
            'practice-repair',
            'transfer-ready',
            'transfer',
            'transfer-repair',
            'complete',
        ].includes(candidate.stage ?? '')
        && Number.isInteger(candidate.practiceIndex)
        && (candidate.practiceIndex ?? -1) >= 0
        && Number.isInteger(candidate.transferIndex)
        && (candidate.transferIndex ?? -1) >= 0
        && wordIdArray(candidate.practicePassedWordIds)
        && wordIdArray(candidate.transferPassedWordIds)
        && Array.isArray(candidate.attempts)
        && candidate.attempts.every(attemptShapeIsValid);
}

function evaluationFor(
    definition: LessonZeroDeskLanguageDefinition,
    word: LessonZeroDeskWord,
    attempt: LessonZeroDeskAttempt,
    repaired: boolean,
    eventStem: string,
): ActivityEvaluation {
    const reviewSeeds: readonly ReviewSeed[] =
        attempt.outcome === 'pass' && attempt.round === 'practice' ? [{
            id: `review:lesson-zero:classroom-${word.id === 'homework' ? '13-homework' : '14-example'}`,
            conceptId: word.conceptId,
            reason: repaired ? 'repair' : 'new-learning',
            sourceQuestionId: word.sourceQuestionId,
            content: {
                expression: word.japanese,
                reading: word.reading,
                meanings: [word.meaning.en],
            },
        }] : [];
    return {
        attempt: {
            kind: 'attempt-recorded',
            eventId: eventStem,
            at: attempt.at,
            activityId: `${definition.activityId}:${attempt.round}:${word.id}`,
            sourceQuestionId: word.sourceQuestionId,
            conceptIds: [word.conceptId],
            responseKind: 'prop-identification',
            outcome: attempt.outcome,
            score: attempt.outcome === 'pass' ? 1 : 0,
            ...(attempt.errorTag ? { errorTags: [attempt.errorTag] } : {}),
        },
        result: {
            outcome: attempt.outcome,
            score: attempt.outcome === 'pass' ? 1 : 0,
            errorTags: attempt.errorTag ? [attempt.errorTag] : [],
            feedback: {
                explanation: attempt.outcome === 'pass'
                    ? {
                        en: word.id === 'homework'
                            ? 'Right. This is the work you take away.'
                            : 'Right. This is the model you can follow.',
                        ja: word.id === 'homework'
                            ? 'そうです。あとでする課題です。'
                            : 'そうです。まねをする見本です。',
                    }
                    : {
                        en: word.id === 'homework'
                            ? 'This word goes on work for later.'
                            : 'This word goes above a model to follow.',
                        ja: word.id === 'homework'
                            ? 'このことばは、あとでする課題につきます。'
                            : 'このことばは、まねをする見本につきます。',
                    },
            },
        },
        reviewSeeds,
    };
}

function adaptiveFor(
    word: LessonZeroDeskWord,
    attempt: LessonZeroDeskAttempt,
    repaired: boolean,
    eventStem: string,
): LessonZeroDeskAdaptiveEvidence {
    return {
        eventId: `${eventStem}:learning`,
        at: attempt.at,
        modeId: 'lesson-zero-desk-language',
        skill: attempt.round === 'transfer' ? 'transfer' : 'listening',
        action: repaired ? 'repair' : attempt.round === 'transfer' ? 'transfer' : 'recognise',
        sourceId: word.sourceQuestionId,
        independent: attempt.round === 'transfer' && attempt.outcome === 'pass' && !repaired,
    };
}

function validateDefinition(definition: LessonZeroDeskLanguageDefinition): void {
    if (definition.schemaVersion !== 1
        || definition.id !== 'session:lesson-zero-desk-language'
        || definition.activityId !== 'activity:lesson-zero-desk-language') {
        throw new TypeError('Invalid Lesson Zero desk-language definition.');
    }
    if (definition.words.length !== 2
        || definition.words[0].id !== 'homework'
        || definition.words[1].id !== 'example'
        || new Set(definition.words.map(word => word.voiceBindingId)).size !== 2) {
        throw new TypeError('Desk language needs two distinct, ordered words and voice bindings.');
    }
}

function validateSnapshotAgainstDefinition(
    definition: LessonZeroDeskLanguageDefinition,
    snapshot: LessonZeroDeskLanguageSessionState,
): void {
    const practicePrefix = definition.practiceOrder.slice(0, snapshot.practiceIndex);
    const transferPrefix = definition.transferOrder.slice(0, snapshot.transferIndex);
    const practiceComplete = snapshot.practiceIndex === definition.practiceOrder.length
        && sameWordIds(snapshot.practicePassedWordIds, definition.practiceOrder);
    const transferComplete = snapshot.transferIndex === definition.transferOrder.length
        && sameWordIds(snapshot.transferPassedWordIds, definition.transferOrder);
    const afterPractice = [
        'transfer-ready',
        'transfer',
        'transfer-repair',
        'complete',
    ].includes(snapshot.stage);
    if (snapshot.practiceIndex > definition.practiceOrder.length
        || snapshot.transferIndex > definition.transferOrder.length
        || snapshot.practicePassedWordIds.some(id => !definition.practiceOrder.includes(id))
        || snapshot.transferPassedWordIds.some(id => !definition.transferOrder.includes(id))
        || !sameWordIds(snapshot.practicePassedWordIds, practicePrefix)
        || !sameWordIds(snapshot.transferPassedWordIds, transferPrefix)
        || (afterPractice && !practiceComplete)
        || (snapshot.stage === 'complete' && !transferComplete)
        || (snapshot.status === 'complete') !== (snapshot.stage === 'complete')
        || (snapshot.status === 'ready' && snapshot.stage !== 'meet-homework')) {
        throw new TypeError('Desk-language snapshot does not match its definition.');
    }
}

function wordFor(
    definition: LessonZeroDeskLanguageDefinition,
    wordId: LessonZeroDeskWordId,
): LessonZeroDeskWord {
    const word = definition.words.find(candidate => candidate.id === wordId);
    if (!word) throw new TypeError(`Missing Lesson Zero desk word ${wordId}.`);
    return word;
}

function wordIdArray(value: unknown): value is readonly LessonZeroDeskWordId[] {
    return Array.isArray(value)
        && value.every(id => id === 'homework' || id === 'example')
        && new Set(value).size === value.length;
}

function attemptShapeIsValid(value: unknown): value is LessonZeroDeskAttempt {
    if (!value || typeof value !== 'object') return false;
    const attempt = value as Partial<LessonZeroDeskAttempt>;
    return (attempt.round === 'practice' || attempt.round === 'transfer')
        && (attempt.wordId === 'homework' || attempt.wordId === 'example')
        && (attempt.chosenPropId === 'take-home-sheet' || attempt.chosenPropId === 'worked-example')
        && (attempt.outcome === 'pass' || attempt.outcome === 'lapse')
        && Number.isFinite(attempt.at);
}

function unique<T>(values: readonly T[]): T[] {
    return [...new Set(values)];
}

function sameWordIds(
    left: readonly LessonZeroDeskWordId[],
    right: readonly LessonZeroDeskWordId[],
): boolean {
    return left.length === right.length && left.every((id, index) => id === right[index]);
}

function unchanged(
    state: LessonZeroDeskLanguageSessionState,
): LessonZeroDeskLanguageTransition {
    return { state, supportEvents: [] };
}

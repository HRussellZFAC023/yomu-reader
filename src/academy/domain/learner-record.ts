export type AttemptOutcome = 'pass' | 'lapse';
export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';
export type GrammarKnowledge = 'unknown' | 'learning' | 'known' | 'mastered';
export type JlptBand = 'n5' | 'n4' | 'n3' | 'n2' | 'n1';
export type PlacementSkill = 'language-knowledge' | 'reading' | 'listening' | 'speaking-confidence' | 'writing-confidence';
export type StartingRoute = 'lesson-zero' | 'manual-band' | 'placement-mock';
export type LearningSkill = 'kana' | 'kanji' | 'vocabulary' | 'grammar' | 'reading' | 'listening' | 'speaking' | 'writing' | 'repair' | 'transfer';
export type LearningAction = 'recognise' | 'recall' | 'produce' | 'listen' | 'speak' | 'write' | 'repair' | 'review' | 'read' | 'explore' | 'source-complete' | 'transfer';
export type SupportKind = 'hint' | 'transcript' | 'translation' | 'definition' | 'example-gloss' | 'model-answer';

export interface LearnerProfileSnapshot {
    readonly displayName: string;
    readonly learningReason: string;
    readonly portraitId: string;
}

type LearnerEventData =
    | {
        readonly kind: 'attempt-recorded';
        readonly activityId: string;
        readonly sourceQuestionId?: string;
        readonly conceptIds: readonly string[];
        readonly responseKind: string;
        readonly outcome: AttemptOutcome;
        readonly score?: number;
        readonly errorTags?: readonly string[];
    }
    | {
        readonly kind: 'review-rated';
        readonly reviewItemId: string;
        readonly rating: ReviewRating;
    }
    | {
        readonly kind: 'grammar-known-changed';
        readonly conceptId: string;
        readonly knowledge: GrammarKnowledge;
    }
    | {
        readonly kind: 'scene-completed';
        readonly sceneId: string;
    }
    | {
        /** A grounded scene that the learner actually completed, with its exact attendees. */
        readonly kind: 'characters-encountered';
        readonly encounterId: string;
        readonly sceneId: string;
        readonly attendeeIds: readonly string[];
    }
    | {
        readonly kind: 'bond-changed';
        readonly characterId: string;
        readonly delta: number;
    }
    | {
        readonly kind: 'asset-unlocked';
        readonly assetId: string;
    }
    | {
        readonly kind: 'profile-changed';
        readonly profile: LearnerProfileSnapshot;
    }
    | {
        readonly kind: 'placement-assessed';
        readonly assessmentId: string;
        readonly targetBand: JlptBand;
        readonly itemIds: readonly string[];
        readonly scores: Readonly<Record<PlacementSkill, number>>;
        readonly recommendedBand: JlptBand;
        readonly recommendedStart?: JlptBand | 'lesson-zero';
        readonly calibration: 'vertical-slice' | 'validated';
    }
    | {
        readonly kind: 'curriculum-entry-chosen';
        readonly route: StartingRoute;
        readonly band?: JlptBand;
        readonly recommendationAccepted?: boolean;
    }
    | {
        readonly kind: 'review-scheduled';
        readonly reviewItemId: string;
        readonly conceptId: string;
        readonly dueAt: number;
        readonly provenance: Readonly<Record<string, string>>;
    }
    | {
        readonly kind: 'review-schedule-neutralized';
        readonly scheduledEventId: string;
        readonly reason: 'legacy-ungrounded-academy';
    }
    | {
        readonly kind: 'learning-evidence-recorded';
        readonly activityId: string;
        readonly modeId: string;
        readonly skill: LearningSkill;
        readonly action: LearningAction;
        readonly outcome: AttemptOutcome;
        readonly conceptIds: readonly string[];
        readonly sourceId?: string;
        readonly durationMs?: number;
        readonly independent: boolean;
        readonly kanji?: string;
    }
    | {
        readonly kind: 'vocabulary-collected';
        readonly collectionItemId: string;
        readonly expression: string;
        readonly reading?: string;
        readonly meanings: readonly string[];
        readonly provenance: {
            readonly origin: 'academy';
            readonly encounterId: string;
            readonly activityId: string;
            readonly sourceId?: string;
        };
    }
    | {
        readonly kind: 'vocabulary-collection-undone';
        readonly collectionItemId: string;
        readonly collectedEventId: string;
    }
    | {
        readonly kind: 'academy-day-closed';
        readonly dayId: string;
        readonly mainLessonCompleted: boolean;
        readonly optionalActivityIds: readonly string[];
        readonly elapsedMs: number;
    }
    | {
        readonly kind: 'achievement-ceremony-seen';
        readonly achievementId: string;
        readonly tier: 'bronze' | 'silver' | 'gold' | 'platinum';
    }
    | {
        readonly kind: 'relationship-chapter-unlocked';
        readonly characterId: string;
        readonly chapter: number;
        readonly majorTurn?: 'recognition' | 'friction' | 'support';
    }
    | {
        /** A short, authored learner-owned line earned from a completed task. */
        readonly kind: 'journal-line-recorded';
        readonly journalLineId: string;
        readonly characterId: string;
        readonly text: Readonly<{ ja: string; en: string }>;
        readonly activityId: string;
        readonly sourceQuestionId?: string;
    }
    | {
        readonly kind: 'support-used';
        readonly activityId: string;
        readonly supportKind: SupportKind;
        readonly choiceId?: string;
    };

export type LearnerEventInput = LearnerEventData & {
    readonly eventId?: string;
    readonly at?: number;
};

export type LearnerEvent = LearnerEventData & {
    readonly schemaVersion: 1;
    readonly eventId: string;
    readonly at: number;
};

export interface ActivityProjection {
    readonly activityId: string;
    readonly attemptCount: number;
    readonly lapseCount: number;
    readonly lastOutcome: AttemptOutcome;
    readonly lastAttemptAt: number;
    readonly sourceQuestionId?: string;
    readonly conceptIds: readonly string[];
}

export interface LearnerProjection {
    readonly eventCount: number;
    readonly lastEventAt: number | null;
    readonly activities: Readonly<Record<string, ActivityProjection>>;
    readonly reviewRatings: Readonly<Record<string, ReviewRating>>;
    readonly grammarKnowledge: Readonly<Record<string, GrammarKnowledge>>;
    readonly completedScenes: readonly string[];
    /** Canonical record of people met in completed grounded encounters. */
    readonly encounteredCharacters: Readonly<Record<string, {
        readonly encounterIds: readonly string[];
        readonly sceneIds: readonly string[];
    }>>;
    readonly completedEncounterIds: readonly string[];
    readonly bonds: Readonly<Record<string, number>>;
    readonly unlockedAssets: readonly string[];
    readonly profile: LearnerProfileSnapshot | null;
    readonly latestPlacement: Extract<LearnerEvent, { kind: 'placement-assessed' }> | null;
    readonly curriculumEntry: Extract<LearnerEvent, { kind: 'curriculum-entry-chosen' }> | null;
    readonly scheduledReviews: Readonly<Record<string, Extract<LearnerEvent, { kind: 'review-scheduled' }>>>;
    readonly vocabularyCollection: Readonly<Record<string, Extract<LearnerEvent, { kind: 'vocabulary-collected' }>>>;
    readonly closedDays: Readonly<Record<string, Extract<LearnerEvent, { kind: 'academy-day-closed' }>>>;
    readonly seenAchievementCeremonies: readonly string[];
    readonly relationshipJournal: Readonly<Record<string, {
        readonly chapters: readonly number[];
        readonly majorTurns: readonly ('recognition' | 'friction' | 'support')[];
    }>>;
    readonly journalLines: Readonly<Record<string, Extract<LearnerEvent, { kind: 'journal-line-recorded' }>>>;
    readonly supportUses: readonly Extract<LearnerEvent, { kind: 'support-used' }>[];
}

export interface LearnerEventRepository {
    readAll(): Promise<readonly LearnerEvent[]>;
    append(events: readonly LearnerEvent[]): Promise<void>;
}

export interface LearnerRecord {
    record(input: LearnerEventInput): Promise<LearnerEvent>;
    recordMany(inputs: readonly LearnerEventInput[]): Promise<readonly LearnerEvent[]>;
    history(): Promise<readonly LearnerEvent[]>;
    snapshot(): Promise<LearnerProjection>;
}

export interface LearnerRecordOptions {
    readonly repository?: LearnerEventRepository;
    readonly now?: () => number;
    readonly createEventId?: () => string;
}

export function createLearnerRecord(options: LearnerRecordOptions = {}): LearnerRecord {
    const repository = options.repository ?? createMemoryLearnerEventRepository();
    const now = options.now ?? Date.now;
    const createEventId = options.createEventId ?? defaultEventId;
    let pending = Promise.resolve();

    const recordMany = (inputs: readonly LearnerEventInput[]): Promise<readonly LearnerEvent[]> => {
        const operation = pending.then(async () => {
            const events = inputs.map(input => normalizeEvent(input, now, createEventId));
            await repository.append(events);
            return clone(events);
        });
        pending = operation.then(() => undefined, () => undefined);
        return operation;
    };

    const history = async (): Promise<readonly LearnerEvent[]> => {
        await pending;
        return clone(await repository.readAll());
    };

    return {
        async record(input) {
            const [event] = await recordMany([input]);
            return event;
        },
        recordMany,
        history,
        async snapshot() {
            return projectLearnerRecord(await history());
        },
    };
}

export function createMemoryLearnerEventRepository(initial: readonly LearnerEvent[] = []): LearnerEventRepository {
    const events = initial.map(validateEvent);
    return {
        async readAll() {
            return clone(events);
        },
        async append(candidates) {
            for (const candidate of candidates.map(validateEvent)) {
                const previous = events.find(event => event.eventId === candidate.eventId);
                if (!previous) events.push(clone(candidate));
                else if (!learnerEventsAreEquivalent(previous, candidate)) {
                    throw new Error(`Conflicting learner event id: ${candidate.eventId}`);
                }
            }
        },
    };
}

/** Event ids are idempotency keys; a retry may receive a later local timestamp. */
export function learnerEventsAreEquivalent(left: LearnerEvent, right: LearnerEvent): boolean {
    const { at: _leftAt, ...leftPayload } = left;
    const { at: _rightAt, ...rightPayload } = right;
    return JSON.stringify(leftPayload) === JSON.stringify(rightPayload);
}

type LearnerEventOfKind<Kind extends LearnerEvent['kind']> = Extract<LearnerEvent, { kind: Kind }>;
type MutableRelationshipJournal = Record<string, {
    chapters: Set<number>;
    majorTurns: Set<'recognition' | 'friction' | 'support'>;
}>;

interface LearnerProjectionState {
    readonly activities: Record<string, ActivityProjection>;
    readonly reviewRatings: Record<string, ReviewRating>;
    readonly grammarKnowledge: Record<string, GrammarKnowledge>;
    readonly completedScenes: Set<string>;
    readonly encounteredCharacters: Record<string, { encounterIds: Set<string>; sceneIds: Set<string> }>;
    readonly completedEncounterIds: Set<string>;
    readonly bonds: Record<string, number>;
    readonly unlockedAssets: Set<string>;
    profile: LearnerProfileSnapshot | null;
    latestPlacement: LearnerEventOfKind<'placement-assessed'> | null;
    curriculumEntry: LearnerEventOfKind<'curriculum-entry-chosen'> | null;
    readonly scheduledReviews: Record<string, LearnerEventOfKind<'review-scheduled'>>;
    readonly vocabularyCollection: Record<string, LearnerEventOfKind<'vocabulary-collected'>>;
    readonly closedDays: Record<string, LearnerEventOfKind<'academy-day-closed'>>;
    readonly seenAchievementCeremonies: Set<string>;
    readonly relationshipJournal: MutableRelationshipJournal;
    readonly journalLines: Record<string, LearnerEventOfKind<'journal-line-recorded'>>;
    readonly supportUses: LearnerEventOfKind<'support-used'>[];
    readonly neutralizedReviewScheduleIds: ReadonlySet<string>;
    lastEventAt: number | null;
}

type LearnerProjectionReducers = {
    readonly [Kind in LearnerEvent['kind']]: (
        state: LearnerProjectionState,
        event: LearnerEventOfKind<Kind>,
    ) => void;
};

const LEARNER_PROJECTION_REDUCERS: LearnerProjectionReducers = {
    'attempt-recorded': projectAttempt,
    'review-rated': (state, event) => {
        state.reviewRatings[event.reviewItemId] = event.rating;
    },
    'grammar-known-changed': (state, event) => {
        state.grammarKnowledge[event.conceptId] = event.knowledge;
    },
    'scene-completed': (state, event) => {
        state.completedScenes.add(event.sceneId);
    },
    'characters-encountered': (state, event) => {
        state.completedEncounterIds.add(event.encounterId);
        event.attendeeIds.forEach(characterId => {
            const character = state.encounteredCharacters[characterId] ??= {
                encounterIds: new Set(),
                sceneIds: new Set(),
            };
            character.encounterIds.add(event.encounterId);
            character.sceneIds.add(event.sceneId);
        });
    },
    'bond-changed': (state, event) => {
        state.bonds[event.characterId] = Math.max(0, (state.bonds[event.characterId] ?? 0) + event.delta);
    },
    'asset-unlocked': (state, event) => {
        state.unlockedAssets.add(event.assetId);
        const characterId = event.assetId.startsWith('character:')
            ? event.assetId.slice('character:'.length)
            : null;
        if (!characterId) return;
        const character = state.encounteredCharacters[characterId] ??= {
            encounterIds: new Set(),
            sceneIds: new Set(),
        };
        character.encounterIds.add(`legacy:${event.assetId}`);
    },
    'profile-changed': (state, event) => {
        state.profile = clone(event.profile);
    },
    'placement-assessed': (state, event) => {
        state.latestPlacement = clone(event);
    },
    'curriculum-entry-chosen': (state, event) => {
        state.curriculumEntry = clone(event);
    },
    'review-scheduled': (state, event) => {
        if (!state.neutralizedReviewScheduleIds.has(event.eventId)) {
            state.scheduledReviews[event.reviewItemId] = clone(event);
        }
    },
    'review-schedule-neutralized': () => undefined,
    'learning-evidence-recorded': () => undefined,
    'vocabulary-collected': (state, event) => {
        state.vocabularyCollection[event.collectionItemId] ??= clone(event);
    },
    'vocabulary-collection-undone': projectVocabularyUndo,
    'academy-day-closed': (state, event) => {
        state.closedDays[event.dayId] = clone(event);
    },
    'achievement-ceremony-seen': (state, event) => {
        state.seenAchievementCeremonies.add(`${event.achievementId}:${event.tier}`);
    },
    'relationship-chapter-unlocked': projectRelationshipChapter,
    'journal-line-recorded': (state, event) => {
        state.journalLines[event.journalLineId] ??= clone(event);
    },
    'support-used': (state, event) => {
        state.supportUses.push(clone(event));
    },
};

export function projectLearnerRecord(events: readonly LearnerEvent[]): LearnerProjection {
    const state = createLearnerProjectionState(events);
    events.map(validateEvent).forEach(event => applyLearnerProjectionEvent(state, event));
    return learnerProjectionFromState(events.length, state);
}

function createLearnerProjectionState(events: readonly LearnerEvent[]): LearnerProjectionState {
    return {
        activities: {},
        reviewRatings: {},
        grammarKnowledge: {},
        completedScenes: new Set(),
        encounteredCharacters: {},
        completedEncounterIds: new Set(),
        bonds: {},
        unlockedAssets: new Set(),
        profile: null,
        latestPlacement: null,
        curriculumEntry: null,
        scheduledReviews: {},
        vocabularyCollection: {},
        closedDays: {},
        seenAchievementCeremonies: new Set(),
        relationshipJournal: {},
        journalLines: {},
        supportUses: [],
        neutralizedReviewScheduleIds: reviewScheduleNeutralizations(events),
        lastEventAt: null,
    };
}

function applyLearnerProjectionEvent(state: LearnerProjectionState, event: LearnerEvent): void {
    state.lastEventAt = state.lastEventAt === null ? event.at : Math.max(state.lastEventAt, event.at);
    LEARNER_PROJECTION_REDUCERS[event.kind](state, event as never);
}

function projectAttempt(state: LearnerProjectionState, event: LearnerEventOfKind<'attempt-recorded'>): void {
    const previous = state.activities[event.activityId];
    state.activities[event.activityId] = {
        activityId: event.activityId,
        attemptCount: (previous?.attemptCount ?? 0) + 1,
        lapseCount: (previous?.lapseCount ?? 0) + Number(event.outcome === 'lapse'),
        lastOutcome: event.outcome,
        lastAttemptAt: event.at,
        ...sourceQuestionProjection(event.sourceQuestionId),
        conceptIds: unique(event.conceptIds),
    };
}

function sourceQuestionProjection(sourceQuestionId: string | undefined): { sourceQuestionId?: string } {
    return sourceQuestionId ? { sourceQuestionId } : {};
}

function projectVocabularyUndo(
    state: LearnerProjectionState,
    event: LearnerEventOfKind<'vocabulary-collection-undone'>,
): void {
    const collected = state.vocabularyCollection[event.collectionItemId];
    if (collected?.eventId === event.collectedEventId) delete state.vocabularyCollection[event.collectionItemId];
}

function projectRelationshipChapter(
    state: LearnerProjectionState,
    event: LearnerEventOfKind<'relationship-chapter-unlocked'>,
): void {
    const journal = state.relationshipJournal[event.characterId] ??= { chapters: new Set(), majorTurns: new Set() };
    journal.chapters.add(event.chapter);
    if (event.majorTurn) journal.majorTurns.add(event.majorTurn);
}

function learnerProjectionFromState(eventCount: number, state: LearnerProjectionState): LearnerProjection {
    return {
        eventCount,
        lastEventAt: state.lastEventAt,
        activities: state.activities,
        reviewRatings: state.reviewRatings,
        grammarKnowledge: state.grammarKnowledge,
        completedScenes: [...state.completedScenes].sort(),
        encounteredCharacters: Object.fromEntries(Object.entries(state.encounteredCharacters)
            .map(([characterId, encounter]) => [characterId, {
                encounterIds: [...encounter.encounterIds].sort(),
                sceneIds: [...encounter.sceneIds].sort(),
            }])),
        completedEncounterIds: [...state.completedEncounterIds].sort(),
        bonds: state.bonds,
        unlockedAssets: [...state.unlockedAssets].sort(),
        profile: state.profile,
        latestPlacement: state.latestPlacement,
        curriculumEntry: state.curriculumEntry,
        scheduledReviews: state.scheduledReviews,
        vocabularyCollection: state.vocabularyCollection,
        closedDays: state.closedDays,
        seenAchievementCeremonies: [...state.seenAchievementCeremonies].sort(),
        relationshipJournal: Object.fromEntries(Object.entries(state.relationshipJournal).map(([characterId, journal]) => [characterId, {
            chapters: [...journal.chapters].sort((left, right) => left - right),
            majorTurns: [...journal.majorTurns].sort(),
        }])),
        journalLines: state.journalLines,
        supportUses: state.supportUses,
    };
}

/**
 * Returns only schedules that still make an Academy grounding claim. A later
 * neutralization supersedes one historical schedule without deleting either
 * the schedule or any generic Study rating history.
 */
export function activeReviewSchedules(
    events: readonly LearnerEvent[],
): readonly Extract<LearnerEvent, { kind: 'review-scheduled' }>[] {
    const neutralized = reviewScheduleNeutralizations(events);
    return events.filter((event): event is Extract<LearnerEvent, { kind: 'review-scheduled' }> =>
        event.kind === 'review-scheduled' && !neutralized.has(event.eventId));
}

function reviewScheduleNeutralizations(events: readonly LearnerEvent[]): ReadonlySet<string> {
    return new Set(events.flatMap(event =>
        event.kind === 'review-schedule-neutralized' ? [event.scheduledEventId] : []));
}

function normalizeEvent(
    input: LearnerEventInput,
    now: () => number,
    createEventId: () => string,
): LearnerEvent {
    return validateEvent({
        ...input,
        schemaVersion: 1,
        eventId: input.eventId ?? createEventId(),
        at: input.at ?? now(),
    } as LearnerEvent);
}

function validateEvent(event: LearnerEvent): LearnerEvent {
    validateEventEnvelope(event);
    validateEventPayload(event);
    return clone(event);
}

function validateEventEnvelope(event: LearnerEvent): void {
    if (!event || event.schemaVersion !== 1) throw new TypeError('Learner event schemaVersion must be 1.');
    requireText(event.eventId, 'eventId');
    if (!Number.isSafeInteger(event.at) || event.at < 0) throw new TypeError('Event timestamp must be a non-negative integer.');
}

type LearnerEventValidators = {
    readonly [Kind in LearnerEvent['kind']]: (event: LearnerEventOfKind<Kind>) => void;
};

const LEARNER_EVENT_VALIDATORS: LearnerEventValidators = {
    'attempt-recorded': validateAttemptRecorded,
    'review-rated': validateReviewRated,
    'grammar-known-changed': validateGrammarKnownChanged,
    'scene-completed': event => {
        requireText(event.sceneId, 'sceneId');
    },
    'characters-encountered': event => {
        requireText(event.encounterId, 'encounterId');
        requireText(event.sceneId, 'sceneId');
        if (!event.attendeeIds.length) throw new TypeError('Character encounter needs attendees.');
        unique(event.attendeeIds.map(id => requireText(id, 'encounter.attendeeId')));
    },
    'bond-changed': validateBondChanged,
    'asset-unlocked': event => {
        requireText(event.assetId, 'assetId');
    },
    'profile-changed': validateProfileChanged,
    'placement-assessed': validatePlacementAssessed,
    'curriculum-entry-chosen': validateCurriculumEntryChosen,
    'review-scheduled': validateReviewScheduled,
    'review-schedule-neutralized': validateReviewScheduleNeutralized,
    'learning-evidence-recorded': validateLearningEvidence,
    'vocabulary-collected': validateVocabularyCollected,
    'vocabulary-collection-undone': validateVocabularyCollectionUndone,
    'academy-day-closed': validateAcademyDayClosed,
    'achievement-ceremony-seen': validateAchievementCeremonySeen,
    'relationship-chapter-unlocked': validateRelationshipChapterUnlocked,
    'journal-line-recorded': validateJournalLineRecorded,
    'support-used': validateSupportUsed,
};

function validateEventPayload(event: LearnerEvent): void {
    const validators = LEARNER_EVENT_VALIDATORS as unknown as Readonly<Record<string, (value: LearnerEvent) => void>>;
    const validator = Object.prototype.hasOwnProperty.call(validators, event.kind)
        ? validators[event.kind]
        : undefined;
    if (!validator) throw new TypeError('Unknown learner event kind.');
    validator(event);
}

function validateBondChanged(event: Extract<LearnerEvent, { kind: 'bond-changed' }>): void {
    requireText(event.characterId, 'characterId');
    if (!Number.isSafeInteger(event.delta)) throw new TypeError('Bond delta must be an integer.');
}

function validateReviewScheduleNeutralized(event: Extract<LearnerEvent, { kind: 'review-schedule-neutralized' }>): void {
    requireText(event.scheduledEventId, 'scheduledEventId');
    if (event.reason !== 'legacy-ungrounded-academy') {
        throw new TypeError('Invalid review schedule neutralization reason.');
    }
}

function validateVocabularyCollectionUndone(event: Extract<LearnerEvent, { kind: 'vocabulary-collection-undone' }>): void {
    requireText(event.collectionItemId, 'collectionItemId');
    requireText(event.collectedEventId, 'collectedEventId');
}

function validateAcademyDayClosed(event: Extract<LearnerEvent, { kind: 'academy-day-closed' }>): void {
    requireText(event.dayId, 'dayId');
    if (typeof event.mainLessonCompleted !== 'boolean') throw new TypeError('Day mainLessonCompleted must be boolean.');
    unique(event.optionalActivityIds.map(id => requireText(id, 'optionalActivityId')));
    if (!Number.isSafeInteger(event.elapsedMs) || event.elapsedMs < 0) throw new TypeError('Day elapsedMs must be a non-negative integer.');
}

function validateAchievementCeremonySeen(event: Extract<LearnerEvent, { kind: 'achievement-ceremony-seen' }>): void {
    requireText(event.achievementId, 'achievementId');
    if (!['bronze', 'silver', 'gold', 'platinum'].includes(event.tier)) throw new TypeError('Invalid achievement tier.');
}

function validateRelationshipChapterUnlocked(event: Extract<LearnerEvent, { kind: 'relationship-chapter-unlocked' }>): void {
    requireText(event.characterId, 'characterId');
    if (!Number.isSafeInteger(event.chapter) || event.chapter < 1 || event.chapter > 10) throw new TypeError('Relationship chapter must be from 1 to 10.');
    if (event.majorTurn && !['recognition', 'friction', 'support'].includes(event.majorTurn)) throw new TypeError('Invalid relationship major turn.');
}

function validateJournalLineRecorded(event: Extract<LearnerEvent, { kind: 'journal-line-recorded' }>): void {
    requireText(event.journalLineId, 'journalLineId');
    requireText(event.characterId, 'journalLine.characterId');
    requireText(event.text.ja, 'journalLine.text.ja');
    requireText(event.text.en, 'journalLine.text.en');
    requireText(event.activityId, 'journalLine.activityId');
    if (event.sourceQuestionId !== undefined) requireText(event.sourceQuestionId, 'journalLine.sourceQuestionId');
}

function validateSupportUsed(event: Extract<LearnerEvent, { kind: 'support-used' }>): void {
    requireText(event.activityId, 'activityId');
    if (!['hint', 'transcript', 'translation', 'definition', 'example-gloss', 'model-answer'].includes(event.supportKind)) throw new TypeError('Invalid support kind.');
    if (event.choiceId !== undefined) requireText(event.choiceId, 'choiceId');
}

function validateAttemptRecorded(event: Extract<LearnerEvent, { kind: 'attempt-recorded' }>): void {
    requireText(event.activityId, 'activityId');
    requireText(event.responseKind, 'responseKind');
    unique(event.conceptIds.map(id => requireText(id, 'conceptId')));
    if (event.outcome !== 'pass' && event.outcome !== 'lapse') throw new TypeError('Invalid attempt outcome.');
    if (event.score !== undefined && (!Number.isFinite(event.score) || event.score < 0 || event.score > 1)) {
        throw new TypeError('Attempt score must be between 0 and 1.');
    }
}

function validateReviewRated(event: Extract<LearnerEvent, { kind: 'review-rated' }>): void {
    requireText(event.reviewItemId, 'reviewItemId');
    if (!['again', 'hard', 'good', 'easy'].includes(event.rating)) throw new TypeError('Invalid review rating.');
}

function validateGrammarKnownChanged(event: Extract<LearnerEvent, { kind: 'grammar-known-changed' }>): void {
    requireText(event.conceptId, 'conceptId');
    if (!['unknown', 'learning', 'known', 'mastered'].includes(event.knowledge)) throw new TypeError('Invalid grammar knowledge.');
}

function validateProfileChanged(event: Extract<LearnerEvent, { kind: 'profile-changed' }>): void {
    requireText(event.profile.displayName, 'profile.displayName');
    requireText(event.profile.learningReason, 'profile.learningReason');
    requireText(event.profile.portraitId, 'profile.portraitId');
}

function validatePlacementAssessed(event: Extract<LearnerEvent, { kind: 'placement-assessed' }>): void {
    requireText(event.assessmentId, 'assessmentId');
    requireJlptBand(event.targetBand, 'targetBand');
    requireJlptBand(event.recommendedBand, 'recommendedBand');
    if (event.recommendedStart && event.recommendedStart !== 'lesson-zero') {
        requireJlptBand(event.recommendedStart, 'recommendedStart');
    }
    if (!event.itemIds.length) throw new TypeError('Placement assessment needs item ids.');
    unique(event.itemIds.map(id => requireText(id, 'placement.itemId')));
    for (const skill of ['language-knowledge', 'reading', 'listening', 'speaking-confidence', 'writing-confidence'] as const) {
        const score = event.scores[skill];
        if (!Number.isFinite(score) || score < 0 || score > 1) throw new TypeError(`Invalid placement score for ${skill}.`);
    }
    if (event.calibration !== 'vertical-slice' && event.calibration !== 'validated') throw new TypeError('Invalid placement calibration.');
}

function validateCurriculumEntryChosen(event: Extract<LearnerEvent, { kind: 'curriculum-entry-chosen' }>): void {
    if (!['lesson-zero', 'manual-band', 'placement-mock'].includes(event.route)) throw new TypeError('Invalid curriculum entry route.');
    if (event.route === 'lesson-zero' && event.band !== undefined) throw new TypeError('Lesson 0 entry cannot carry a JLPT band.');
    if (event.route !== 'lesson-zero' && !event.band) throw new TypeError('Band entry requires a JLPT band.');
    if (event.band) requireJlptBand(event.band, 'curriculumEntry.band');
}

function validateReviewScheduled(event: Extract<LearnerEvent, { kind: 'review-scheduled' }>): void {
    requireText(event.reviewItemId, 'reviewItemId');
    requireText(event.conceptId, 'conceptId');
    if (!Number.isSafeInteger(event.dueAt) || event.dueAt < 0) throw new TypeError('Review dueAt must be a non-negative integer.');
    Object.entries(event.provenance).forEach(([key, value]) => {
        requireText(key, 'provenance key');
        requireText(value, `provenance.${key}`);
    });
}

function validateLearningEvidence(event: Extract<LearnerEvent, { kind: 'learning-evidence-recorded' }>): void {
    requireText(event.activityId, 'activityId');
    requireText(event.modeId, 'modeId');
    validateLearningSkill(event.skill);
    validateLearningAction(event.action);
    validateLearningOutcome(event.outcome);
    validateLearningConcepts(event.conceptIds);
    validateLearningIndependence(event.independent);
    validateLearningDuration(event.durationMs);
    validateLearningKanji(event.kanji);
}

function validateLearningSkill(skill: LearningSkill): void {
    if (!['kana', 'kanji', 'vocabulary', 'grammar', 'reading', 'listening', 'speaking', 'writing', 'repair', 'transfer'].includes(skill)) {
        throw new TypeError('Invalid learning skill.');
    }
}

function validateLearningAction(action: LearningAction): void {
    if (!['recognise', 'recall', 'produce', 'listen', 'speak', 'write', 'repair', 'review', 'read', 'explore', 'source-complete', 'transfer'].includes(action)) {
        throw new TypeError('Invalid learning action.');
    }
}

function validateLearningOutcome(outcome: AttemptOutcome): void {
    if (outcome !== 'pass' && outcome !== 'lapse') throw new TypeError('Invalid learning outcome.');
}

function validateLearningConcepts(conceptIds: readonly string[]): void {
    if (!conceptIds.length) throw new TypeError('Learning evidence needs at least one conceptId.');
    unique(conceptIds.map(id => requireText(id, 'conceptId')));
}

function validateLearningIndependence(independent: boolean): void {
    if (typeof independent !== 'boolean') throw new TypeError('Learning independent must be boolean.');
}

function validateLearningDuration(durationMs: number | undefined): void {
    if (durationMs !== undefined && (!Number.isSafeInteger(durationMs) || durationMs < 0)) {
        throw new TypeError('Learning durationMs must be a non-negative integer.');
    }
}

function validateLearningKanji(kanji: string | undefined): void {
    if (kanji !== undefined && Array.from(kanji).length !== 1) {
        throw new TypeError('Learning kanji must be one character.');
    }
}

function validateVocabularyCollected(event: Extract<LearnerEvent, { kind: 'vocabulary-collected' }>): void {
    requireText(event.collectionItemId, 'collectionItemId');
    requireText(event.expression, 'expression');
    if (!event.meanings.length) throw new TypeError('Vocabulary collection needs at least one meaning.');
    unique(event.meanings.map(meaning => requireText(meaning, 'meaning')));
    if (event.reading !== undefined) requireText(event.reading, 'reading');
    if (event.provenance.origin !== 'academy') throw new TypeError('Vocabulary provenance origin must be academy.');
    requireText(event.provenance.encounterId, 'provenance.encounterId');
    requireText(event.provenance.activityId, 'provenance.activityId');
    if (event.provenance.sourceId !== undefined) requireText(event.provenance.sourceId, 'provenance.sourceId');
}

function defaultEventId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `academy-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function requireJlptBand(value: string, label: string): JlptBand {
    if (!['n5', 'n4', 'n3', 'n2', 'n1'].includes(value)) throw new TypeError(`${label} must be a JLPT band.`);
    return value as JlptBand;
}

function requireText(value: string, label: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be a non-empty string.`);
    return value;
}

function unique(values: readonly string[]): string[] {
    return [...new Set(values)].sort();
}

function clone<T>(value: T): T {
    return structuredClone(value);
}

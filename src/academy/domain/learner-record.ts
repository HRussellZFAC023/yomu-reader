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

export function projectLearnerRecord(events: readonly LearnerEvent[]): LearnerProjection {
    const activities: Record<string, ActivityProjection> = {};
    const reviewRatings: Record<string, ReviewRating> = {};
    const grammarKnowledge: Record<string, GrammarKnowledge> = {};
    const completedScenes = new Set<string>();
    const bonds: Record<string, number> = {};
    const unlockedAssets = new Set<string>();
    let profile: LearnerProfileSnapshot | null = null;
    let latestPlacement: Extract<LearnerEvent, { kind: 'placement-assessed' }> | null = null;
    let curriculumEntry: Extract<LearnerEvent, { kind: 'curriculum-entry-chosen' }> | null = null;
    const scheduledReviews: Record<string, Extract<LearnerEvent, { kind: 'review-scheduled' }>> = {};
    const vocabularyCollection: Record<string, Extract<LearnerEvent, { kind: 'vocabulary-collected' }>> = {};
    const closedDays: Record<string, Extract<LearnerEvent, { kind: 'academy-day-closed' }>> = {};
    const seenAchievementCeremonies = new Set<string>();
    const relationshipJournal: Record<string, { chapters: Set<number>; majorTurns: Set<'recognition' | 'friction' | 'support'> }> = {};
    const supportUses: Extract<LearnerEvent, { kind: 'support-used' }>[] = [];
    const neutralizedReviewScheduleIds = reviewScheduleNeutralizations(events);
    let lastEventAt: number | null = null;

    for (const event of events.map(validateEvent)) {
        lastEventAt = lastEventAt === null ? event.at : Math.max(lastEventAt, event.at);
        switch (event.kind) {
            case 'attempt-recorded': {
                const previous = activities[event.activityId];
                activities[event.activityId] = {
                    activityId: event.activityId,
                    attemptCount: (previous?.attemptCount ?? 0) + 1,
                    lapseCount: (previous?.lapseCount ?? 0) + (event.outcome === 'lapse' ? 1 : 0),
                    lastOutcome: event.outcome,
                    lastAttemptAt: event.at,
                    ...(event.sourceQuestionId ? { sourceQuestionId: event.sourceQuestionId } : {}),
                    conceptIds: unique(event.conceptIds),
                };
                break;
            }
            case 'review-rated':
                reviewRatings[event.reviewItemId] = event.rating;
                break;
            case 'grammar-known-changed':
                grammarKnowledge[event.conceptId] = event.knowledge;
                break;
            case 'scene-completed':
                completedScenes.add(event.sceneId);
                break;
            case 'bond-changed':
                bonds[event.characterId] = Math.max(0, (bonds[event.characterId] ?? 0) + event.delta);
                break;
            case 'asset-unlocked':
                unlockedAssets.add(event.assetId);
                break;
            case 'profile-changed':
                profile = clone(event.profile);
                break;
            case 'placement-assessed':
                latestPlacement = clone(event);
                break;
            case 'curriculum-entry-chosen':
                curriculumEntry = clone(event);
                break;
            case 'review-scheduled':
                if (!neutralizedReviewScheduleIds.has(event.eventId)) {
                    scheduledReviews[event.reviewItemId] = clone(event);
                }
                break;
            case 'review-schedule-neutralized':
                break;
            case 'learning-evidence-recorded':
                break;
            case 'vocabulary-collected':
                vocabularyCollection[event.collectionItemId] ??= clone(event);
                break;
            case 'vocabulary-collection-undone': {
                const collected = vocabularyCollection[event.collectionItemId];
                if (collected?.eventId === event.collectedEventId) delete vocabularyCollection[event.collectionItemId];
                break;
            }
            case 'academy-day-closed':
                closedDays[event.dayId] = clone(event);
                break;
            case 'achievement-ceremony-seen':
                seenAchievementCeremonies.add(`${event.achievementId}:${event.tier}`);
                break;
            case 'relationship-chapter-unlocked': {
                const journal = relationshipJournal[event.characterId] ??= { chapters: new Set(), majorTurns: new Set() };
                journal.chapters.add(event.chapter);
                if (event.majorTurn) journal.majorTurns.add(event.majorTurn);
                break;
            }
            case 'support-used':
                supportUses.push(clone(event));
                break;
        }
    }

    return {
        eventCount: events.length,
        lastEventAt,
        activities,
        reviewRatings,
        grammarKnowledge,
        completedScenes: [...completedScenes].sort(),
        bonds,
        unlockedAssets: [...unlockedAssets].sort(),
        profile,
        latestPlacement,
        curriculumEntry,
        scheduledReviews,
        vocabularyCollection,
        closedDays,
        seenAchievementCeremonies: [...seenAchievementCeremonies].sort(),
        relationshipJournal: Object.fromEntries(Object.entries(relationshipJournal).map(([characterId, journal]) => [characterId, {
            chapters: [...journal.chapters].sort((left, right) => left - right),
            majorTurns: [...journal.majorTurns].sort(),
        }])),
        supportUses,
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

function validateEventPayload(event: LearnerEvent): void {
    switch (event.kind) {
        case 'attempt-recorded':
            validateAttemptRecorded(event);
            break;
        case 'review-rated':
            validateReviewRated(event);
            break;
        case 'grammar-known-changed':
            validateGrammarKnownChanged(event);
            break;
        case 'scene-completed':
            requireText(event.sceneId, 'sceneId');
            break;
        case 'bond-changed':
            requireText(event.characterId, 'characterId');
            if (!Number.isSafeInteger(event.delta)) throw new TypeError('Bond delta must be an integer.');
            break;
        case 'asset-unlocked':
            requireText(event.assetId, 'assetId');
            break;
        case 'profile-changed':
            validateProfileChanged(event);
            break;
        case 'placement-assessed':
            validatePlacementAssessed(event);
            break;
        case 'curriculum-entry-chosen':
            validateCurriculumEntryChosen(event);
            break;
        case 'review-scheduled':
            validateReviewScheduled(event);
            break;
        case 'review-schedule-neutralized':
            requireText(event.scheduledEventId, 'scheduledEventId');
            if (event.reason !== 'legacy-ungrounded-academy') {
                throw new TypeError('Invalid review schedule neutralization reason.');
            }
            break;
        case 'learning-evidence-recorded':
            validateLearningEvidence(event);
            break;
        case 'vocabulary-collected':
            validateVocabularyCollected(event);
            break;
        case 'vocabulary-collection-undone':
            requireText(event.collectionItemId, 'collectionItemId');
            requireText(event.collectedEventId, 'collectedEventId');
            break;
        case 'academy-day-closed':
            requireText(event.dayId, 'dayId');
            if (typeof event.mainLessonCompleted !== 'boolean') throw new TypeError('Day mainLessonCompleted must be boolean.');
            unique(event.optionalActivityIds.map(id => requireText(id, 'optionalActivityId')));
            if (!Number.isSafeInteger(event.elapsedMs) || event.elapsedMs < 0) throw new TypeError('Day elapsedMs must be a non-negative integer.');
            break;
        case 'achievement-ceremony-seen':
            requireText(event.achievementId, 'achievementId');
            if (!['bronze', 'silver', 'gold', 'platinum'].includes(event.tier)) throw new TypeError('Invalid achievement tier.');
            break;
        case 'relationship-chapter-unlocked':
            requireText(event.characterId, 'characterId');
            if (!Number.isSafeInteger(event.chapter) || event.chapter < 1 || event.chapter > 10) throw new TypeError('Relationship chapter must be from 1 to 10.');
            if (event.majorTurn && !['recognition', 'friction', 'support'].includes(event.majorTurn)) throw new TypeError('Invalid relationship major turn.');
            break;
        case 'support-used':
            requireText(event.activityId, 'activityId');
            if (!['hint', 'transcript', 'translation', 'definition', 'example-gloss', 'model-answer'].includes(event.supportKind)) throw new TypeError('Invalid support kind.');
            if (event.choiceId !== undefined) requireText(event.choiceId, 'choiceId');
            break;
        default:
            throw new TypeError('Unknown learner event kind.');
    }
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
    if (!['kana', 'kanji', 'vocabulary', 'grammar', 'reading', 'listening', 'speaking', 'writing', 'repair', 'transfer'].includes(event.skill)) {
        throw new TypeError('Invalid learning skill.');
    }
    if (!['recognise', 'recall', 'produce', 'listen', 'speak', 'write', 'repair', 'review', 'read', 'explore', 'source-complete', 'transfer'].includes(event.action)) {
        throw new TypeError('Invalid learning action.');
    }
    if (event.outcome !== 'pass' && event.outcome !== 'lapse') throw new TypeError('Invalid learning outcome.');
    if (!event.conceptIds.length) throw new TypeError('Learning evidence needs at least one conceptId.');
    unique(event.conceptIds.map(id => requireText(id, 'conceptId')));
    if (typeof event.independent !== 'boolean') throw new TypeError('Learning independent must be boolean.');
    if (event.durationMs !== undefined && (!Number.isSafeInteger(event.durationMs) || event.durationMs < 0)) {
        throw new TypeError('Learning durationMs must be a non-negative integer.');
    }
    if (event.kanji !== undefined && Array.from(event.kanji).length !== 1) throw new TypeError('Learning kanji must be one character.');
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

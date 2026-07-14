import type { LearnerEvent, LearningAction, LearningSkill } from './learner-record';

export type AchievementTier = 'bronze' | 'silver' | 'gold' | 'platinum';
export type AchievementGroup = 'kana' | 'kanji' | 'vocabulary' | 'grammar' | 'reading' | 'listening' | 'speaking' | 'writing' | 'repair' | 'review' | 'source' | 'exploration' | 'character-bond' | 'transfer';
export type AchievementMeasure = 'count' | 'distinct-concepts' | 'distinct-sources' | 'distinct-days' | 'duration-minutes' | 'active-count' | 'optional-activities' | 'relationship-chapters' | 'relationship-turns';
export type AchievementEvidenceSource = 'learning' | 'review' | 'collection' | 'day' | 'scene' | 'relationship';

export interface AchievementCriterion {
    readonly source: AchievementEvidenceSource;
    readonly measure: AchievementMeasure;
    readonly skill?: LearningSkill;
    readonly action?: LearningAction;
    readonly outcome?: 'pass' | 'lapse';
    readonly independent?: boolean;
    readonly modeId?: string;
    readonly conceptPrefix?: string;
    readonly sceneIdPrefix?: string;
    readonly majorTurn?: 'recognition' | 'friction' | 'support';
    readonly rating?: 'again' | 'hard' | 'good' | 'easy';
}

export interface AchievementDefinition {
    readonly id: string;
    readonly group: AchievementGroup;
    readonly title: { readonly en: string; readonly ja: string };
    readonly description: { readonly en: string; readonly ja: string };
    readonly medalId: string;
    readonly criterion: AchievementCriterion;
    readonly thresholds: Readonly<Record<AchievementTier, number>>;
}

export interface AchievementRegistry {
    readonly schemaVersion: 1;
    readonly registryId: 'yomu-academy-achievements';
    readonly revision: number;
    readonly definitions: readonly AchievementDefinition[];
}

export interface AchievementTierProgress {
    readonly tier: AchievementTier;
    readonly threshold: number;
    readonly earned: boolean;
    readonly ceremonySeen: boolean;
}

export interface AchievementProgress {
    readonly id: string;
    readonly value: number;
    readonly tiers: readonly AchievementTierProgress[];
}

const TIERS: readonly AchievementTier[] = ['bronze', 'silver', 'gold', 'platinum'];
const GROUPS: readonly AchievementGroup[] = ['kana', 'kanji', 'vocabulary', 'grammar', 'reading', 'listening', 'speaking', 'writing', 'repair', 'review', 'source', 'exploration', 'character-bond', 'transfer'];
const SOURCES: readonly AchievementEvidenceSource[] = ['learning', 'review', 'collection', 'day', 'scene', 'relationship'];
const MEASURES: readonly AchievementMeasure[] = ['count', 'distinct-concepts', 'distinct-sources', 'distinct-days', 'duration-minutes', 'active-count', 'optional-activities', 'relationship-chapters', 'relationship-turns'];
const SKILLS: readonly LearningSkill[] = ['kana', 'kanji', 'vocabulary', 'grammar', 'reading', 'listening', 'speaking', 'writing', 'repair', 'transfer'];
const ACTIONS: readonly LearningAction[] = ['recognise', 'recall', 'produce', 'listen', 'speak', 'write', 'repair', 'review', 'read', 'explore', 'source-complete', 'transfer'];
const RATINGS = ['again', 'hard', 'good', 'easy'] as const;
const ALLOWED_MEASURES: Readonly<Record<AchievementEvidenceSource, readonly AchievementMeasure[]>> = {
    learning: ['count', 'distinct-concepts', 'distinct-sources', 'distinct-days', 'duration-minutes'],
    review: ['count', 'distinct-days'],
    collection: ['count', 'active-count'],
    day: ['count', 'distinct-days', 'optional-activities'],
    scene: ['count', 'distinct-days'],
    relationship: ['relationship-chapters', 'relationship-turns'],
};

export function validateAchievementRegistry(input: unknown): AchievementRegistry {
    const registry = record(input, 'registry');
    if (registry.schemaVersion !== 1 || registry.registryId !== 'yomu-academy-achievements') throw new TypeError('Invalid achievement registry envelope.');
    if (!Number.isSafeInteger(registry.revision) || Number(registry.revision) < 1) throw new TypeError('Achievement revision must be positive.');
    if (!Array.isArray(registry.definitions) || registry.definitions.length !== 100) throw new TypeError('Achievement registry must contain exactly 100 definitions.');
    const definitions = registry.definitions.map((definition, index) => validateDefinition(definition, index));
    if (new Set(definitions.map(definition => definition.id)).size !== 100) throw new TypeError('Achievement ids must be unique.');
    GROUPS.forEach(group => {
        if (!definitions.some(definition => definition.group === group)) throw new TypeError(`Achievement group ${group} is empty.`);
    });
    return structuredClone({ ...registry, definitions }) as unknown as AchievementRegistry;
}

export function projectAchievements(
    registry: AchievementRegistry,
    events: readonly LearnerEvent[],
): readonly AchievementProgress[] {
    return registry.definitions.map(definition => {
        const value = achievementValue(definition.criterion, events);
        return {
            id: definition.id,
            value,
            tiers: projectAchievementTiers(definition, value, new Set(events.flatMap(event =>
                event.kind === 'achievement-ceremony-seen' ? [`${event.achievementId}:${event.tier}`] : []))),
        };
    });
}

export function projectAchievementTiers(
    definition: AchievementDefinition,
    value: number,
    seenCeremonies: ReadonlySet<string> = new Set(),
): readonly AchievementTierProgress[] {
    return TIERS.map(tier => ({
        tier,
        threshold: definition.thresholds[tier],
        earned: value >= definition.thresholds[tier],
        ceremonySeen: seenCeremonies.has(`${definition.id}:${tier}`),
    }));
}

type AchievementValueProjector = (
    events: readonly LearnerEvent[],
    criterion: AchievementCriterion,
) => number;

const ACHIEVEMENT_VALUE_PROJECTORS: Readonly<Record<AchievementEvidenceSource, AchievementValueProjector>> = {
    learning: learningAchievementValue,
    review: reviewAchievementValue,
    collection: (events, criterion) => collectionValue(events, criterion.measure),
    day: dayAchievementValue,
    scene: sceneAchievementValue,
    relationship: relationshipAchievementValue,
};

function achievementValue(criterion: AchievementCriterion, events: readonly LearnerEvent[]): number {
    const projectors = ACHIEVEMENT_VALUE_PROJECTORS as Readonly<Record<string, AchievementValueProjector>>;
    const projector = projectors[criterion.source];
    return projector ? projector(events, criterion) : 0;
}

function learningAchievementValue(events: readonly LearnerEvent[], criterion: AchievementCriterion): number {
    const relevant = events.filter(isLearningEvidence).filter(event => learningEvidenceMatches(event, criterion));
    return measured(relevant, criterion.measure);
}

function isLearningEvidence(event: LearnerEvent): event is Extract<LearnerEvent, { kind: 'learning-evidence-recorded' }> {
    return event.kind === 'learning-evidence-recorded';
}

function learningEvidenceMatches(
    event: Extract<LearnerEvent, { kind: 'learning-evidence-recorded' }>,
    criterion: AchievementCriterion,
): boolean {
    return matchesOptional(criterion.skill, event.skill)
        && matchesOptional(criterion.action, event.action)
        && matchesOptional(criterion.outcome, event.outcome)
        && matchesOptional(criterion.independent, event.independent)
        && matchesOptional(criterion.modeId, event.modeId)
        && matchesConceptPrefix(criterion.conceptPrefix, event.conceptIds);
}

function matchesOptional<Value>(expected: Value | undefined, actual: Value): boolean {
    return expected === undefined || actual === expected;
}

function matchesConceptPrefix(prefix: string | undefined, conceptIds: readonly string[]): boolean {
    if (!prefix) return true;
    return conceptIds.some(id => id.startsWith(prefix));
}

function reviewAchievementValue(events: readonly LearnerEvent[], criterion: AchievementCriterion): number {
    const reviews = events.filter((event): event is Extract<LearnerEvent, { kind: 'review-rated' }> =>
        event.kind === 'review-rated');
    return measured(reviews.filter(event => matchesOptional(criterion.rating, event.rating)), criterion.measure);
}

function dayAchievementValue(events: readonly LearnerEvent[], criterion: AchievementCriterion): number {
    const days = events.filter((event): event is Extract<LearnerEvent, { kind: 'academy-day-closed' }> =>
        event.kind === 'academy-day-closed');
    if (criterion.measure === 'optional-activities') {
        return days.reduce((sum, day) => sum + day.optionalActivityIds.length, 0);
    }
    if (criterion.measure === 'count') return new Set(days.map(day => day.dayId)).size;
    return measured(days, criterion.measure);
}

function sceneAchievementValue(events: readonly LearnerEvent[], criterion: AchievementCriterion): number {
    const scenes = events.filter((event): event is Extract<LearnerEvent, { kind: 'scene-completed' }> =>
        event.kind === 'scene-completed')
        .filter(event => matchesScenePrefix(criterion.sceneIdPrefix, event.sceneId));
    if (criterion.measure === 'count') return new Set(scenes.map(scene => scene.sceneId)).size;
    return measured(scenes, criterion.measure);
}

function matchesScenePrefix(prefix: string | undefined, sceneId: string): boolean {
    return !prefix || sceneId.startsWith(prefix);
}

function relationshipAchievementValue(events: readonly LearnerEvent[], criterion: AchievementCriterion): number {
    const chapters = events.filter((event): event is Extract<LearnerEvent, { kind: 'relationship-chapter-unlocked' }> =>
        event.kind === 'relationship-chapter-unlocked')
        .filter(event => matchesOptional(criterion.majorTurn, event.majorTurn));
    return relationshipMeasureValue(chapters, criterion.measure);
}

function relationshipMeasureValue(
    chapters: readonly Extract<LearnerEvent, { kind: 'relationship-chapter-unlocked' }>[],
    measure: AchievementMeasure,
): number {
    if (measure === 'relationship-chapters') {
        return new Set(chapters.map(event => `${event.characterId}:${event.chapter}`)).size;
    }
    if (measure === 'relationship-turns') {
        return new Set(chapters.flatMap(event => event.majorTurn
            ? [`${event.characterId}:${event.majorTurn}`]
            : [])).size;
    }
    return 0;
}

function measured(events: readonly LearnerEvent[], measure: AchievementMeasure): number {
    if (measure === 'count') return events.length;
    if (measure === 'distinct-days') return new Set(events.map(event => new Date(event.at).toISOString().slice(0, 10))).size;
    if (measure === 'duration-minutes') return Math.floor(events.reduce((sum, event) =>
        sum + (event.kind === 'learning-evidence-recorded' ? event.durationMs ?? 0 : 0), 0) / 60_000);
    if (measure === 'distinct-concepts') return new Set(events.flatMap(event =>
        event.kind === 'learning-evidence-recorded' ? event.conceptIds : [])).size;
    if (measure === 'distinct-sources') return new Set(events.flatMap(event =>
        event.kind === 'learning-evidence-recorded' && event.sourceId ? [event.sourceId] : [])).size;
    return 0;
}

function collectionValue(events: readonly LearnerEvent[], measure: AchievementMeasure): number {
    if (measure === 'count') return events.filter(event => event.kind === 'vocabulary-collected').length;
    if (measure !== 'active-count') return 0;
    const active = new Map<string, string>();
    events.forEach(event => {
        if (event.kind === 'vocabulary-collected') active.set(event.collectionItemId, event.eventId);
        if (event.kind === 'vocabulary-collection-undone' && active.get(event.collectionItemId) === event.collectedEventId) active.delete(event.collectionItemId);
    });
    return active.size;
}

function validateDefinition(value: unknown, index: number): AchievementDefinition {
    const definition = record(value, `definitions[${index}]`);
    const id = text(definition.id, `definitions[${index}].id`);
    if (!GROUPS.includes(definition.group as AchievementGroup)) throw new TypeError(`${id} has an invalid group.`);
    localized(definition.title, `${id}.title`);
    localized(definition.description, `${id}.description`);
    if (text(definition.medalId, `${id}.medalId`) !== `academy:${id}`) throw new TypeError(`${id} needs a stable semantic medal id.`);
    const criterion = record(definition.criterion, `${id}.criterion`);
    if (!SOURCES.includes(criterion.source as AchievementEvidenceSource) || !MEASURES.includes(criterion.measure as AchievementMeasure)) throw new TypeError(`${id} has an invalid criterion.`);
    validateCriterionCompatibility(id, criterion as unknown as AchievementCriterion);
    const thresholds = record(definition.thresholds, `${id}.thresholds`);
    let previous = 0;
    TIERS.forEach(tier => {
        const threshold = thresholds[tier];
        if (!Number.isSafeInteger(threshold) || Number(threshold) <= previous) throw new TypeError(`${id} tier thresholds must be positive and ascending.`);
        previous = Number(threshold);
    });
    return structuredClone(definition) as unknown as AchievementDefinition;
}

function validateCriterionCompatibility(id: string, criterion: AchievementCriterion): void {
    validateCriterionSourceFilters(id, criterion);
    validateCriterionFilterValues(id, criterion);
    validateCriterionMeasure(id, criterion);
}

function validateCriterionSourceFilters(id: string, criterion: AchievementCriterion): void {
    if (criterion.source !== 'learning' && hasLearningCriterionFilter(criterion)) {
        throw new TypeError(`${id} has learning filters on non-learning evidence.`);
    }
    validateSourceSpecificFilter(id, criterion.source, 'scene', criterion.sceneIdPrefix, 'scene filter on non-scene evidence');
    validateSourceSpecificFilter(id, criterion.source, 'relationship', criterion.majorTurn, 'relationship filter on unrelated evidence');
    validateSourceSpecificFilter(id, criterion.source, 'review', criterion.rating, 'review rating on non-review evidence');
}

function hasLearningCriterionFilter(criterion: AchievementCriterion): boolean {
    return [
        criterion.skill,
        criterion.action,
        criterion.outcome,
        criterion.independent,
        criterion.modeId,
        criterion.conceptPrefix,
    ].some(value => value !== undefined);
}

function validateSourceSpecificFilter(
    id: string,
    source: AchievementEvidenceSource,
    expectedSource: AchievementEvidenceSource,
    value: unknown,
    message: string,
): void {
    if (source !== expectedSource && value) throw new TypeError(`${id} has a ${message}.`);
}

function validateCriterionFilterValues(id: string, criterion: AchievementCriterion): void {
    validateOptionalEnum(criterion.skill, SKILLS, `${id} has an invalid learning skill.`);
    validateOptionalEnum(criterion.action, ACTIONS, `${id} has an invalid learning action.`);
    validateOptionalEnum(criterion.outcome, ['pass', 'lapse'], `${id} has an invalid outcome.`);
    validateOptionalBoolean(criterion.independent, `${id} has an invalid independent filter.`);
    validateOptionalText(criterion.modeId, `${id}.criterion.modeId`);
    validateOptionalText(criterion.conceptPrefix, `${id}.criterion.conceptPrefix`);
    validateOptionalText(criterion.sceneIdPrefix, `${id}.criterion.sceneIdPrefix`);
    validateOptionalEnum(criterion.rating, RATINGS, `${id} has an invalid rating.`);
    validateOptionalEnum(criterion.majorTurn, ['recognition', 'friction', 'support'], `${id} has an invalid relationship turn.`);
}

function validateOptionalEnum<Value>(
    value: Value | undefined,
    allowed: readonly Value[],
    message: string,
): void {
    if (value !== undefined && !allowed.includes(value)) throw new TypeError(message);
}

function validateOptionalBoolean(value: boolean | undefined, message: string): void {
    if (value !== undefined && typeof value !== 'boolean') throw new TypeError(message);
}

function validateOptionalText(value: string | undefined, label: string): void {
    if (value !== undefined) text(value, label);
}

function validateCriterionMeasure(id: string, criterion: AchievementCriterion): void {
    if (criterion.measure === 'optional-activities' && criterion.source !== 'day') throw new TypeError(`${id} optional activities must use day evidence.`);
    if (criterion.measure === 'active-count' && criterion.source !== 'collection') throw new TypeError(`${id} active-count must use collection evidence.`);
    if (!ALLOWED_MEASURES[criterion.source].includes(criterion.measure)) throw new TypeError(`${id} has an incompatible evidence measure.`);
}

function localized(value: unknown, label: string): void {
    const copy = record(value, label);
    text(copy.en, `${label}.en`);
    text(copy.ja, `${label}.ja`);
}

function record(value: unknown, label: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${label} must be an object.`);
    return value as Record<string, unknown>;
}

function text(value: unknown, label: string): string {
    if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} must be non-empty text.`);
    return value.trim();
}

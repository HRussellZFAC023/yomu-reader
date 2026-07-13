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

function achievementValue(criterion: AchievementCriterion, events: readonly LearnerEvent[]): number {
    if (criterion.source === 'learning') {
        const relevant = events.filter((event): event is Extract<LearnerEvent, { kind: 'learning-evidence-recorded' }> => {
            if (event.kind !== 'learning-evidence-recorded') return false;
            if (criterion.skill && event.skill !== criterion.skill) return false;
            if (criterion.action && event.action !== criterion.action) return false;
            if (criterion.outcome && event.outcome !== criterion.outcome) return false;
            if (criterion.independent !== undefined && event.independent !== criterion.independent) return false;
            if (criterion.modeId && event.modeId !== criterion.modeId) return false;
            if (criterion.conceptPrefix && !event.conceptIds.some(id => id.startsWith(criterion.conceptPrefix ?? ''))) return false;
            return true;
        });
        return measured(relevant, criterion.measure);
    }
    if (criterion.source === 'review') {
        const relevant = events.filter((event): event is Extract<LearnerEvent, { kind: 'review-rated' }> =>
            event.kind === 'review-rated' && (!criterion.rating || event.rating === criterion.rating));
        return measured(relevant, criterion.measure);
    }
    if (criterion.source === 'collection') return collectionValue(events, criterion.measure);
    if (criterion.source === 'day') {
        const days = events.filter((event): event is Extract<LearnerEvent, { kind: 'academy-day-closed' }> => event.kind === 'academy-day-closed');
        if (criterion.measure === 'optional-activities') return days.reduce((sum, day) => sum + day.optionalActivityIds.length, 0);
        if (criterion.measure === 'count') return new Set(days.map(day => day.dayId)).size;
        return measured(days, criterion.measure);
    }
    if (criterion.source === 'scene') {
        const scenes = events.filter((event): event is Extract<LearnerEvent, { kind: 'scene-completed' }> =>
            event.kind === 'scene-completed' && (!criterion.sceneIdPrefix || event.sceneId.startsWith(criterion.sceneIdPrefix)));
        if (criterion.measure === 'count') return new Set(scenes.map(scene => scene.sceneId)).size;
        return measured(scenes, criterion.measure);
    }
    if (criterion.source === 'relationship') {
        const chapters = events.filter((event): event is Extract<LearnerEvent, { kind: 'relationship-chapter-unlocked' }> =>
            event.kind === 'relationship-chapter-unlocked' && (!criterion.majorTurn || event.majorTurn === criterion.majorTurn));
        if (criterion.measure === 'relationship-chapters') return new Set(chapters.map(event => `${event.characterId}:${event.chapter}`)).size;
        if (criterion.measure === 'relationship-turns') return new Set(chapters.flatMap(event => event.majorTurn ? [`${event.characterId}:${event.majorTurn}`] : [])).size;
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
    if (criterion.source !== 'learning' && (criterion.skill || criterion.action || criterion.outcome || criterion.independent !== undefined || criterion.modeId || criterion.conceptPrefix)) {
        throw new TypeError(`${id} has learning filters on non-learning evidence.`);
    }
    if (criterion.source !== 'scene' && criterion.sceneIdPrefix) throw new TypeError(`${id} has a scene filter on non-scene evidence.`);
    if (criterion.source !== 'relationship' && criterion.majorTurn) throw new TypeError(`${id} has a relationship filter on unrelated evidence.`);
    if (criterion.source !== 'review' && criterion.rating) throw new TypeError(`${id} has a review rating on non-review evidence.`);
    if (criterion.skill && !SKILLS.includes(criterion.skill)) throw new TypeError(`${id} has an invalid learning skill.`);
    if (criterion.action && !ACTIONS.includes(criterion.action)) throw new TypeError(`${id} has an invalid learning action.`);
    if (criterion.outcome && criterion.outcome !== 'pass' && criterion.outcome !== 'lapse') throw new TypeError(`${id} has an invalid outcome.`);
    if (criterion.independent !== undefined && typeof criterion.independent !== 'boolean') throw new TypeError(`${id} has an invalid independent filter.`);
    if (criterion.modeId !== undefined) text(criterion.modeId, `${id}.criterion.modeId`);
    if (criterion.conceptPrefix !== undefined) text(criterion.conceptPrefix, `${id}.criterion.conceptPrefix`);
    if (criterion.sceneIdPrefix !== undefined) text(criterion.sceneIdPrefix, `${id}.criterion.sceneIdPrefix`);
    if (criterion.rating && !RATINGS.includes(criterion.rating)) throw new TypeError(`${id} has an invalid rating.`);
    if (criterion.majorTurn && !['recognition', 'friction', 'support'].includes(criterion.majorTurn)) throw new TypeError(`${id} has an invalid relationship turn.`);
    if (criterion.measure === 'optional-activities' && criterion.source !== 'day') throw new TypeError(`${id} optional activities must use day evidence.`);
    if (criterion.measure === 'active-count' && criterion.source !== 'collection') throw new TypeError(`${id} active-count must use collection evidence.`);
    const allowed: Readonly<Record<AchievementEvidenceSource, readonly AchievementMeasure[]>> = {
        learning: ['count', 'distinct-concepts', 'distinct-sources', 'distinct-days', 'duration-minutes'],
        review: ['count', 'distinct-days'],
        collection: ['count', 'active-count'],
        day: ['count', 'distinct-days', 'optional-activities'],
        scene: ['count', 'distinct-days'],
        relationship: ['relationship-chapters', 'relationship-turns'],
    };
    if (!allowed[criterion.source].includes(criterion.measure)) throw new TypeError(`${id} has an incompatible evidence measure.`);
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

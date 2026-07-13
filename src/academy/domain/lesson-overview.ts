import type { LocalizedText } from './source-library';
import type { GroundedLessonContract, GroundingStatus } from './grounded-lesson';

export interface LessonOverviewDefinition {
    readonly id: string;
    readonly levelBand: string;
    readonly estimatedMinutes: Readonly<{ minimum: number; maximum: number }>;
    readonly overview: Readonly<{
        title: LocalizedText;
        summary: LocalizedText;
        goals: readonly LocalizedText[];
        peopleIds: readonly string[];
        locationIds: readonly string[];
        materials: readonly Readonly<{
            id: string;
            kind: string;
            title: LocalizedText;
            state: 'ready' | 'release-blocked';
            activityIds: readonly string[];
            blockerId?: string;
        }>[];
    }>;
    readonly sections: readonly Readonly<{
        id: string;
        order: number;
        title: LocalizedText;
        outcomeIds: readonly string[];
        activityIds: readonly string[];
    }>[];
}

export interface LessonOverviewState {
    readonly boundActivityIds: ReadonlySet<string>;
    readonly attemptedActivityIds: ReadonlySet<string>;
    readonly completedActivityIds: ReadonlySet<string>;
    readonly needsReviewActivityIds: ReadonlySet<string>;
}

export type LessonSectionRuntimeStatus = 'not-bound' | 'partial' | 'bound';
export type LessonSectionLearningStatus = 'not-started' | 'in-progress' | 'needs-review' | 'complete';

export interface LessonOverviewSection {
    readonly id: string;
    readonly order: number;
    readonly title: LocalizedText;
    readonly outcomeIds: readonly string[];
    readonly activityIds: readonly string[];
    readonly boundActivityIds: readonly string[];
    readonly runtimeStatus: LessonSectionRuntimeStatus;
    readonly learningStatus: LessonSectionLearningStatus;
    readonly nextActivityId?: string;
}

export interface LessonOverviewModel {
    readonly lessonId: string;
    readonly levelBand: string;
    readonly estimatedMinutes: Readonly<{ minimum: number; maximum: number }>;
    readonly presentation: LessonOverviewDefinition['overview'];
    readonly releaseStatus: GroundingStatus;
    readonly blockerIds: readonly string[];
    readonly sections: readonly LessonOverviewSection[];
    readonly progress: Readonly<{ completedSections: number; totalSections: number }>;
    readonly currentSectionId?: string;
    readonly resumeActivityId?: string;
}

/**
 * Reconciles authored scope, runtime bindings, learner state and grounding.
 * The UI consumes one honest model instead of inferring readiness from art or routes.
 */
export function createLessonOverviewModel(
    definition: LessonOverviewDefinition,
    grounding: GroundedLessonContract,
    state: LessonOverviewState,
): LessonOverviewModel {
    validateDefinition(definition);
    if (grounding.lessonId !== definition.id) throw new TypeError('Lesson overview grounding belongs to another lesson.');
    const groundedActivityIds = new Set(grounding.activities.map(activity => activity.id));
    const authoredActivityIds = definition.sections.flatMap(section => section.activityIds);
    if (groundedActivityIds.size !== authoredActivityIds.length
        || authoredActivityIds.some(activityId => !groundedActivityIds.has(activityId))) {
        throw new TypeError('Lesson overview and grounding activity coverage do not match.');
    }
    rejectUnknownState(state, groundedActivityIds);

    const sections = definition.sections.map(section => sectionModel(section, state));
    const allRuntimeBound = sections.every(section => section.runtimeStatus === 'bound');
    const blockerIds = allRuntimeBound
        ? [...grounding.blockerIds]
        : [...new Set([...grounding.blockerIds, 'blocker:lesson-runtime-bindings'])].sort();
    const current = sections.find(section => section.learningStatus !== 'complete' && section.nextActivityId)
        ?? sections.find(section => section.learningStatus !== 'complete');
    return {
        lessonId: definition.id,
        levelBand: definition.levelBand,
        estimatedMinutes: { ...definition.estimatedMinutes },
        presentation: structuredClone(definition.overview),
        releaseStatus: blockerIds.length ? 'review-blocked' : 'playable',
        blockerIds,
        sections,
        progress: {
            completedSections: sections.filter(section => section.learningStatus === 'complete').length,
            totalSections: sections.length,
        },
        ...(current ? { currentSectionId: current.id } : {}),
        ...(current?.nextActivityId ? { resumeActivityId: current.nextActivityId } : {}),
    };
}

function sectionModel(
    section: LessonOverviewDefinition['sections'][number],
    state: LessonOverviewState,
): LessonOverviewSection {
    const boundActivityIds = section.activityIds.filter(activityId => state.boundActivityIds.has(activityId));
    const runtimeStatus: LessonSectionRuntimeStatus = boundActivityIds.length === 0
        ? 'not-bound'
        : boundActivityIds.length === section.activityIds.length ? 'bound' : 'partial';
    const completed = section.activityIds.filter(activityId => state.completedActivityIds.has(activityId));
    const review = section.activityIds.some(activityId => state.needsReviewActivityIds.has(activityId));
    const attempted = section.activityIds.some(activityId => state.attemptedActivityIds.has(activityId));
    const learningStatus: LessonSectionLearningStatus = completed.length === section.activityIds.length
        ? 'complete'
        : review ? 'needs-review' : attempted ? 'in-progress' : 'not-started';
    const nextActivityId = boundActivityIds.find(activityId => !state.completedActivityIds.has(activityId));
    return {
        id: section.id,
        order: section.order,
        title: { ...section.title },
        outcomeIds: [...section.outcomeIds],
        activityIds: [...section.activityIds],
        boundActivityIds,
        runtimeStatus,
        learningStatus,
        ...(nextActivityId ? { nextActivityId } : {}),
    };
}

function validateDefinition(definition: LessonOverviewDefinition): void {
    if (!definition.id.trim() || !definition.levelBand.trim()) throw new TypeError('Lesson overview needs an id and level.');
    if (!Number.isSafeInteger(definition.estimatedMinutes.minimum)
        || !Number.isSafeInteger(definition.estimatedMinutes.maximum)
        || definition.estimatedMinutes.minimum <= 0
        || definition.estimatedMinutes.maximum < definition.estimatedMinutes.minimum) {
        throw new TypeError('Lesson overview has invalid estimated minutes.');
    }
    if (!definition.sections.length) throw new TypeError('Lesson overview needs sections.');
    validatePresentation(definition.overview);
    const sectionIds = new Set<string>();
    const activityIds = new Set<string>();
    definition.sections.forEach((section, index) => {
        if (!section.id.trim() || sectionIds.has(section.id)) throw new TypeError('Lesson overview has invalid section ids.');
        sectionIds.add(section.id);
        if (section.order !== index + 1) throw new TypeError(`Lesson overview section ${section.id} has the wrong order.`);
        if (!section.title.en.trim() || !section.title.ja.trim() || !section.outcomeIds.length || !section.activityIds.length) {
            throw new TypeError(`Lesson overview section ${section.id} is incomplete.`);
        }
        for (const activityId of section.activityIds) {
            if (!activityId.trim() || activityIds.has(activityId)) throw new TypeError(`Duplicate lesson activity ${activityId}.`);
            activityIds.add(activityId);
        }
    });
    for (const material of definition.overview.materials) {
        for (const activityId of material.activityIds) {
            if (!activityIds.has(activityId)) {
                throw new TypeError(`Lesson overview material ${material.id} references unknown activity ${activityId}.`);
            }
        }
    }
}

function validatePresentation(overview: LessonOverviewDefinition['overview']): void {
    localized(overview.title, 'title');
    localized(overview.summary, 'summary');
    if (!overview.goals.length) throw new TypeError('Lesson overview needs learning goals.');
    overview.goals.forEach((goal, index) => localized(goal, `goal ${index + 1}`));
    uniqueNonEmpty(overview.peopleIds, 'people');
    uniqueNonEmpty(overview.locationIds, 'locations');
    if (!overview.materials.length) throw new TypeError('Lesson overview needs materials.');
    const materialIds = new Set<string>();
    for (const material of overview.materials) {
        if (!material.id.trim() || materialIds.has(material.id)) throw new TypeError('Lesson overview has invalid material ids.');
        materialIds.add(material.id);
        if (!material.kind.trim()) throw new TypeError(`Lesson overview material ${material.id} needs a kind.`);
        localized(material.title, `material ${material.id}`);
        if (!material.activityIds.length) throw new TypeError(`Lesson overview material ${material.id} needs activities.`);
        if (material.state === 'release-blocked' && !material.blockerId?.trim()) {
            throw new TypeError(`Blocked lesson overview material ${material.id} needs a blocker.`);
        }
        if (material.state === 'ready' && material.blockerId) {
            throw new TypeError(`Ready lesson overview material ${material.id} cannot retain a blocker.`);
        }
    }
}

function localized(value: LocalizedText, label: string): void {
    if (!value?.en?.trim() || !value.ja?.trim()) throw new TypeError(`Lesson overview ${label} needs English and Japanese.`);
}

function uniqueNonEmpty(values: readonly string[], label: string): void {
    if (!values.length || values.some(value => !value.trim()) || new Set(values).size !== values.length) {
        throw new TypeError(`Lesson overview needs unique ${label}.`);
    }
}

function rejectUnknownState(state: LessonOverviewState, activityIds: ReadonlySet<string>): void {
    for (const [label, values] of Object.entries(state)) {
        for (const activityId of values) {
            if (!activityIds.has(activityId)) throw new TypeError(`${label} contains unknown activity ${activityId}.`);
        }
    }
    for (const activityId of state.completedActivityIds) {
        if (!state.attemptedActivityIds.has(activityId)) throw new TypeError(`Completed activity ${activityId} has no attempt evidence.`);
    }
}

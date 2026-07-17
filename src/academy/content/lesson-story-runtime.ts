import { getAcademyCastMember, type AcademyCastMemberId } from '../domain/cast-registry';
import type { AcademyPlateId } from '../assets';
import type { ActivityProjection } from '../domain/learner-record';
import { worldPlace } from '../domain/world-locations';
import type { ClassWeekCastPlan } from './class-week-cast-plan';
import { LESSON_STORY_CATALOG, type LessonStoryCatalogEntry, type LessonStoryPackageId } from './lesson-story-catalog';

const EXPECTED_PACKAGE_IDS: readonly LessonStoryPackageId[] = Object.freeze([
    'lesson:foundation-00',
    'l1-l01', 'l1-l02', 'l1-l03', 'l1-l04', 'l1-l05',
    'l1-l06', 'l1-l07', 'l1-l08', 'l1-l09', 'l1-l10',
    'l1-l11', 'l1-l12', 'l1-l13', 'l1-l14', 'l1-l15',
    'l1-l16', 'l1-l17', 'l1-l18', 'l1-l19', 'l1-l20', 'l1-l21', 'l1-l22', 'l1-l23', 'l1-l24', 'l1-l25', 'l1-l26', 'l2-l02', 'l2-l03', 'l2-l04', 'l2-l05', 'l2-l06', 'l2-l07', 'l2-l08', 'l2-l09', 'l2-l10', 'l2-l11', 'l2-l12', 'l2-l13', 'l2-l14', 'l2-l15', 'l2-l16',
]);

const WORLD_CONTINUITY_PACKAGE_IDS = new Set<LessonStoryPackageId>([
    'l2-l02', 'l2-l03', 'l2-l04', 'l2-l05', 'l2-l06', 'l2-l07', 'l2-l08', 'l2-l09', 'l2-l10', 'l2-l11', 'l2-l12', 'l2-l13', 'l2-l14', 'l2-l15', 'l2-l16',
]);

/** Lesson-local plates prefer exact approved place art even where the broader world route still uses a fallback scene. */
const WORLD_LESSON_PLATES = Object.freeze({
    'l2-l02': 'station',
    'l2-l03': 'home',
    'l2-l04': 'classroom',
    'l2-l05': 'station',
    'l2-l06': 'library',
    'l2-l07': 'ramen',
    'l2-l08': 'park',
    'l2-l09': 'languageLab',
    'l2-l10': 'station',
    'l2-l11': 'station',
    'l2-l12': 'writingStudio',
    'l2-l13': 'cafe',
    'l2-l14': 'languageLab',
    'l2-l15': 'classroom',
    'l2-l16': 'classroom',
} as const satisfies Readonly<Partial<Record<LessonStoryPackageId, AcademyPlateId>>>);

function worldLessonPlate(packageId: LessonStoryPackageId): AcademyPlateId | undefined {
    return (WORLD_LESSON_PLATES as Readonly<Partial<Record<LessonStoryPackageId, AcademyPlateId>>>)[packageId];
}

const CALLBACK_SEQUENCES = Object.freeze({
    'callback:blank-atlas-route': ['seed', 'echo', 'echo', 'echo', 'transform', 'echo', 'payoff'],
    'callback:shared-plan': ['seed', 'echo', 'transform', 'payoff'],
    'callback:place-description': ['seed', 'echo', 'transform', 'payoff'],
    'callback:reasoned-invitation': ['seed', 'payoff'],
    'callback:l1plus-open-list': ['seed', 'echo', 'payoff'],
    'callback:l1plus-frequency-lens': ['seed', 'payoff'],
    'callback:l1plus-katakana-start': ['seed', 'payoff'],
    'callback:l1plus-katakana-two-row': ['seed', 'payoff'],
    'callback:l1plus-katakana-final-shelf': ['seed'],
    'callback:l2-experience-postcards': ['payoff'],
    'callback:l2-holiday-itinerary': ['seed'],
    'callback:l2-plain-style-matrix': ['seed', 'payoff'],
    'callback:l2-b24-listening-hinge': ['payoff'],
    'callback:l2-plain-form-transfer': ['seed', 'transform', 'payoff'],
    'callback:l2-toki-threshold': ['payoff'],
    'callback:l2-occasion-route': ['payoff'],
    'callback:l3-2-routine-reasons': ['seed', 'payoff'],
    'callback:l3-2-room-state': ['payoff'],
    'callback:l3-2-completion-regret': ['payoff'],
    'callback:l3-2-prepared-state': ['payoff'],
} as const);

export interface LessonStoryRuntime {
    readonly entries: readonly LessonStoryCatalogEntry[];
    continuity(packageId: string): LessonStoryCatalogEntry | undefined;
}

export interface LessonStoryEntryAdaptation {
    readonly mode: 'guided-prerequisite' | 'n-plus-one';
    readonly setup: Readonly<{ en: string; ja: string }>;
    readonly callback: Readonly<{ en: string; ja: string }>;
}

/** Adapt lesson framing from canonical activity evidence without writing or skipping plot state. */
export function adaptLessonStoryEntry(
    entry: LessonStoryCatalogEntry,
    activities: Readonly<Record<string, Pick<ActivityProjection, 'lastOutcome' | 'attemptCount' | 'lapseCount'>>>,
): LessonStoryEntryAdaptation {
    const prerequisite = entry.nPlusOne.prerequisite;
    const evidence = prerequisite ? activities[prerequisite.activityId] : undefined;
    const hasRecordedPass = evidence
        && (evidence.lastOutcome === 'pass'
            || evidence.attemptCount > evidence.lapseCount);
    const ready = !prerequisite || hasRecordedPass === true;
    return Object.freeze({
        mode: ready ? 'n-plus-one' : 'guided-prerequisite',
        setup: ready ? entry.setup : prerequisite.fallbackSetup,
        callback: ready ? entry.callback.meaningNow : entry.callback.fallback,
    });
}

export interface LessonStoryEncounter {
    readonly encounterId: string;
    readonly sceneId: string;
    readonly attendeeIds: readonly AcademyCastMemberId[];
}

export interface LessonStoryPresentation {
    readonly originPlaceId: NonNullable<LessonStoryCatalogEntry['world']>['originPlaceId'];
    readonly plate: AcademyPlateId;
    readonly location: Readonly<{ en: string; ja: string }>;
    readonly castPresentation: LessonStoryCatalogEntry['presentation'];
}

/** Resolve world-authored lesson framing through the approved place registry. */
export function lessonStoryPresentation(entry: LessonStoryCatalogEntry): LessonStoryPresentation | undefined {
    if (!entry.world) return undefined;
    const place = worldPlace(entry.world.originPlaceId);
    return Object.freeze({
        originPlaceId: entry.world.originPlaceId,
        plate: worldLessonPlate(entry.packageId) ?? place.scene,
        location: Object.freeze({ en: entry.location.en, ja: entry.location.ja }),
        castPresentation: entry.presentation,
    });
}

/** The encounter is the single write that unlocks met-character state and a Journal revisit. */
export function lessonStoryEncounter(entry: LessonStoryCatalogEntry): LessonStoryEncounter {
    return Object.freeze({
        encounterId: entry.journal?.encounterId ?? `class-week:${entry.classWeekId}`,
        sceneId: entry.journal?.sceneId ?? `scene:class-week:${entry.classWeekId}`,
        attendeeIds: Object.freeze([entry.hostId, ...entry.supportingIds]),
    });
}

/**
 * Compile the local lesson handoffs against the grounded class-week plan.
 * This layer is intentionally not part of finite canonical story or replay.
 */
export function createLessonStoryRuntime(plan: ClassWeekCastPlan): LessonStoryRuntime {
    validateCatalog(plan, LESSON_STORY_CATALOG);
    const entries = Object.freeze([...LESSON_STORY_CATALOG]);
    const byPackageId = new Map<string, LessonStoryCatalogEntry>(entries.map(entry => [entry.packageId, entry]));
    return Object.freeze({
        entries,
        continuity(packageId: string): LessonStoryCatalogEntry | undefined {
            return byPackageId.get(packageId);
        },
    });
}

function validateCatalog(plan: ClassWeekCastPlan, entries: readonly LessonStoryCatalogEntry[]): void {
    if (entries.length !== EXPECTED_PACKAGE_IDS.length
        || !entries.every((entry, index) => entry.packageId === EXPECTED_PACKAGE_IDS[index])) {
        throw new TypeError('The lesson story catalog must cover Lesson 0 through Lesson 41 in order.');
    }

    const packageIds = new Set(entries.map(entry => entry.packageId));
    const weekIds = new Set(entries.map(entry => entry.classWeekId));
    if (packageIds.size !== entries.length || weekIds.size !== entries.length) {
        throw new TypeError('Lesson story package and class-week bindings must be unique.');
    }

    for (const [index, entry] of entries.entries()) {
        validateEntryBoundary(entry);
        validateChronologicalPrerequisite(entries, index);
        if (entry.packageId === 'lesson:foundation-00') {
            validateOrientation(entry);
            continue;
        }
        validateClassWeekBinding(plan, entry);
        if (WORLD_CONTINUITY_PACKAGE_IDS.has(entry.packageId)) validateWorldContinuity(entry);
    }
    validateCallbacks(entries);
}

function validateChronologicalPrerequisite(
    entries: readonly LessonStoryCatalogEntry[],
    index: number,
): void {
    const entry = entries[index];
    const prerequisite = entry?.nPlusOne.prerequisite;
    if (!prerequisite) return;
    const previous = entries[index - 1];
    if (!previous
        || prerequisite.packageId !== previous.packageId
        || entry.nPlusOne.carries !== previous.nPlusOne.introduces) {
        throw new TypeError(`Lesson story ${entry.packageId} must consume its immediate chronological N+1 prerequisite.`);
    }
    if (!prerequisite.activityId || !prerequisite.fallbackSetup.en || !prerequisite.fallbackSetup.ja) {
        throw new TypeError(`Lesson story ${entry.packageId} needs complete adaptive prerequisite evidence.`);
    }
}

function validateWorldContinuity(entry: LessonStoryCatalogEntry): void {
    const cast = [entry.hostId, ...entry.supportingIds];
    const purposes = entry.dialogue?.map(turn => turn.purpose);
    if (!entry.world
        || entry.world.completionReturn !== 'originating-route-frame'
        || !entry.dialogue
        || !sameIds(purposes ?? [], ['need', 'model', 'transfer'])
        || entry.dialogue.some(turn => !cast.includes(turn.speakerId) || !turn.line.en || !turn.line.ja)
        || !cast.every(id => entry.dialogue?.some(turn => turn.speakerId === id))) {
        throw new TypeError(`Lesson story ${entry.packageId} needs a grounded world origin and need/model/transfer dialogue from its approved cast.`);
    }
    worldPlace(entry.world.originPlaceId);
    if (!entry.journal
        || entry.journal.encounterId !== `class-week:${entry.packageId}`
        || entry.journal.sceneId !== `scene:class-week:${entry.classWeekId}`
        || entry.journal.replayLessonId !== entry.packageId
        || entry.journal.stateWrite !== 'met-characters-and-journal') {
        throw new TypeError(`Lesson story ${entry.packageId} needs package-addressable met-character and Journal evidence.`);
    }
}

function validateEntryBoundary(entry: LessonStoryCatalogEntry): void {
    if (entry.presentation !== 'name-only'
        || entry.plotBoundary.canonicalWrites
        || entry.plotBoundary.replay !== 'separate-optional') {
        throw new TypeError(`Lesson story ${entry.packageId} crosses its canon, replay, or likeness boundary.`);
    }
    if (!entry.location.id || !entry.setup.en || !entry.setup.ja || !entry.handoff.en || !entry.handoff.ja
        || !entry.nPlusOne.carries || !entry.nPlusOne.introduces) {
        throw new TypeError(`Lesson story ${entry.packageId} needs a grounded location, handoff, and N+1 step.`);
    }
    [entry.hostId, ...entry.supportingIds].forEach(validateNameOnlyCast);
}

function validateOrientation(entry: LessonStoryCatalogEntry): void {
    const expectedHosts: readonly AcademyCastMemberId[] = ['xingyu', 'mika', 'sophie', 'ruparna', 'aakash', 'sam'];
    if (entry.classWeekId !== 'orientation' || !sameIds([entry.hostId, ...entry.supportingIds], expectedHosts)) {
        throw new TypeError('Lesson 0 must retain its approved sound, text, and speaking hosts.');
    }
}

function validateClassWeekBinding(plan: ClassWeekCastPlan, entry: LessonStoryCatalogEntry): void {
    const week = plan.weeks.find(candidate => candidate.weekId === entry.classWeekId);
    if (!week || week.status !== 'source-backed' || !week.primary) {
        throw new TypeError(`Lesson story ${entry.packageId} has no grounded class-week roster.`);
    }
    if (week.primary.id !== entry.hostId) {
        throw new TypeError(`Lesson story ${entry.packageId} host does not match ${entry.classWeekId}.`);
    }
    const expectedSupporting = week.supporting.map(member => member.id);
    if (!sameIds(expectedSupporting, entry.supportingIds)) {
        throw new TypeError(`Lesson story ${entry.packageId} support cast does not match ${entry.classWeekId}.`);
    }
}

function validateCallbacks(entries: readonly LessonStoryCatalogEntry[]): void {
    const uses = new Map<string, LessonStoryCatalogEntry[]>();
    for (const entry of entries) {
        if (!entry.callback) continue;
        const callbackEntries = uses.get(entry.callback.id) ?? [];
        callbackEntries.push(entry);
        uses.set(entry.callback.id, callbackEntries);
    }
    for (const [id, expectedStates] of Object.entries(CALLBACK_SEQUENCES)) {
        const callbackEntries = uses.get(id) ?? [];
        const states = callbackEntries.map(entry => entry.callback?.state);
        if (!sameIds(states, expectedStates)) {
            throw new TypeError(`Lesson callback ${id} must resolve as ${expectedStates.join(', ')}.`);
        }
        if (!callbackEntries.at(-1)?.plotBoundary.completesThread) {
            throw new TypeError(`Lesson callback ${id} must resolve at its final handoff.`);
        }
    }
    if (uses.size !== Object.keys(CALLBACK_SEQUENCES).length) {
        throw new TypeError('Lesson story catalog contains an unregistered callback.');
    }
}

function validateNameOnlyCast(id: AcademyCastMemberId): void {
    const member = getAcademyCastMember(id);
    if (!member.eligibility.lessons || !member.eligibility.story) {
        throw new TypeError(`Lesson story cast member ${id} violates the name-only lesson boundary.`);
    }
}

function sameIds(left: readonly unknown[], right: readonly unknown[]): boolean {
    return left.length === right.length && left.every((id, index) => id === right[index]);
}

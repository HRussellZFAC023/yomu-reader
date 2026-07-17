import type { GroundingStatus } from '../domain/grounded-lesson';
import {
    validateClassWeekCastPlan,
    type CanonicalClassWeekId,
} from './class-week-cast-plan';
import {
    ACADEMY_LESSON_CONTENT_REGISTRY,
    loadAuthoredWeekPackage,
} from './lesson-content-registry';
import { createGroundedLessonResolver } from './grounded-lesson-resolver';

export type ClassWeekDeliveryEntry = Readonly<{
    order: number;
    weekId: CanonicalClassWeekId;
    state: 'planning-only' | 'review-blocked';
    lessonId: null;
}> | Readonly<{
    order: number;
    weekId: CanonicalClassWeekId;
    state: 'grounded-playable';
    lessonId: string;
}>;

export interface ClassWeekDeliveryCatalog {
    readonly weeks: readonly ClassWeekDeliveryEntry[];
    readonly playableCount: number;
    get(weekId: CanonicalClassWeekId): ClassWeekDeliveryEntry;
}

interface AuditedLessonDelivery {
    readonly lessonId: string;
    readonly status: GroundingStatus;
}

/**
 * Resolve the canonical 73-Week chronology through the complete-lesson
 * grounding audits. Cast planning and support shards can never promote a Week.
 */
export async function loadClassWeekDeliveryCatalog(
    planValue: unknown,
    fetcher: typeof fetch = fetch,
): Promise<ClassWeekDeliveryCatalog> {
    const plan = validateClassWeekCastPlan(planValue);
    const canonicalWeekIds = new Set<CanonicalClassWeekId>(plan.weeks.map(week => week.weekId));
    const auditedByWeek = new Map<CanonicalClassWeekId, AuditedLessonDelivery>();
    const resolver = createGroundedLessonResolver(fetcher);

    for (const registration of ACADEMY_LESSON_CONTENT_REGISTRY) {
        if (registration.kind === 'authored-week') {
            if (!canonicalWeekIds.has(registration.classWeekId as CanonicalClassWeekId)) {
                throw new TypeError(`Authored package ${registration.packageId} names a non-canonical class Week ${registration.classWeekId}.`);
            }
            await loadAuthoredWeekPackage(registration.packageId, fetcher);
            auditedByWeek.set(registration.classWeekId as CanonicalClassWeekId, {
                lessonId: `authored-week:${registration.packageId}`,
                status: 'playable',
            });
            continue;
        }
        if (registration.kind !== 'lesson' || !registration.classWeekId) continue;
        if (!canonicalWeekIds.has(registration.classWeekId as CanonicalClassWeekId)) {
            throw new TypeError(`Complete lesson ${registration.lessonId} names a non-canonical class Week.`);
        }
        const weekId = registration.classWeekId as CanonicalClassWeekId;
        if (auditedByWeek.has(weekId)) {
            throw new TypeError(`Class Week ${weekId} has more than one complete lesson registration.`);
        }
        const audit = await resolver.resolve(registration.lessonId);
        if (audit.lessonId !== registration.lessonId) {
            throw new TypeError(`Complete lesson registration ${registration.lessonId} resolved to another lesson.`);
        }
        auditedByWeek.set(weekId, { lessonId: audit.lessonId, status: audit.status });
    }

    const weeks = Object.freeze(plan.weeks.map(week => {
        const audit = auditedByWeek.get(week.weekId);
        if (!audit) return blockedEntry(week.order, week.weekId, 'planning-only');
        if (audit.status === 'review-blocked') {
            return blockedEntry(week.order, week.weekId, 'review-blocked');
        }
        return Object.freeze({
            order: week.order,
            weekId: week.weekId,
            state: 'grounded-playable' as const,
            lessonId: audit.lessonId,
        });
    }));
    const byId = new Map(weeks.map(week => [week.weekId, week]));
    const playableCount = weeks.filter(week => week.state === 'grounded-playable').length;

    return Object.freeze({
        weeks,
        playableCount,
        get(weekId: CanonicalClassWeekId): ClassWeekDeliveryEntry {
            const week = byId.get(weekId);
            if (!week) throw new TypeError(`Unknown canonical class Week: ${weekId}`);
            return week;
        },
    });
}

function blockedEntry(
    order: number,
    weekId: CanonicalClassWeekId,
    state: 'planning-only' | 'review-blocked',
): ClassWeekDeliveryEntry {
    return Object.freeze({ order, weekId, state, lessonId: null });
}

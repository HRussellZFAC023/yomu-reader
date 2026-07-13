import {
    ACADEMY_CAST,
    getAcademyCastMember,
} from '../domain/cast-registry';
import {
    ACADEMY_CAST_SPECIALTIES,
} from '../domain/authored-cast';
import {
    CANONICAL_CLASS_WEEK_IDS,
    CANONICAL_CLASS_WEEK_INDEX_SHA256,
    type ClassWeekCastAppearance,
    type ClassWeekCastPlan,
    type ClassWeekCastPlanEntry,
} from './class-week-cast-plan-schema';

export * from './class-week-cast-plan-schema';

const CLASSMATE_IDS = ACADEMY_CAST
    .filter(member => member.category === 'classmate')
    .map(member => member.id);

const CLASSMATE_SPECIALTIES = new Set<string>(
    CLASSMATE_IDS.flatMap(id => [
        ...(ACADEMY_CAST_SPECIALTIES[id as keyof typeof ACADEMY_CAST_SPECIALTIES] ?? []),
    ]),
);

const EXPECTED_POLICY = Object.freeze({
    maximumPrimaryShare: 0.18,
    maximumAppearanceShare: 0.16,
    maximumTopTwoAppearanceShare: 0.25,
    maximumConsecutivePrimaryWeeks: 2,
});

export function validateClassWeekCastPlan(value: unknown): ClassWeekCastPlan {
    const plan = record(value, 'class-week cast plan') as unknown as ClassWeekCastPlan;
    exactKeys(plan, [
        'schema', 'contentVersion', 'scope', 'runtimeStatus', 'authorshipStatus',
        'sourceIndex', 'concentrationPolicy', 'weeks',
    ], 'class-week cast plan');
    if (plan.schema !== 'yomu-academy.class-week-cast-plan.v1') fail('Class-week cast plan has the wrong schema.');
    if (plan.contentVersion !== '1.0.0') fail('Class-week cast plan has the wrong content version.');
    if (plan.scope !== 'appearance-planning' || plan.runtimeStatus !== 'not-bound' || plan.authorshipStatus !== 'planning-only') {
        fail('Class-week cast plan must not claim runtime, authored, or playable status.');
    }
    validateSourceIndex(plan.sourceIndex);
    validateConcentrationPolicy(plan.concentrationPolicy);

    const weeks = array(plan.weeks, 'class-week cast plan weeks') as readonly ClassWeekCastPlanEntry[];
    if (weeks.length !== CANONICAL_CLASS_WEEK_IDS.length) fail('Class-week cast plan must cover all 73 canonical weeks.');
    const primaryCounts = new Map<string, number>();
    const appearanceCounts = new Map<string, number>();
    let assignedWeekCount = 0;
    let previousPrimary: string | null = null;
    let consecutivePrimary = 0;

    for (const [order, week] of weeks.entries()) {
        validateWeekIdentity(week, order);
        if (week.status === 'review-required') {
            validateReviewRequiredWeek(week);
            previousPrimary = null;
            consecutivePrimary = 0;
            continue;
        }
        if (week.status !== 'source-backed') fail(`Week ${week.weekId} has an unknown appearance status.`);
        assignedWeekCount += 1;
        validateAssignedWeek(week);
        const appearances = [week.primary!, ...week.supporting];
        primaryCounts.set(week.primary!.id, (primaryCounts.get(week.primary!.id) ?? 0) + 1);
        for (const appearance of appearances) {
            appearanceCounts.set(appearance.id, (appearanceCounts.get(appearance.id) ?? 0) + 1);
        }
        if (previousPrimary === week.primary!.id) consecutivePrimary += 1;
        else consecutivePrimary = 1;
        previousPrimary = week.primary!.id;
        if (consecutivePrimary > EXPECTED_POLICY.maximumConsecutivePrimaryWeeks) {
            fail(`${week.primary!.firstName} is primary for too many consecutive source-backed weeks.`);
        }
    }

    validateClassmateReach(primaryCounts, appearanceCounts);
    validateConcentration(primaryCounts, appearanceCounts, assignedWeekCount);
    return structuredClone(plan);
}

function validateConcentrationPolicy(policy: ClassWeekCastPlan['concentrationPolicy']): void {
    const candidate = record(policy, 'concentration policy') as unknown as ClassWeekCastPlan['concentrationPolicy'];
    exactKeys(candidate, Object.keys(EXPECTED_POLICY), 'concentration policy');
    for (const [key, expected] of Object.entries(EXPECTED_POLICY)) {
        if (candidate[key as keyof typeof candidate] !== expected) {
            fail('Class-week cast concentration policy may not be loosened in content.');
        }
    }
}

function validateSourceIndex(source: ClassWeekCastPlan['sourceIndex']): void {
    const index = record(source, 'source index') as unknown as ClassWeekCastPlan['sourceIndex'];
    exactKeys(index, ['donor', 'file', 'weekCount', 'sha256'], 'source index');
    if (index.donor !== 'academy-rebuild-20260711'
        || index.file !== 'public/academy/content/weeks/index.json'
        || index.weekCount !== 73) {
        fail('Class-week cast plan is not pinned to the reviewed 73-week donor index.');
    }
    digest(index.sha256, 'source index sha256');
    if (index.sha256 !== CANONICAL_CLASS_WEEK_INDEX_SHA256) {
        fail('Class-week cast plan source index hash does not match the reviewed donor index.');
    }
}

function validateWeekIdentity(week: ClassWeekCastPlanEntry, order: number): void {
    const allowedKeys = week.status === 'review-required'
        ? ['order', 'weekId', 'weekKind', 'source', 'status', 'learningSpecialties', 'primary', 'supporting', 'reviewReason']
        : ['order', 'weekId', 'weekKind', 'source', 'status', 'learningSpecialties', 'primary', 'supporting'];
    exactKeys(week, allowedKeys, `week ${order}`);
    if (week.order !== order || week.weekId !== CANONICAL_CLASS_WEEK_IDS[order]) {
        fail(`Class-week cast plan order ${order} does not match the canonical week index.`);
    }
    text(week.weekKind, `week ${week.weekId} kind`);
    const source = record(week.source, `week ${week.weekId} source`) as unknown as ClassWeekCastPlanEntry['source'];
    exactKeys(source, ['donor', 'file', 'title', 'topicEvidence', 'sha256'], `week ${week.weekId} source`);
    if (source.donor !== 'academy-rebuild-20260711') fail(`Week ${week.weekId} uses an unknown donor.`);
    const expectedFile = `public/academy/content/weeks/${String(order).padStart(3, '0')}-${week.weekId}.json`;
    if (source.file !== expectedFile) fail(`Week ${week.weekId} has the wrong donor source file.`);
    const title = record(source.title, `week ${week.weekId} source title`);
    exactKeys(title, ['en', 'ja'], `week ${week.weekId} source title`);
    text(title.en, `week ${week.weekId} English source title`);
    text(title.ja, `week ${week.weekId} Japanese source title`);
    digest(source.sha256, `week ${week.weekId} source sha256`);
    for (const evidence of array(source.topicEvidence, `week ${week.weekId} topic evidence`)) {
        text(evidence, `week ${week.weekId} topic evidence`);
    }
}

function validateReviewRequiredWeek(week: ClassWeekCastPlanEntry): void {
    if (week.primary !== null || week.supporting.length !== 0 || week.learningSpecialties.length !== 0) {
        fail(`Review-required week ${week.weekId} guesses a cast assignment.`);
    }
    if (week.reviewReason !== 'course-outline-only' && week.reviewReason !== 'no-source-topic-metadata') {
        fail(`Review-required week ${week.weekId} lacks a precise review reason.`);
    }
    if (week.reviewReason === 'course-outline-only' && week.source.topicEvidence.length === 0) {
        fail(`Review-required week ${week.weekId} lost its course-outline evidence.`);
    }
}

function validateAssignedWeek(week: ClassWeekCastPlanEntry): void {
    if (week.reviewReason !== undefined) fail(`Source-backed week ${week.weekId} carries a review-only reason.`);
    if (!week.source.topicEvidence.length) fail(`Source-backed week ${week.weekId} has no source topic evidence.`);
    if (!week.learningSpecialties.length) fail(`Source-backed week ${week.weekId} has no documented learning specialty.`);
    if (!week.primary || week.supporting.length !== 1) {
        fail(`Source-backed week ${week.weekId} needs one primary and one supporting classmate.`);
    }
    const appearances = [week.primary, ...week.supporting];
    if (new Set(appearances.map(appearance => appearance.id)).size !== appearances.length) {
        fail(`Source-backed week ${week.weekId} repeats the same classmate.`);
    }
    for (const specialty of week.learningSpecialties) {
        if (!CLASSMATE_SPECIALTIES.has(specialty)) {
            fail(`Source-backed week ${week.weekId} invents learning specialty ${specialty}.`);
        }
    }
    const matchedSpecialties = [...new Set(appearances.map(appearance => appearance.matchedSpecialty))].sort();
    const declaredSpecialties = [...new Set(week.learningSpecialties)].sort();
    if (declaredSpecialties.length !== week.learningSpecialties.length
        || declaredSpecialties.length !== matchedSpecialties.length
        || declaredSpecialties.some((specialty, index) => specialty !== matchedSpecialties[index])) {
        fail(`Source-backed week ${week.weekId} must declare exactly its matched cast specialties.`);
    }
    for (const appearance of appearances) validateAppearance(appearance, week);
}

function validateAppearance(appearance: ClassWeekCastAppearance, week: ClassWeekCastPlanEntry): void {
    exactKeys(appearance, ['id', 'firstName', 'matchedSpecialty'], `week ${week.weekId} appearance`);
    const member = getAcademyCastMember(appearance.id);
    if (member.category !== 'classmate') fail(`Week ${week.weekId} assigns ${member.firstName}, who is not a documented classmate.`);
    if (appearance.firstName !== member.firstName) {
        fail(`Week ${week.weekId} names ${appearance.id} as ${appearance.firstName}; expected ${member.firstName}.`);
    }
    const specialties = ACADEMY_CAST_SPECIALTIES[appearance.id as keyof typeof ACADEMY_CAST_SPECIALTIES] ?? [];
    if (!(specialties as readonly string[]).includes(appearance.matchedSpecialty)) {
        fail(`Week ${week.weekId} assigns ${member.firstName} outside their documented learning specialties.`);
    }
    if (!week.learningSpecialties.includes(appearance.matchedSpecialty)) {
        fail(`Week ${week.weekId} does not bind ${member.firstName}'s specialty to the source topic.`);
    }
}

function validateClassmateReach(
    primaryCounts: ReadonlyMap<string, number>,
    appearanceCounts: ReadonlyMap<string, number>,
): void {
    for (const id of CLASSMATE_IDS) {
        if (!appearanceCounts.has(id)) fail(`Class-week cast plan never represents documented classmate ${id}.`);
        if (!primaryCounts.has(id)) fail(`Documented classmate ${id} never receives a primary lesson appearance.`);
    }
}

function validateConcentration(
    primaryCounts: ReadonlyMap<string, number>,
    appearanceCounts: ReadonlyMap<string, number>,
    assignedWeekCount: number,
): void {
    const totalAppearances = [...appearanceCounts.values()].reduce((sum, count) => sum + count, 0);
    for (const [id, count] of primaryCounts) {
        if (count / assignedWeekCount > EXPECTED_POLICY.maximumPrimaryShare) {
            fail(`${id} exceeds the primary lesson concentration limit.`);
        }
    }
    for (const [id, count] of appearanceCounts) {
        if (count / totalAppearances > EXPECTED_POLICY.maximumAppearanceShare) {
            fail(`${id} exceeds the total lesson appearance concentration limit.`);
        }
    }
    const topTwo = [...appearanceCounts.values()]
        .sort((left, right) => right - left)
        .slice(0, 2)
        .reduce((sum, count) => sum + count, 0);
    if (topTwo / totalAppearances > EXPECTED_POLICY.maximumTopTwoAppearanceShare) {
        fail('The two most-used classmates exceed the combined appearance concentration limit.');
    }
}

function exactKeys(value: object, expected: readonly string[], label: string): void {
    const actual = Object.keys(value).sort();
    const wanted = [...expected].sort();
    if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
        fail(`${label} has unsupported or missing fields.`);
    }
}

function array(value: unknown, label: string): readonly unknown[] {
    if (!Array.isArray(value)) fail(`${label} must be an array.`);
    return value;
}

function record(value: unknown, label: string): Readonly<Record<string, unknown>> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object.`);
    return value as Readonly<Record<string, unknown>>;
}

function text(value: unknown, label: string): string {
    if (typeof value !== 'string' || !value.trim()) fail(`${label} must be non-empty.`);
    return value.trim();
}

function digest(value: unknown, label: string): void {
    if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) fail(`${label} must be a SHA-256 digest.`);
}

function fail(message: string): never {
    throw new TypeError(message);
}

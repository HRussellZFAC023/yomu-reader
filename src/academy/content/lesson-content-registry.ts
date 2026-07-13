import type { GroundedLessonContract } from '../domain/grounded-lesson';
import { validateLessonZeroClassroomExpressions } from './lesson-zero-classroom-expressions';
import { validateLessonZeroGrounding } from './lesson-zero-grounding';
import { LESSON_ZERO_CONTENT_SHA256 } from './lesson-zero-pedagogy-definitions';

export interface LessonPackageRegistration {
    readonly kind: 'lesson';
    readonly filename: string;
    readonly lessonId: string;
    readonly classWeekId?: string;
    readonly expectedContentRevision: string;
    readonly expectedSha256: string;
    audit(value: unknown): GroundedLessonContract;
}

interface LessonSupportRegistration {
    readonly kind: 'support-shard';
    readonly filename: string;
    readonly ownerLessonId: string;
    validate(value: unknown): unknown;
}

export type LessonContentRegistration = LessonPackageRegistration | LessonSupportRegistration;

/**
 * Complete public lesson-directory registry. A new JSON shard must be added
 * here deliberately; complete lessons cannot use a support-shard validator.
 */
export const ACADEMY_LESSON_CONTENT_REGISTRY: readonly LessonContentRegistration[] = Object.freeze([
    {
        kind: 'lesson',
        filename: 'lesson-zero.v1.json',
        lessonId: 'lesson:foundation-00',
        classWeekId: 'orientation',
        expectedContentRevision: '2026-07-13.lesson-zero.v1',
        expectedSha256: LESSON_ZERO_CONTENT_SHA256,
        audit: validateLessonZeroGrounding,
    },
    {
        kind: 'support-shard',
        filename: 'lesson-zero-classroom-expressions.v1.json',
        ownerLessonId: 'lesson:foundation-00',
        validate: validateLessonZeroClassroomExpressions,
    },
]);

export function getLessonContentRegistration(filename: string): LessonContentRegistration {
    const registration = ACADEMY_LESSON_CONTENT_REGISTRY.find(candidate => candidate.filename === filename);
    if (!registration) throw new TypeError(`Unregistered Academy lesson content: ${filename}`);
    return registration;
}

export function getCompleteLessonRegistration(lessonId: string): LessonPackageRegistration {
    const registration = ACADEMY_LESSON_CONTENT_REGISTRY.find(candidate =>
        candidate.kind === 'lesson' && candidate.lessonId === lessonId);
    if (!registration || registration.kind !== 'lesson') {
        throw new TypeError(`Unregistered complete Academy lesson: ${lessonId}`);
    }
    return registration;
}

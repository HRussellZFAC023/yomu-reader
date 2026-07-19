import type { GroundedLessonContract } from '../domain/grounded-lesson';
import {
    adaptAuthoredWeek,
    AUTHORED_WEEK_HASHES,
    type AuthoredWeekId,
    type LearnerAuthoredWeek,
} from './authored-week-adapter';
import { validateLessonZeroClassroomExpressions } from './lesson-zero-classroom-expressions';
import { validateLessonZeroGrounding } from './lesson-zero-grounding';
import { LESSON_ZERO_CONTENT_SHA256 } from './lesson-zero-pedagogy-definitions';
import { parseAuthoredWeekPackage } from './authored-week-schema';

export interface LessonPackageRegistration {
    readonly kind: 'lesson';
    readonly releaseChannel: 'trusted-source' | 'grounded-verified';
    readonly trustedActivityIds: readonly string[];
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

export interface AuthoredWeekRegistration {
    readonly kind: 'authored-week';
    readonly filename: string;
    readonly packageId: AuthoredWeekId;
    readonly classWeekId: string;
    readonly expectedSha256: string;
    validate(bytes: ArrayBuffer): Promise<LoadedAuthoredWeekPackage>;
}

export interface LoadedAuthoredWeekPackage {
    readonly value: unknown;
    readonly week: LearnerAuthoredWeek;
}

export type LessonContentRegistration = LessonPackageRegistration | LessonSupportRegistration | AuthoredWeekRegistration;

const AUTHORED_WEEK_FILES = [
    ['002-l1-l01.json', 'l1-l01', 'l1-l01'],
    ['003-l1-l02.json', 'l1-l02', 'l1-l02'],
    ['004-l1-l03.json', 'l1-l03', 'l1-l03'],
    ['005-l1-l04.json', 'l1-l04', 'l1-l04'],
    ['006-l1-l05.json', 'l1-l05', 'l1-l05'],
    ['007-l1-l06.json', 'l1-l06', 'l1-l06'],
    ['008-l1-l07.json', 'l1-l07', 'l1-l07'],
    ['009-l1-l08.json', 'l1-l08', 'l1-l08'],
    ['010-l1-l09.json', 'l1-l09', 'l1-l09'],
    ['011-l1-l10.json', 'l1-l10', 'l1-l10'],
    ['012-l1-l11.json', 'l1-l11', 'l1plus-l01'],
    ['013-l1-l12.json', 'l1-l12', 'l1plus-l02'],
    ['014-l1-l13.json', 'l1-l13', 'l1plus-l03'],
    ['015-l1-l14.json', 'l1-l14', 'l1plus-l04'],
    ['016-l1-l15.json', 'l1-l15', 'l1plus-l05'],
    ['017-l1-l16.json', 'l1-l16', 'l1plus-l06'],
    ['018-l1-l17.json', 'l1-l17', 'l1plus-l07'],
    ['019-l1-l18.json', 'l1-l18', 'l1plus-l08'],
    ['020-l1-l19.json', 'l1-l19', 'l1plus-l09'],
    ['021-l1-l20.json', 'l1-l20', 'l1plus-l10'],
    ['022-l1-l21.json', 'l1-l21', 'l1plus-summer-homework'],
    ['023-l1-l22.json', 'l1-l22', 'l1plus-katakana-1'],
    ['024-l1-l23.json', 'l1-l23', 'l1plus-katakana-2'],
    ['025-l1-l24.json', 'l1-l24', 'l1plus-katakana-3'],
    ['026-l1-l25.json', 'l1-l25', 'l1plus-katakana-4'],
    ['027-l1-l26.json', 'l1-l26', 'l1plus-katakana-5'],
    ['029-l2-l02.json', 'l2-l02', 'l2plus-l01'],
    ['030-l2-l03.json', 'l2-l03', 'l2plus-l02'],
    ['031-l2-l04.json', 'l2-l04', 'l2plus-l03'],
    ['032-l2-l05.json', 'l2-l05', 'l2plus-l04'],
    ['033-l2-l06.json', 'l2-l06', 'l2plus-l05'],
    ['034-l2-l07.json', 'l2-l07', 'l2plus-l06'],
    ['035-l2-l08.json', 'l2-l08', 'l2plus-l07'],
    ['036-l2-l09.json', 'l2-l09', 'l2plus-l08'],
    ['037-l2-l10.json', 'l2-l10', 'l2plus-l09'],
    ['038-l2-l11.json', 'l2-l11', 'l2plus-l10'],
    ['039-l2-l12.json', 'l2-l12', 'l3-2-l01'],
    ['040-l2-l13.json', 'l2-l13', 'l3-2-l02'],
    ['041-l2-l14.json', 'l2-l14', 'l3-2-l03'],
    ['042-l2-l15.json', 'l2-l15', 'l3-2-l04'],
    ['043-l2-l16.json', 'l2-l16', 'l3-2-l05'],
    ['044-l2-l17.json', 'l2-l17', 'l3-2-l06'],
    ['045-l2-l18.json', 'l2-l18', 'l3-2-l07'],
    ['046-l2-l19.json', 'l2-l19', 'l3-2-prestudy-volitional'],
    ['047-l2-l20.json', 'l2-l20', 'l3-2-l08'],
    ['048-l2-l21.json', 'l2-l21', 'l3-2-l09'],
    ['049-l2-l22.json', 'l2-l22', 'l3-2-l10'],
    ['050-l2-l23.json', 'l2-l23', 'l3-2-kanji-6'],
    ['051-l2-l24.json', 'l2-l24', 'l3plus-kickoff'],
    ['052-l2-l25.json', 'l2-l25', 'l3plus-l01'],
    ['053-l2-l26.json', 'l2-l26', 'l3plus-l02'],
    ['054-l2-l27.json', 'l2-l27', 'l3plus-l03'],
    ['055-l2-l28.json', 'l2-l28', 'l3plus-l04'],
    ['056-l2-l29.json', 'l2-l29', 'l3plus-l05'],
    ['057-l2-l30.json', 'l2-l30', 'l3plus-l06'],
    ['058-l2-l31.json', 'l2-l31', 'l3plus-l07'],
    ['059-l2-l32.json', 'l2-l32', 'l3plus-l08'],
    ['060-l2-l33.json', 'l2-l33', 'l3plus-l09'],
    ['063-l2-l36.json', 'l2-l36', 'l3plus-l10'],
    ['061-l2-l34.json', 'l2-l34', 'l3plus-kanji-7'],
] as const satisfies readonly (readonly [string, AuthoredWeekId, string])[];

const AUTHORED_WEEK_REGISTRATIONS: readonly AuthoredWeekRegistration[] = AUTHORED_WEEK_FILES.map(
    ([filename, packageId, classWeekId]) => ({
        kind: 'authored-week' as const,
        filename,
        packageId,
        classWeekId,
        expectedSha256: AUTHORED_WEEK_HASHES[packageId],
        validate: (bytes: ArrayBuffer) => validateAuthoredWeekBytes(
            filename,
            packageId,
            AUTHORED_WEEK_HASHES[packageId],
            bytes,
        ),
    }),
);

/**
 * Complete public lesson-directory registry. A new JSON shard must be added
 * here deliberately; complete lessons cannot use a support-shard validator.
 */
export const ACADEMY_LESSON_CONTENT_REGISTRY: readonly LessonContentRegistration[] = Object.freeze([
    {
        kind: 'lesson',
        releaseChannel: 'trusted-source',
        trustedActivityIds: [
            'activity:lesson-zero-reconstruct-repair',
            'activity:lesson-zero-first-repair:sound',
            'activity:lesson-zero-first-repair:text',
            'activity:lesson-zero-first-repair:speaking',
            'activity:aakash-rainy-directions',
            'activity:lesson-zero-kanji-one',
            'activity:lesson-zero-kana-mastery',
        ],
        filename: 'lesson-zero.v1.json',
        lessonId: 'lesson:foundation-00',
        classWeekId: 'orientation',
        expectedContentRevision: '2026-07-13.lesson-zero.v1-audio-contract-2',
        expectedSha256: LESSON_ZERO_CONTENT_SHA256,
        audit: validateLessonZeroGrounding,
    },
    {
        kind: 'support-shard',
        filename: 'lesson-zero-classroom-expressions.v1.json',
        ownerLessonId: 'lesson:foundation-00',
        validate: validateLessonZeroClassroomExpressions,
    },
    {
        kind: 'support-shard',
        filename: '028-l2-l01.json',
        ownerLessonId: 'lesson:l2-kickoff-planning',
        validate: parseAuthoredWeekPackage,
    },
    ...AUTHORED_WEEK_REGISTRATIONS,
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

export function getAuthoredWeekRegistration(packageId: string): AuthoredWeekRegistration {
    const registration = ACADEMY_LESSON_CONTENT_REGISTRY.find(candidate =>
        candidate.kind === 'authored-week' && candidate.packageId === packageId);
    if (!registration || registration.kind !== 'authored-week') {
        throw new TypeError(`Unregistered authored Academy week: ${packageId}`);
    }
    return registration;
}

export async function loadAuthoredWeekPackage(
    packageId: string,
    fetcher: typeof fetch = fetch,
): Promise<LoadedAuthoredWeekPackage> {
    const registration = getAuthoredWeekRegistration(packageId);
    const response = await fetcher(`/academy/content/lessons/${registration.filename}`);
    if (!response.ok) {
        throw new Error(`Unable to load authored Academy package ${packageId} (${response.status}).`);
    }
    return registration.validate(await response.arrayBuffer());
}

async function validateAuthoredWeekBytes(
    filename: string,
    packageId: AuthoredWeekId,
    expectedSha256: string,
    bytes: ArrayBuffer,
): Promise<LoadedAuthoredWeekPackage> {
    const sha256 = await hashBytes(bytes);
    if (sha256 !== expectedSha256) {
        throw new TypeError(`Authored Academy package ${packageId} does not match its registered bytes.`);
    }
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    const week = adaptAuthoredWeek(value, {
        path: `/academy/content/lessons/${filename}`,
        sha256,
    });
    if (week.id !== packageId) {
        throw new TypeError(`Authored Academy package ${packageId} resolved to another package.`);
    }
    return Object.freeze({ value, week });
}

async function hashBytes(bytes: ArrayBuffer): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
}

import type { AcademyLearningSpecialty } from '../domain/authored-cast';
import type { AcademyCastMemberId } from '../domain/cast-registry';

export const CANONICAL_CLASS_WEEK_INDEX_SHA256 = '966519845a8048229e8d6e158b9d620fb8c9cf0aba11db53690ef10e479a343b';

export const CANONICAL_CLASS_WEEK_IDS = [
    'orientation',
    'l1-kickoff',
    'l1-l01', 'l1-l02', 'l1-l03', 'l1-l04', 'l1-l05', 'l1-l06', 'l1-l07', 'l1-l08', 'l1-l09', 'l1-l10',
    'l1-hiragana-1', 'l1-hiragana-2', 'l1-hiragana-3', 'l1-hiragana-4', 'l1-hiragana-5', 'l1-hiragana-6', 'l1-hiragana-7',
    'l1plus-kickoff',
    'l1plus-l01', 'l1plus-l02', 'l1plus-l03', 'l1plus-l04', 'l1plus-l05', 'l1plus-l06', 'l1plus-l07', 'l1plus-l08', 'l1plus-l09', 'l1plus-l10',
    'l1plus-summer-homework',
    'l1plus-katakana-1', 'l1plus-katakana-2', 'l1plus-katakana-3', 'l1plus-katakana-4', 'l1plus-katakana-5',
    'l2plus-kickoff',
    'l2plus-l01', 'l2plus-l02', 'l2plus-l03', 'l2plus-l04', 'l2plus-l05', 'l2plus-l06', 'l2plus-l07', 'l2plus-l08', 'l2plus-l09', 'l2plus-l10',
    'l2plus-kanji-4',
    'l3-2-kickoff', 'l3-2-selfstudy-ch27',
    'l3-2-l01', 'l3-2-l02', 'l3-2-l03', 'l3-2-l04', 'l3-2-l05', 'l3-2-l06', 'l3-2-l07',
    'l3-2-prestudy-volitional', 'l3-2-l08', 'l3-2-l09', 'l3-2-l10', 'l3-2-kanji-6',
    'l3plus-kickoff',
    'l3plus-l01', 'l3plus-l02', 'l3plus-l03', 'l3plus-l04', 'l3plus-l05', 'l3plus-l06', 'l3plus-l07', 'l3plus-l08', 'l3plus-l09',
    'l3plus-kanji-7',
] as const;

export type CanonicalClassWeekId = typeof CANONICAL_CLASS_WEEK_IDS[number];
export type ClassWeekAppearanceStatus = 'source-backed' | 'review-required';
export type ClassWeekReviewReason = 'course-outline-only' | 'no-source-topic-metadata';

export interface ClassWeekCastAppearance {
    readonly id: AcademyCastMemberId;
    readonly firstName: string;
    readonly matchedSpecialty: AcademyLearningSpecialty;
}

export interface ClassWeekCastPlanEntry {
    readonly order: number;
    readonly weekId: CanonicalClassWeekId;
    readonly weekKind: string;
    readonly source: Readonly<{
        donor: 'academy-rebuild-20260711';
        file: string;
        title: Readonly<{ en: string; ja: string }>;
        topicEvidence: readonly string[];
        sha256: string;
    }>;
    readonly status: ClassWeekAppearanceStatus;
    readonly learningSpecialties: readonly AcademyLearningSpecialty[];
    readonly primary: ClassWeekCastAppearance | null;
    readonly supporting: readonly ClassWeekCastAppearance[];
    readonly reviewReason?: ClassWeekReviewReason;
}

export interface ClassWeekCastPlan {
    readonly schema: 'yomu-academy.class-week-cast-plan.v1';
    readonly contentVersion: '1.0.0';
    readonly scope: 'appearance-planning';
    readonly runtimeStatus: 'not-bound';
    readonly authorshipStatus: 'planning-only';
    readonly sourceIndex: Readonly<{
        donor: 'academy-rebuild-20260711';
        file: 'public/academy/content/weeks/index.json';
        weekCount: 73;
        sha256: string;
    }>;
    readonly concentrationPolicy: Readonly<{
        maximumPrimaryShare: 0.18;
        maximumAppearanceShare: 0.16;
        maximumTopTwoAppearanceShare: 0.25;
        maximumConsecutivePrimaryWeeks: 2;
    }>;
    readonly weeks: readonly ClassWeekCastPlanEntry[];
}

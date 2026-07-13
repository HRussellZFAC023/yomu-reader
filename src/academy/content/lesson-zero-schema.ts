import type { LocalizedText, SourceLibraryData } from '../domain/source-library';
import { ACADEMY_CAST, type AcademyCastMemberId } from '../domain/cast-registry';

export const LESSON_ZERO_CONTENT_URL = '/academy/content/lessons/lesson-zero.v1.json';

export const LESSON_ZERO_CANONICAL_CHARACTER_IDS: readonly AcademyCastMemberId[] = Object.freeze(
    ACADEMY_CAST.map(member => member.id),
);

export const LESSON_ZERO_RESPONSE_MODES = [
    'listen', 'act', 'reconstruct', 'voice', 'ime', 'doodle',
] as const;

export type LessonZeroCharacterId = AcademyCastMemberId;
export type LessonZeroResponseMode = typeof LESSON_ZERO_RESPONSE_MODES[number];

export interface AssessedSupportContract {
    readonly reading: 'learner-controlled';
    readonly pitch: 'learner-controlled';
    readonly englishMeaning: 'after-commit';
    readonly transcript: 'after-commit';
    readonly modelAnswer: 'after-first-attempt';
}

export interface LessonZeroSection {
    readonly id: string;
    readonly order: number;
    readonly title: LocalizedText;
    readonly outcomeIds: readonly string[];
    readonly activityIds: readonly string[];
    readonly resumableAfter: boolean;
}

export interface LessonZeroActivity {
    readonly id: string;
    readonly sectionId: string;
    readonly responseMode: LessonZeroResponseMode;
    readonly assessed: boolean;
    readonly production: boolean;
    readonly prompt: LocalizedText;
    readonly conceptIds: readonly string[];
    readonly sourceQuestionIds: readonly string[];
    readonly inputScriptId?: string;
    readonly expectedEvidence: Readonly<{
        kind: string;
        values?: readonly string[];
        rubricIds?: readonly string[];
    }>;
    readonly support: AssessedSupportContract;
}

export interface LessonZeroInputScript {
    readonly id: string;
    readonly audioAssetId: string;
    readonly transcriptReveal: 'after-commit';
    readonly lines: readonly Readonly<{
        speakerId: LessonZeroCharacterId;
        japanese: string;
        reading: string;
        english: string;
    }>[];
}

export interface LessonZeroAudioAsset {
    readonly id: string;
    readonly state: 'ready' | 'release-blocked';
    readonly purpose: string;
    readonly blockerId?: string;
    readonly runtimeUrl?: string;
    readonly verifiedPairing?: boolean;
    readonly browserTtsAllowed: false;
    readonly learnerVisiblePlaceholder: false;
}

export interface LessonZeroMission {
    readonly id: 'sound' | 'text' | 'speaking';
    readonly hostIds: readonly [LessonZeroCharacterId, LessonZeroCharacterId];
    readonly locationId: string;
    readonly signature: string;
    readonly openingActivityId: string;
    readonly transferActivityId: string;
    readonly evidenceProfile: Readonly<Record<'listening' | 'reading' | 'speaking' | 'writing', number>>;
    readonly mementoId: string;
}

export interface LessonZeroReleaseBlocker {
    readonly id: string;
    readonly kind: 'audio';
    readonly assetIds: readonly string[];
    readonly internalReason: string;
    readonly learnerVisible: false;
}

export interface LessonZeroDefinition {
    readonly id: 'lesson:foundation-00';
    readonly contentVersion: string;
    readonly levelBand: 'foundation';
    readonly estimatedMinutes: Readonly<{ minimum: number; maximum: number }>;
    readonly sectionIds: readonly string[];
    readonly sections: readonly LessonZeroSection[];
    readonly sentenceFrames: readonly string[];
    readonly vocabulary: readonly Readonly<{
        id: string;
        japanese: string;
        reading: string;
        meaning: LocalizedText;
    }>[];
    readonly activities: readonly LessonZeroActivity[];
    readonly inputScripts: readonly LessonZeroInputScript[];
    readonly audioAssets: readonly LessonZeroAudioAsset[];
    readonly missions: readonly LessonZeroMission[];
    readonly releaseBlockers: readonly LessonZeroReleaseBlocker[];
}

export interface VersionedSourceLibraryData extends SourceLibraryData {
    readonly schemaVersion: 1;
}

export interface LessonZeroPackageData {
    readonly schemaVersion: 1;
    readonly sourceLibrary: VersionedSourceLibraryData;
    readonly lesson: LessonZeroDefinition;
}

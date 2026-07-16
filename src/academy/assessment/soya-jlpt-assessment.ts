import type { JlptBand } from '../domain/learner-record';
import {
    ORIENTATION_MOCK_ITEMS,
    placementAudioDelivery,
    type PlacementAudioDelivery,
    type PlacementItem,
    type ReceptivePlacementSkill,
} from '../placement/orientation';
import {
    JAPANESE_LIBRARY_JLPT_QUARANTINE,
    SOYA_JLPT_ASSESSMENT_SOURCE_POLICY,
    SOYA_JLPT_AUDIO_QUARANTINE,
    SOYA_JLPT_PACKAGED_AUDIO,
    SOYA_JLPT_SOURCE_CROSSWALK,
    validateSoyaJlptAssessmentCrosswalk,
} from './soya-jlpt-crosswalk';

export const SOYA_JLPT_ASSESSMENT_ID = 'academy-soya-jlpt-placement:v1' as const;
export const JLPT_BANDS_ASCENDING: readonly JlptBand[] = ['n5', 'n4', 'n3', 'n2', 'n1'];
export const JLPT_RECEPTIVE_SKILLS: readonly ReceptivePlacementSkill[] = [
    'language-knowledge',
    'reading',
    'listening',
];

export const SOYA_JLPT_STORY_CONTINUITY = Object.freeze({
    mode: 'preserve' as const,
    preserveChronology: true,
    markScenesSeen: false,
    alterRelationships: false,
    curriculumEffect: 'starting-recommendation-only' as const,
});

export interface SoyaJlptSkillDiagnostic {
    readonly skill: ReceptivePlacementSkill;
    readonly attempted: number;
    readonly correct: number;
    readonly available: number;
    readonly score: number;
}

export interface SoyaJlptBandDiagnostic {
    readonly band: JlptBand;
    readonly attempted: number;
    readonly correct: number;
    readonly available: number;
    readonly score: number;
    readonly skills: Readonly<Record<ReceptivePlacementSkill, SoyaJlptSkillDiagnostic>>;
    readonly mastered: boolean;
}

export type SoyaJlptRecommendationStatus = 'recommendation' | 'insufficient-evidence';
export type SoyaJlptRecommendationReason = 'mastery-frontier' | 'n5-support-start' | 'incomplete-n5-evidence';

export interface SoyaJlptAssessmentResult {
    readonly assessmentId: typeof SOYA_JLPT_ASSESSMENT_ID;
    readonly calibration: 'source-grounded-mastery-frontier';
    readonly recommendationStatus: SoyaJlptRecommendationStatus;
    readonly recommendationReason: SoyaJlptRecommendationReason;
    readonly recommendedBand: JlptBand | null;
    readonly attempted: number;
    readonly correct: number;
    readonly available: number;
    readonly bandDiagnostics: Readonly<Record<JlptBand, SoyaJlptBandDiagnostic>>;
    readonly caveat: 'Not an official JLPT score, pass prediction, or certificate.';
    readonly storyContinuity: typeof SOYA_JLPT_STORY_CONTINUITY;
}

validateSoyaJlptAssessmentCrosswalk(ORIENTATION_MOCK_ITEMS);

export function soyaJlptItemsForBand(band: JlptBand): readonly PlacementItem[] {
    return ORIENTATION_MOCK_ITEMS.filter(item => item.band === band);
}

export function resolveSoyaJlptAudio(item: PlacementItem): PlacementAudioDelivery | undefined {
    const registered = ORIENTATION_MOCK_ITEMS.find(candidate => candidate.id === item.id);
    if (!registered || registered.referenceId !== item.referenceId) {
        throw new TypeError(`Unknown Soya JLPT assessment item: ${item.id}`);
    }
    return placementAudioDelivery(registered);
}

export function scoreSoyaJlptAssessment(
    responses: Readonly<Record<string, string>>,
): SoyaJlptAssessmentResult {
    const diagnostics = Object.fromEntries(JLPT_BANDS_ASCENDING.map(band => [
        band,
        scoreBand(band, responses),
    ])) as Record<JlptBand, SoyaJlptBandDiagnostic>;

    let frontier: JlptBand | null = null;
    for (const band of JLPT_BANDS_ASCENDING) {
        if (!diagnostics[band].mastered) break;
        frontier = band;
    }

    const n5 = diagnostics.n5;
    const recommendationStatus: SoyaJlptRecommendationStatus = n5.attempted === n5.available
        ? 'recommendation'
        : 'insufficient-evidence';
    const recommendationReason: SoyaJlptRecommendationReason = recommendationStatus === 'insufficient-evidence'
        ? 'incomplete-n5-evidence'
        : frontier
            ? 'mastery-frontier'
            : 'n5-support-start';
    const recommendedBand = recommendationStatus === 'insufficient-evidence' ? null : (frontier ?? 'n5');
    const attempted = Object.values(diagnostics).reduce((sum, band) => sum + band.attempted, 0);
    const correct = Object.values(diagnostics).reduce((sum, band) => sum + band.correct, 0);

    return {
        assessmentId: SOYA_JLPT_ASSESSMENT_ID,
        calibration: 'source-grounded-mastery-frontier',
        recommendationStatus,
        recommendationReason,
        recommendedBand,
        attempted,
        correct,
        available: ORIENTATION_MOCK_ITEMS.length,
        bandDiagnostics: diagnostics,
        caveat: 'Not an official JLPT score, pass prediction, or certificate.',
        storyContinuity: SOYA_JLPT_STORY_CONTINUITY,
    };
}

export const SOYA_JLPT_ASSESSMENT = Object.freeze({
    id: SOYA_JLPT_ASSESSMENT_ID,
    kind: 'placement-assessment' as const,
    items: ORIENTATION_MOCK_ITEMS,
    bands: JLPT_BANDS_ASCENDING,
    sourcePolicy: SOYA_JLPT_ASSESSMENT_SOURCE_POLICY,
    sourceCrosswalk: SOYA_JLPT_SOURCE_CROSSWALK,
    packagedAudio: SOYA_JLPT_PACKAGED_AUDIO,
    audioQuarantine: SOYA_JLPT_AUDIO_QUARANTINE,
    japaneseLibraryQuarantine: JAPANESE_LIBRARY_JLPT_QUARANTINE,
    storyContinuity: SOYA_JLPT_STORY_CONTINUITY,
    itemsForBand: soyaJlptItemsForBand,
    resolveAudio: resolveSoyaJlptAudio,
    score: scoreSoyaJlptAssessment,
});

function scoreBand(
    band: JlptBand,
    responses: Readonly<Record<string, string>>,
): SoyaJlptBandDiagnostic {
    const items = soyaJlptItemsForBand(band);
    const skills = Object.fromEntries(JLPT_RECEPTIVE_SKILLS.map(skill => [
        skill,
        scoreSkill(skill, items.filter(item => item.skill === skill), responses),
    ])) as Record<ReceptivePlacementSkill, SoyaJlptSkillDiagnostic>;
    const attempted = Object.values(skills).reduce((sum, skill) => sum + skill.attempted, 0);
    const correct = Object.values(skills).reduce((sum, skill) => sum + skill.correct, 0);
    const available = items.length;
    const score = available ? correct / available : 0;
    const mastered = attempted === available
        && score >= 2 / 3
        && JLPT_RECEPTIVE_SKILLS.every(skill => skills[skill].score >= 0.5);
    return { band, attempted, correct, available, score, skills, mastered };
}

function scoreSkill(
    skill: ReceptivePlacementSkill,
    items: readonly PlacementItem[],
    responses: Readonly<Record<string, string>>,
): SoyaJlptSkillDiagnostic {
    const selections = items.map(item => item.options.find(option => option.id === responses[item.id]));
    const attempted = selections.filter(Boolean).length;
    const correct = selections.filter(option => option?.correct).length;
    return {
        skill,
        attempted,
        correct,
        available: items.length,
        score: items.length ? correct / items.length : 0,
    };
}

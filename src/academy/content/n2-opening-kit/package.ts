import { ACADEMY_ASSESSED_ANSWER_SUPPORT } from '../../domain/activity-runtime';
import type { FeedbackBlock } from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';
import type { MiningRequest } from '../../integration/yomu-bridge';
import type {
    N2OpeningActivityModel,
    N2OpeningListeningMedia,
    N2OpeningPackage,
    N2OpeningPrerequisite,
    N2OpeningProvenance,
    N2OpeningQuestion,
    N2OpeningReviewTarget,
    N2OpeningSequenceOrder,
} from './types';

export interface N2OpeningPackageInput<
    Kind extends string,
    ResponseKind extends string,
    PackageId extends string,
    Provenance extends N2OpeningProvenance<PackageId>,
> {
    readonly id: PackageId;
    readonly kind: Kind;
    readonly responseKind: ResponseKind;
    readonly order: N2OpeningSequenceOrder;
    readonly previousPackageId?: string;
    readonly nextPackageId?: string;
    readonly provenance: Provenance;
    readonly sourceQuestionId: string;
    readonly introduces: string;
    readonly recycles: readonly string[];
    readonly prerequisite: N2OpeningPrerequisite;
    readonly prompt: LocalizedText;
    readonly instructionTitle: LocalizedText;
    readonly instructionEntries: readonly Readonly<{ japanese: string; explanation: LocalizedText }>[];
    readonly contentTitle: LocalizedText;
    readonly paragraphs: readonly string[];
    readonly questions: readonly N2OpeningQuestion[];
    readonly feedback: Readonly<{
        pass: FeedbackBlock;
        lapse: Required<Pick<FeedbackBlock, 'explanation' | 'repairPrompt' | 'nearbyExample'>>;
    }>;
    readonly reviewTargets: readonly N2OpeningReviewTarget[];
    readonly miningRequests: readonly MiningRequest[];
    readonly media?: N2OpeningListeningMedia;
    readonly curriculumPhase?: 'assessed-recognition' | 'assessed-production';
}

export function createN2OpeningPackage<
    Kind extends string,
    ResponseKind extends string,
    PackageId extends string,
    Provenance extends N2OpeningProvenance<PackageId>,
>(input: N2OpeningPackageInput<Kind, ResponseKind, PackageId, Provenance>): N2OpeningPackage<
    PackageId,
    N2OpeningActivityModel<Kind, ResponseKind, PackageId, Provenance>
> {
    const conceptIds = Object.freeze([...new Set([...input.recycles, input.introduces])]);
    const readerSurfaceIds = Object.freeze([
        ...input.paragraphs.map((_, index) => `reader:${input.id}:content:${index + 1}`),
        ...(input.media?.transcript ?? []).map((_, index) => `reader:${input.id}:transcript:${index + 1}`),
    ]);
    const activity: N2OpeningActivityModel<Kind, ResponseKind, PackageId, Provenance> = Object.freeze({
        id: `activity:${input.id}`,
        kind: input.kind,
        sourceQuestionId: input.sourceQuestionId,
        conceptIds,
        responseKind: input.responseKind,
        curriculumPhase: input.curriculumPhase ?? 'assessed-recognition',
        prompt: Object.freeze(input.prompt),
        answerSupport: ACADEMY_ASSESSED_ANSWER_SUPPORT,
        teachingSupport: Object.freeze({
            kind: 'context' as const,
            title: Object.freeze(input.instructionTitle),
            entries: Object.freeze(input.instructionEntries.map(entry => Object.freeze({ japanese: entry.japanese }))),
        }),
        provenance: input.provenance,
        payload: Object.freeze({
            sequence: Object.freeze({
                order: input.order,
                total: 5 as const,
                introduces: input.introduces,
                recycles: Object.freeze([...input.recycles]),
            }),
            instruction: Object.freeze({
                title: Object.freeze(input.instructionTitle),
                entries: Object.freeze(input.instructionEntries.map(entry => Object.freeze({
                    japanese: entry.japanese,
                    explanation: Object.freeze(entry.explanation),
                }))),
                authorship: 'original-yomu-authored' as const,
            }),
            content: Object.freeze({
                title: Object.freeze(input.contentTitle),
                paragraphs: Object.freeze([...input.paragraphs]),
                authorship: 'original-yomu-authored' as const,
            }),
            ...(input.media ? { media: input.media } : {}),
            questions: Object.freeze([...input.questions]),
            passScore: 1 as const,
            feedback: input.feedback,
            reviewTargets: Object.freeze([...input.reviewTargets]),
        }),
    });
    return Object.freeze({
        id: input.id,
        band: 'N2' as const,
        sequence: Object.freeze({
            order: input.order,
            total: 5 as const,
            ...(input.previousPackageId ? { previousPackageId: input.previousPackageId } : {}),
            ...(input.nextPackageId ? { nextPackageId: input.nextPackageId } : {}),
        }),
        prerequisites: Object.freeze([input.prerequisite]),
        activity,
        readerSrs: Object.freeze({
            readerSurfaceIds,
            miningRequests: Object.freeze([...input.miningRequests]),
        }),
    });
}

export function n2OpeningPrerequisite(
    conceptId: string,
    ja: string,
    en: string,
    fromPackageId?: string,
): N2OpeningPrerequisite {
    return Object.freeze({
        conceptId,
        minimumEvidence: 'introduced-and-attempted' as const,
        reason: Object.freeze({ ja, en }),
        ...(fromPackageId ? { fromPackageId } : {}),
    });
}

export function n2OpeningInstruction(japanese: string, explanationEn: string) {
    return Object.freeze({
        japanese,
        explanation: Object.freeze({ ja: japanese, en: explanationEn }),
    });
}

export function n2OpeningFeedback(
    passJa: string,
    passEn: string,
    lapseJa: string,
    lapseEn: string,
    repairJa: string,
    repairEn: string,
    exampleJa: string,
    exampleEn: string,
): N2OpeningPackageInput<string, string, string, N2OpeningProvenance>['feedback'] {
    return Object.freeze({
        pass: Object.freeze({ explanation: Object.freeze({ ja: passJa, en: passEn }) }),
        lapse: Object.freeze({
            explanation: Object.freeze({ ja: lapseJa, en: lapseEn }),
            repairPrompt: Object.freeze({ ja: repairJa, en: repairEn }),
            nearbyExample: Object.freeze({ ja: exampleJa, en: exampleEn }),
        }),
    });
}

export function n2OpeningReview(
    packageId: string,
    suffix: string,
    conceptId: string,
    expression: string,
    reading: string | undefined,
    meanings: readonly string[],
    sentence: string,
    repairFor: readonly string[],
): N2OpeningReviewTarget {
    return Object.freeze({
        id: `review:${packageId}:${suffix}`,
        conceptId,
        expression,
        ...(reading ? { reading } : {}),
        meanings: Object.freeze([...meanings]),
        sentence,
        repairFor: Object.freeze([...repairFor]),
    });
}

export function n2OpeningMining(
    expression: string,
    sentence: string,
    sourceTitle: string,
    conceptIds: readonly string[],
): MiningRequest {
    return Object.freeze({ expression, sentence, sourceTitle, conceptIds: Object.freeze([...conceptIds]) });
}

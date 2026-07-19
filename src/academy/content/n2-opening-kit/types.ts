import type { ActivityModel, FeedbackBlock } from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';
import type { MiningRequest } from '../../integration/yomu-bridge';

export type N2OpeningSequenceOrder = 1 | 2 | 3 | 4 | 5;

export interface N2OpeningProvenance<PackageId extends string = string> {
    readonly packageId: PackageId;
    readonly answerVisibility: 'after-attempt';
}

interface N2OpeningQuestionBase {
    readonly id: string;
    readonly prompt: LocalizedText;
    readonly errorTag: string;
}

export interface N2OpeningChoiceQuestion extends N2OpeningQuestionBase {
    readonly kind: 'choice';
    readonly options: readonly Readonly<{ id: string; label: LocalizedText }>[];
    readonly correctOptionId: string;
}

export interface N2OpeningOrderingQuestion extends N2OpeningQuestionBase {
    readonly kind: 'ordering';
    readonly actions: readonly Readonly<{ id: string; label: LocalizedText }>[];
    readonly presentationOrder: readonly string[];
    readonly correctOrder: readonly string[];
}

export interface N2OpeningTypedQuestion extends N2OpeningQuestionBase {
    readonly kind: 'typed';
    readonly fieldLabel: LocalizedText;
    readonly acceptedAnswers: readonly string[];
}

export type N2OpeningQuestion =
    | N2OpeningChoiceQuestion
    | N2OpeningOrderingQuestion
    | N2OpeningTypedQuestion;

export interface N2OpeningReviewTarget {
    readonly id: string;
    readonly conceptId: string;
    readonly expression: string;
    readonly reading?: string;
    readonly meanings: readonly string[];
    readonly sentence: string;
    readonly repairFor: readonly string[];
}

export interface N2OpeningListeningMedia {
    readonly kind: 'exact-soya-listening';
    readonly audioUrl: string;
    readonly imageUrl: string;
    readonly imageAlt: LocalizedText;
    readonly transcriptVisibility: 'after-attempt';
    readonly answerVisibility: 'after-attempt';
    readonly transcript: readonly Readonly<{ speaker: 'N' | 'F' | 'M'; text: string }>[];
    readonly correctAnswer: string;
}

export interface N2OpeningActivityModel<
    Kind extends string = string,
    ResponseKind extends string = string,
    PackageId extends string = string,
    Provenance extends N2OpeningProvenance<PackageId> = N2OpeningProvenance<PackageId>,
> extends ActivityModel {
    readonly kind: Kind;
    readonly responseKind: ResponseKind;
    readonly provenance: Provenance;
    readonly payload: {
        readonly sequence: Readonly<{
            order: N2OpeningSequenceOrder;
            total: 5;
            introduces: string;
            recycles: readonly string[];
        }>;
        readonly instruction: Readonly<{
            title: LocalizedText;
            entries: readonly Readonly<{ japanese: string; explanation: LocalizedText }>[];
            authorship: 'original-yomu-authored';
        }>;
        readonly content: Readonly<{
            title: LocalizedText;
            paragraphs: readonly string[];
            authorship: 'original-yomu-authored';
        }>;
        readonly media?: N2OpeningListeningMedia;
        readonly questions: readonly N2OpeningQuestion[];
        readonly passScore: 1;
        readonly feedback: {
            readonly pass: FeedbackBlock;
            readonly lapse: Required<Pick<FeedbackBlock, 'explanation' | 'repairPrompt' | 'nearbyExample'>>;
        };
        readonly reviewTargets: readonly N2OpeningReviewTarget[];
    };
}

export type N2OpeningAnswer =
    | Readonly<{ questionId: string; kind: 'choice'; optionId: string }>
    | Readonly<{ questionId: string; kind: 'ordering'; order: readonly string[] }>
    | Readonly<{ questionId: string; kind: 'typed'; value: string }>;

export interface N2OpeningResponse {
    readonly answers: readonly N2OpeningAnswer[];
}

export interface N2OpeningPrerequisite<PackageId extends string = string> {
    readonly conceptId: string;
    readonly minimumEvidence: 'introduced-and-attempted';
    readonly reason: LocalizedText;
    readonly fromPackageId?: PackageId;
}

export interface N2OpeningPackage<
    PackageId extends string = string,
    Model extends N2OpeningActivityModel = N2OpeningActivityModel,
> {
    readonly id: PackageId;
    readonly band: 'N2';
    readonly sequence: Readonly<{
        order: N2OpeningSequenceOrder;
        total: 5;
        previousPackageId?: string;
        nextPackageId?: string;
    }>;
    readonly prerequisites: readonly N2OpeningPrerequisite[];
    readonly activity: Model;
    readonly readerSrs: Readonly<{
        readerSurfaceIds: readonly string[];
        miningRequests: readonly MiningRequest[];
    }>;
}

export function localizedText(ja: string, en: string): LocalizedText {
    return Object.freeze({ ja, en });
}

export function choiceOption(id: string, ja: string, en: string) {
    return Object.freeze({ id, label: localizedText(ja, en) });
}

export function orderingAction(id: string, ja: string, en: string) {
    return Object.freeze({ id, label: localizedText(ja, en) });
}

export function choiceQuestion(
    id: string,
    ja: string,
    en: string,
    options: readonly ReturnType<typeof choiceOption>[],
    correctOptionId: string,
    errorTag: string,
): N2OpeningChoiceQuestion {
    return Object.freeze({ kind: 'choice', id, prompt: localizedText(ja, en), options: Object.freeze(options), correctOptionId, errorTag });
}

export function typedQuestion(
    id: string,
    ja: string,
    en: string,
    fieldJa: string,
    fieldEn: string,
    acceptedAnswers: readonly string[],
    errorTag: string,
): N2OpeningTypedQuestion {
    return Object.freeze({
        kind: 'typed',
        id,
        prompt: localizedText(ja, en),
        fieldLabel: localizedText(fieldJa, fieldEn),
        acceptedAnswers: Object.freeze([...acceptedAnswers]),
        errorTag,
    });
}

export function orderingQuestion(
    id: string,
    ja: string,
    en: string,
    actions: readonly ReturnType<typeof orderingAction>[],
    presentationOrder: readonly string[],
    correctOrder: readonly string[],
    errorTag: string,
): N2OpeningOrderingQuestion {
    return Object.freeze({
        kind: 'ordering',
        id,
        prompt: localizedText(ja, en),
        actions: Object.freeze(actions),
        presentationOrder: Object.freeze([...presentationOrder]),
        correctOrder: Object.freeze([...correctOrder]),
        errorTag,
    });
}

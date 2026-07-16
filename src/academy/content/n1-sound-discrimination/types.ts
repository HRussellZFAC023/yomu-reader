import type { ActivityModel, FeedbackBlock } from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';
import type { MiningRequest } from '../../integration/yomu-bridge';

export const N1_SOUND_DISCRIMINATION_ACTIVITY_KIND = 'academy-n1-sound-discrimination' as const;

export interface N1SoundDiscriminationPrerequisite {
    readonly conceptId: string;
    readonly minimumEvidence: 'introduced-and-attempted';
    readonly reason: LocalizedText;
}

export interface N1SoundDiscriminationQuestion {
    readonly id: string;
    readonly prompt: LocalizedText;
    readonly playbackText: string;
    readonly options: readonly Readonly<{ id: string; label: LocalizedText }>[];
    readonly correctOptionId: string;
    readonly errorTag: string;
}

export interface N1SoundDiscriminationModel extends ActivityModel {
    readonly kind: typeof N1_SOUND_DISCRIMINATION_ACTIVITY_KIND;
    readonly responseKind: 'n1-sound-discrimination-v1';
    readonly provenance: {
        readonly packageId: 'n1-sound-discrimination-01';
        readonly sourceScope: 'japanese-library';
        readonly sourceId: string;
        readonly sourceFamily: 'shin-kanzen';
        readonly sourceTitle: '新完全マスター聴解 N1';
        readonly relativePath: string;
        readonly sourceDocumentSha256: string;
        readonly sourceDocumentByteLength: 21196731;
        readonly sourcePageImageSha256: string;
        readonly sourcePageImageByteLength: 839734;
        readonly sourceAudioRelativePath: string;
        readonly sourceAudioSha256: string;
        readonly sourceAudioByteLength: 1456001;
        readonly sourceLocus: {
            readonly pdfPage: 23;
            readonly printedPage: 14;
            readonly section: 'I 音声の特徴に慣れる';
            readonly item: '1 似ている音の聞き分け';
            readonly exercise: '練習1';
            readonly track: 'A07';
        };
        readonly sourceLocusSha256: string;
        readonly rights: {
            readonly state: 'user-permitted-local-reference-only';
            readonly sourceTextDelivery: 'not-delivered';
            readonly sourceImageDelivery: 'not-delivered';
            readonly sourceAudioDelivery: 'not-delivered';
            readonly learnerActivityText: 'original-yomu-authored';
        };
        readonly sourceMediaState: 'local-reference-not-delivered';
    };
    readonly payload: {
        readonly teaching: readonly Readonly<{
            readonly title: LocalizedText;
            readonly cue: string;
            readonly explanation: LocalizedText;
        }>[];
        readonly soundMap: readonly Readonly<{
            readonly id: string;
            readonly left: string;
            readonly right: string;
            readonly focus: LocalizedText;
        }>[];
        readonly questions: readonly N1SoundDiscriminationQuestion[];
        readonly production: {
            readonly prompt: LocalizedText;
            readonly guidance: LocalizedText;
            readonly fieldLabel: LocalizedText;
            readonly authorship: 'learner-authored-ungraded';
        };
        readonly passScore: 1;
        readonly feedback: {
            readonly pass: FeedbackBlock;
            readonly lapse: Required<Pick<FeedbackBlock, 'explanation' | 'repairPrompt' | 'nearbyExample'>>;
        };
        readonly reviewTargets: readonly Readonly<{
            readonly id: string;
            readonly conceptId: string;
            readonly expression: string;
            readonly meanings: readonly string[];
            readonly sentence: string;
            readonly repairFor: readonly string[];
        }>[];
    };
}

export interface N1SoundDiscriminationResponse {
    readonly answers: readonly Readonly<{ questionId: string; optionId: string }>[];
    readonly production: string;
}

export interface N1SoundDiscriminationReaderSrsProjection {
    readonly readerSurfaceIds: readonly string[];
    readonly miningRequests: readonly MiningRequest[];
}

export interface N1SoundDiscriminationPackage {
    readonly id: 'n1-sound-discrimination-01';
    readonly band: 'N1';
    readonly prerequisites: readonly N1SoundDiscriminationPrerequisite[];
    readonly activity: N1SoundDiscriminationModel;
    readonly readerSrs: N1SoundDiscriminationReaderSrsProjection;
}

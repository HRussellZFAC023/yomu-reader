import type { ActivityModel } from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';
import type { ActivityFeedbackSet } from '../activity-kit/shared';

export const PARTICLE_SIGNAL_MIXER_KIND = 'academy-particle-signal-mixer' as const;

export interface ParticleSignalSourceVisual {
    readonly sourceId: string;
    readonly payloadSha256: string;
    readonly title: string;
    readonly page: 1 | 3;
    readonly url: string;
    readonly sha256: string;
    readonly alt: LocalizedText;
}

export interface ParticleSignalOption {
    readonly id: string;
    readonly label: string;
}

export interface ParticleSignalRound {
    readonly id: string;
    readonly sourceQuestionId: string;
    readonly sourceOrder: 1 | 2 | 3 | 4;
    readonly sourcePage: 1 | 3;
    readonly sourceTask: 1 | 4;
    readonly sourceItem: 1 | 2;
    readonly sourcePrompt: string;
    readonly phraseTail: string;
    readonly options: readonly [ParticleSignalOption, ParticleSignalOption, ParticleSignalOption];
    readonly correctOptionId: string;
    readonly correctParticle: 'を' | 'が';
    readonly answerExpression: string;
    readonly conceptId: string;
    readonly errorTag: string;
    readonly hints: readonly [LocalizedText, LocalizedText, LocalizedText];
}

export interface ParticleSignalMixerResponse {
    readonly signals: readonly Readonly<{
        roundId: string;
        optionId: string;
        particle: 'を' | 'が';
    }>[];
}

export interface ParticleSignalMixerModel extends ActivityModel {
    readonly kind: typeof PARTICLE_SIGNAL_MIXER_KIND;
    readonly responseKind: 'moodle-chapter-22-particle-signal-mixer';
    readonly provenance: {
        readonly packageId: 'l2-l09';
        readonly packageOrder: 36;
        readonly answerVisibility: 'after-attempt';
        readonly moodle: {
            readonly moduleId: 6974657;
            readonly sourceSheets: readonly [ParticleSignalSourceVisual, ParticleSignalSourceVisual];
            readonly audio: {
                readonly status: 'quarantined-unresolved-pairing';
                readonly sourceAudioMembers: 1;
                readonly sourceAudioTracksDelivered: 0;
            };
            readonly answerKeyBasis: 'yomu-derived-transformations-over-verbatim-source-teaching-and-prompts';
        };
        readonly support: {
            readonly minna: {
                readonly reference: 'Minna no Nihongo I · Lesson 22';
                readonly reuse: 'chronology-and-scope-only';
            };
            readonly genki: { readonly crosswalk: '≈ Genki II · L15'; readonly reuse: 'sequence-only' };
        };
    };
    readonly payload: {
        readonly teaching: readonly Readonly<{ title: string; text: string }>[];
        readonly taskHeadings: readonly [string, string];
        readonly rounds: readonly ParticleSignalRound[];
        readonly passScore: 1;
        readonly feedback: ActivityFeedbackSet;
    };
}

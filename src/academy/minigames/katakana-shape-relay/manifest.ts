import type { ActivityModel, FeedbackBlock } from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';

export const KATAKANA_SHAPE_RELAY_KIND = 'academy-katakana-shape-relay' as const;

export interface KatakanaShapeRelayRound {
    readonly id: string;
    readonly sourceCellId: string;
    readonly kana: string;
    readonly conceptId: string;
    readonly reviewSeedId: string;
    readonly errorTag: string;
}

export interface KatakanaShapeRelayModel extends ActivityModel {
    readonly kind: typeof KATAKANA_SHAPE_RELAY_KIND;
    readonly responseKind: 'katakana-audio-relay-placement';
    readonly payload: Readonly<{
        readonly teaching: readonly Readonly<{
            readonly sourceLabel: string;
            readonly pattern: string;
            readonly explanation: LocalizedText;
        }>[];
        readonly sourceVisuals: readonly Readonly<{
            readonly url: string;
            readonly sha256: string;
            readonly label: LocalizedText;
        }>[];
        readonly audioSupport: Readonly<{
            readonly provider: 'canonical-yomu-pronunciation-service';
            readonly sourceAudioStatus: 'not-present-in-moodle-archive';
            readonly role: 'post-instruction-runtime-pronunciation-support';
        }>;
        readonly supportReferences: Readonly<{
            readonly minna: Readonly<{
                readonly reference: 'Minna no Nihongo I, Katakana strand';
                readonly role: 'chronology-map-only';
            }>;
            readonly genki: Readonly<{
                readonly taskId: 'genki-2e:l1-l22:lesson-2-literacy-wb-1';
                readonly payloadSha256: string;
                readonly lineLocus: readonly [number, number];
                readonly role: 'post-instruction-writing-subset-support-only';
            }>;
        }>;
        readonly rounds: readonly KatakanaShapeRelayRound[];
        readonly passScore: number;
        readonly feedback: Readonly<{
            readonly pass: FeedbackBlock;
            readonly lapse: Required<Pick<FeedbackBlock, 'explanation' | 'repairPrompt' | 'nearbyExample'>>;
        }>;
        readonly stationLabel: LocalizedText;
        readonly tileLabel: LocalizedText;
    }>;
}

export interface KatakanaShapeRelayPlacement {
    readonly roundId: string;
    readonly kanaId: string;
}

export interface KatakanaShapeRelayResponse {
    readonly placements: readonly KatakanaShapeRelayPlacement[];
}

import type { ActivityModel, FeedbackBlock } from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';

export const KATAKANA_FINAL_ROW_SHELF_KIND = 'academy-katakana-final-row-shelf' as const;

export type KatakanaFinalRowId = 'ma' | 'ya' | 'ra' | 'wa';

export interface KatakanaFinalRowShelfRound {
    readonly id: string;
    readonly sourceCellId: string;
    readonly kana: string;
    readonly slotId: string;
    readonly conceptId: string;
    readonly reviewSeedId: string;
    readonly errorTag: string;
}

export interface KatakanaFinalRowShelfModel extends ActivityModel {
    readonly kind: typeof KATAKANA_FINAL_ROW_SHELF_KIND;
    readonly responseKind: 'katakana-audio-final-row-shelf';
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
            readonly genki: readonly Readonly<{
                readonly taskId: 'genki-2e:l1-l26:lesson-2-literacy-wb-7' | 'genki-2e:l1-l26:lesson-2-literacy-wb-9:2';
                readonly payloadSha256: string;
                readonly lineLocus: readonly [76, 91];
                readonly role: 'post-instruction-writing-support-only';
            }>[];
        }>;
        readonly shelves: readonly Readonly<{
            readonly id: KatakanaFinalRowId;
            readonly label: LocalizedText;
            readonly slots: readonly Readonly<{ readonly id: string; readonly label: string; }>[];
        }>[];
        readonly rounds: readonly KatakanaFinalRowShelfRound[];
        readonly passScore: number;
        readonly shelfMapLabel: LocalizedText;
        readonly feedback: Readonly<{
            readonly pass: FeedbackBlock;
            readonly lapse: Required<Pick<FeedbackBlock, 'explanation' | 'repairPrompt' | 'nearbyExample'>>;
        }>;
    }>;
}

export interface KatakanaFinalRowShelfAnswer {
    readonly signalId: string;
    readonly slotId: string;
}

export interface KatakanaFinalRowShelfResponse {
    readonly answers: readonly KatakanaFinalRowShelfAnswer[];
}

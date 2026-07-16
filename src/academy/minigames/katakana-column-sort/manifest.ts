import type { ActivityModel, FeedbackBlock } from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';

export const KATAKANA_COLUMN_SORT_KIND = 'academy-katakana-column-sort' as const;

export interface KatakanaColumnSortRound {
    readonly id: string;
    readonly sourceCellId: string;
    readonly kana: string;
    readonly vowelColumnId: string;
    readonly conceptId: string;
    readonly reviewSeedId: string;
    readonly errorTag: string;
}

export interface KatakanaColumnSortColumn {
    readonly id: string;
    readonly label: string;
}

export interface KatakanaColumnSortModel extends ActivityModel {
    readonly kind: typeof KATAKANA_COLUMN_SORT_KIND;
    readonly responseKind: 'katakana-audio-column-sort';
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
        readonly columns: readonly KatakanaColumnSortColumn[];
        readonly rounds: readonly KatakanaColumnSortRound[];
        readonly passScore: number;
        readonly feedback: Readonly<{
            readonly pass: FeedbackBlock;
            readonly lapse: Required<Pick<FeedbackBlock, 'explanation' | 'repairPrompt' | 'nearbyExample'>>;
        }>;
        readonly signalLabel: LocalizedText;
        readonly tileLabel: LocalizedText;
    }>;
}

export interface KatakanaColumnSortPlacement {
    readonly columnId: string;
    readonly kanaId: string;
}

export interface KatakanaColumnSortResponse {
    readonly placements: readonly KatakanaColumnSortPlacement[];
}

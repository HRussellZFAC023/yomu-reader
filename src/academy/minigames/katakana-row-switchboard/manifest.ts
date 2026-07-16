import type { ActivityModel, FeedbackBlock } from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';

export const KATAKANA_ROW_SWITCHBOARD_KIND = 'academy-katakana-row-switchboard' as const;

export type KatakanaSwitchboardRowId = 'na' | 'ha';
export type KatakanaSwitchboardVowelId = 'a' | 'i' | 'u' | 'e' | 'o';

export interface KatakanaRowSwitchboardRound {
    readonly id: string;
    readonly sourceCellId: string;
    readonly kana: string;
    readonly rowId: KatakanaSwitchboardRowId;
    readonly vowelColumnId: KatakanaSwitchboardVowelId;
    readonly conceptId: string;
    readonly reviewSeedId: string;
    readonly errorTag: string;
}

export interface KatakanaRowSwitchboardModel extends ActivityModel {
    readonly kind: typeof KATAKANA_ROW_SWITCHBOARD_KIND;
    readonly responseKind: 'katakana-audio-row-switchboard';
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
                readonly taskId: 'genki-2e:l1-l25:lesson-2-literacy-wb-5';
                readonly payloadSha256: string;
                readonly lineLocus: readonly [76, 93];
                readonly role: 'post-instruction-writing-support-only';
            }>;
        }>;
        readonly rows: readonly Readonly<{ readonly id: KatakanaSwitchboardRowId; readonly label: LocalizedText; }>[];
        readonly columns: readonly Readonly<{ readonly id: KatakanaSwitchboardVowelId; readonly label: string; }>[];
        readonly rounds: readonly KatakanaRowSwitchboardRound[];
        readonly passScore: number;
        readonly switchboardLabel: LocalizedText;
        readonly feedback: Readonly<{
            readonly pass: FeedbackBlock;
            readonly lapse: Required<Pick<FeedbackBlock, 'explanation' | 'repairPrompt' | 'nearbyExample'>>;
        }>;
    }>;
}

export interface KatakanaRowSwitchboardAnswer {
    readonly signalId: string;
    readonly rowId: KatakanaSwitchboardRowId;
    readonly vowelColumnId: KatakanaSwitchboardVowelId;
}

export interface KatakanaRowSwitchboardResponse {
    readonly answers: readonly KatakanaRowSwitchboardAnswer[];
}

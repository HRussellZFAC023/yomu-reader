import type { ActivityModel, FeedbackBlock } from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';

export const KATAKANA_TWO_ROW_AUDIO_ROUTE_KIND = 'academy-katakana-two-row-audio-route' as const;

export interface KatakanaTwoRowAudioRouteRound {
    readonly id: string;
    readonly sourceCellId: string;
    readonly kana: string;
    readonly rowId: 'sa' | 'ta';
    readonly vowelColumnId: 'a' | 'i' | 'u' | 'e' | 'o';
    readonly conceptId: string;
    readonly reviewSeedId: string;
    readonly errorTag: string;
}

export interface KatakanaTwoRowAudioRouteModel extends ActivityModel {
    readonly kind: typeof KATAKANA_TWO_ROW_AUDIO_ROUTE_KIND;
    readonly responseKind: 'katakana-two-row-audio-route';
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
                readonly taskId: 'genki-2e:l1-l24:lesson-2-literacy-wb-3';
                readonly payloadSha256: string;
                readonly lineLocus: readonly [76, 93];
                readonly role: 'post-instruction-writing-support-only';
            }>;
        }>;
        readonly rows: readonly Readonly<{ readonly id: 'sa' | 'ta'; readonly label: LocalizedText; }> [];
        readonly columns: readonly Readonly<{ readonly id: 'a' | 'i' | 'u' | 'e' | 'o'; readonly label: string; }> [];
        readonly rounds: readonly KatakanaTwoRowAudioRouteRound[];
        readonly passScore: number;
        readonly routeLabel: LocalizedText;
        readonly feedback: Readonly<{
            readonly pass: FeedbackBlock;
            readonly lapse: Required<Pick<FeedbackBlock, 'explanation' | 'repairPrompt' | 'nearbyExample'>>;
        }>;
    }>;
}

export interface KatakanaTwoRowAudioRouteAnswer {
    readonly roundId: string;
    readonly cellId: string;
}

export interface KatakanaTwoRowAudioRouteResponse {
    readonly answers: readonly KatakanaTwoRowAudioRouteAnswer[];
}

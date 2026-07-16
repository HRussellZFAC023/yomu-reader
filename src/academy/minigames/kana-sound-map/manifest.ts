import type { ActivityModel, FeedbackBlock } from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';

export const KANA_SOUND_MAP_KIND = 'kana-sound-map' as const;

export const kanaSoundMapManifest = Object.freeze({
    id: 'academy.minigame.kana-sound-map',
    kind: KANA_SOUND_MAP_KIND,
    version: 1,
    content: 'injected',
    evaluation: 'deterministic',
    input: ['audio', 'keyboard', 'touch'] as const,
    reducedMotion: true,
});

export interface KanaSoundMapItem {
    readonly id: string;
    readonly kana: string;
    readonly romaji: string;
    readonly conceptId: string;
    readonly reviewSeedId: string;
    readonly errorTag: string;
}

export interface KanaSoundMapSource {
    readonly sourceId: string;
    readonly role: string;
    readonly runtimeUrl: string;
    readonly sourceSha256: string;
    readonly locus: string;
    readonly answerGate: 'after-attempt';
    readonly storyHook: Readonly<{
        sceneId: string;
        activityId: string;
    }>;
}

export interface KanaSoundMapModel extends ActivityModel {
    readonly kind: typeof KANA_SOUND_MAP_KIND;
    readonly responseKind: 'kana-listening-choice';
    readonly payload: Readonly<{
        items: readonly KanaSoundMapItem[];
        source: KanaSoundMapSource;
        passScore: number;
        feedback: Readonly<{
            pass: FeedbackBlock;
            lapse: Required<Pick<FeedbackBlock, 'explanation' | 'repairPrompt' | 'nearbyExample'>>;
        }>;
        choiceLabel: LocalizedText;
    }>;
}

export interface KanaSoundMapSelection {
    readonly roundId: string;
    readonly kanaId: string;
}

export interface KanaSoundMapResponse {
    readonly selections: readonly KanaSoundMapSelection[];
}

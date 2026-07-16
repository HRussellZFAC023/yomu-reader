import type { ActivityModel, FeedbackBlock, ReviewSeed } from '../../domain/activity-runtime';
import type { LocalizedText } from '../../domain/source-library';

export const PHRASE_KARUTA_KIND = 'phrase-karuta' as const;

export const phraseKarutaManifest = Object.freeze({
    id: 'academy.minigame.phrase-karuta',
    kind: PHRASE_KARUTA_KIND,
    version: 1,
    content: 'injected',
    evaluation: 'deterministic',
    input: ['keyboard', 'touch'] as const,
    reducedMotion: true,
});

export interface PhraseKarutaCard {
    readonly id: string;
    readonly phrase: string;
    readonly conceptId: string;
    readonly reviewSeedId: string;
    readonly reviewContent: ReviewSeed['content'];
}

export interface PhraseKarutaRound {
    readonly id: string;
    readonly cue: LocalizedText;
    readonly correctCardId: string;
    readonly errorTag: string;
}

export interface PhraseKarutaPayload {
    readonly cards: readonly PhraseKarutaCard[];
    readonly rounds: readonly PhraseKarutaRound[];
    readonly passScore: number;
    readonly feedback: Readonly<{
        pass: FeedbackBlock;
        lapse: Required<Pick<FeedbackBlock, 'explanation' | 'repairPrompt' | 'nearbyExample'>>;
    }>;
}

export interface PhraseKarutaModel extends ActivityModel {
    readonly kind: typeof PHRASE_KARUTA_KIND;
    readonly responseKind: 'phrase-karuta';
    readonly payload: PhraseKarutaPayload;
}

export interface PhraseKarutaSelection {
    readonly roundId: string;
    readonly cardId: string;
}

export interface PhraseKarutaResponse {
    readonly selections: readonly PhraseKarutaSelection[];
}

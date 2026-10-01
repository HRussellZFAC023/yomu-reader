import type { JPDBCard, ReaderSettings } from '../app/types';

export type NewTabConcreteSource = Exclude<ReaderSettings['newTabSource'], 'auto'>;

export type NewTabStudyFallback =
    | { kind: 'none' }
    | { kind: 'unconfigured-auto-study' }
    | { kind: 'study-supplement'; minCards: number };

export interface NewTabSourceLoadPlan {
    kind: 'auto-review' | 'explicit-source';
    primarySources: readonly NewTabConcreteSource[];
    studyFallback: NewTabStudyFallback;
}

export function newTabSourceLoadPlan(source: ReaderSettings['newTabSource'], fallbackSupplementMin: number): NewTabSourceLoadPlan {
    if (source === 'auto') {
        return {
            kind: 'auto-review',
            primarySources: ['yomu-local', 'jpdb', 'bunpro', 'wanikani', 'anki'],
            studyFallback: { kind: 'unconfigured-auto-study' },
        };
    }
    return {
        kind: 'explicit-source',
        primarySources: [source],
        studyFallback: source === 'jpdb' || source === 'bunpro' || source === 'wanikani' || source === 'yomu-local' || source === 'dictionary'
            ? { kind: 'study-supplement', minCards: fallbackSupplementMin }
            : { kind: 'none' },
    };
}

/** The Study source whose queue a card came from. */
// fallow-ignore-next-line complexity, code-duplication
export function newTabSourceForCard(card: JPDBCard): NewTabConcreteSource {
    if (card.source === 'anki' || card.reviewSource === 'anki') return 'anki';
    if (card.source === 'bunpro' || card.reviewSource === 'bunpro-api') return 'bunpro';
    if (card.source === 'wanikani' || card.reviewSource === 'wanikani-api') return 'wanikani';
    if (card.source === 'yomu-local' || card.reviewSource === 'yomu-local') return 'yomu-local';
    if (card.source === 'jpdb'
        || card.source === 'jiten'
        || card.reviewSource === 'jpdb-api'
        || card.reviewSource === 'jpdb-live'
        || card.reviewSource === 'jiten-api') {
        return 'jpdb';
    }
    return 'dictionary';
}

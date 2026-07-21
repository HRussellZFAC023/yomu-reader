import type { ReaderSettings } from '../app/types';

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

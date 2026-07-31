import type { LearningTargetGrammarLevelScale } from './types';

/** Shared vocabulary only; each target still owns which levels its rules use. */
export const CEFR_GRAMMAR_LEVEL_SCALE: LearningTargetGrammarLevelScale = Object.freeze({
    id: 'cefr',
    levels: Object.freeze(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']),
});

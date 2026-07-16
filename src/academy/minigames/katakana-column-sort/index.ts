import './style.css';

import type { ActivityPlugin } from '../../domain/activity-runtime';
import { gradeKatakanaColumnSort, katakanaColumnSortReviewSeeds, validateKatakanaColumnSort } from './engine';
import { KATAKANA_COLUMN_SORT_KIND, type KatakanaColumnSortModel, type KatakanaColumnSortResponse } from './manifest';
import { renderKatakanaColumnSort } from './view';

export const katakanaColumnSortPlugin: ActivityPlugin<KatakanaColumnSortModel, KatakanaColumnSortResponse> = {
    kind: KATAKANA_COLUMN_SORT_KIND,
    validate: validateKatakanaColumnSort,
    render: renderKatakanaColumnSort,
    grade: gradeKatakanaColumnSort,
    toReviewSeeds: katakanaColumnSortReviewSeeds,
};

export * from './engine';
export * from './manifest';

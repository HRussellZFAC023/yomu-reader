import './style.css';

import type { ActivityPlugin } from '../../domain/activity-runtime';
import { gradeKatakanaFinalRowShelf, katakanaFinalRowShelfReviewSeeds, validateKatakanaFinalRowShelf } from './engine';
import { KATAKANA_FINAL_ROW_SHELF_KIND, type KatakanaFinalRowShelfModel, type KatakanaFinalRowShelfResponse } from './manifest';
import { renderKatakanaFinalRowShelf } from './view';

export const katakanaFinalRowShelfPlugin: ActivityPlugin<KatakanaFinalRowShelfModel, KatakanaFinalRowShelfResponse> = {
    kind: KATAKANA_FINAL_ROW_SHELF_KIND,
    validate: validateKatakanaFinalRowShelf,
    render: renderKatakanaFinalRowShelf,
    grade: gradeKatakanaFinalRowShelf,
    toReviewSeeds: katakanaFinalRowShelfReviewSeeds,
};

export * from './engine';
export * from './manifest';

import './style.css';

import type { ActivityPlugin } from '../../domain/activity-runtime';
import {
    gradeKanaSoundMap,
    kanaSoundMapReviewSeeds,
    validateKanaSoundMap,
} from './engine';
import {
    KANA_SOUND_MAP_KIND,
    type KanaSoundMapModel,
    type KanaSoundMapResponse,
} from './manifest';
import { renderKanaSoundMap } from './view';

export const kanaSoundMapPlugin: ActivityPlugin<KanaSoundMapModel, KanaSoundMapResponse> = {
    kind: KANA_SOUND_MAP_KIND,
    validate: validateKanaSoundMap,
    render: renderKanaSoundMap,
    grade: gradeKanaSoundMap,
    toReviewSeeds: kanaSoundMapReviewSeeds,
};

export * from './engine';
export * from './manifest';
export { renderKanaSoundMap } from './view';

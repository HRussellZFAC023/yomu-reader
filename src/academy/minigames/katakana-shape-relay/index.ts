import './style.css';

import type { ActivityPlugin } from '../../domain/activity-runtime';
import { gradeKatakanaShapeRelay, katakanaShapeRelayReviewSeeds, validateKatakanaShapeRelay } from './engine';
import { KATAKANA_SHAPE_RELAY_KIND, type KatakanaShapeRelayModel, type KatakanaShapeRelayResponse } from './manifest';
import { renderKatakanaShapeRelay } from './view';

export const katakanaShapeRelayPlugin: ActivityPlugin<KatakanaShapeRelayModel, KatakanaShapeRelayResponse> = {
    kind: KATAKANA_SHAPE_RELAY_KIND,
    validate: validateKatakanaShapeRelay,
    render: renderKatakanaShapeRelay,
    grade: gradeKatakanaShapeRelay,
    toReviewSeeds: katakanaShapeRelayReviewSeeds,
};

export * from './engine';
export * from './manifest';

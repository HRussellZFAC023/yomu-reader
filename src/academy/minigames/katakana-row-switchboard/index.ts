import './style.css';

import type { ActivityPlugin } from '../../domain/activity-runtime';
import { gradeKatakanaRowSwitchboard, katakanaRowSwitchboardReviewSeeds, validateKatakanaRowSwitchboard } from './engine';
import { KATAKANA_ROW_SWITCHBOARD_KIND, type KatakanaRowSwitchboardModel, type KatakanaRowSwitchboardResponse } from './manifest';
import { renderKatakanaRowSwitchboard } from './view';

export const katakanaRowSwitchboardPlugin: ActivityPlugin<KatakanaRowSwitchboardModel, KatakanaRowSwitchboardResponse> = {
    kind: KATAKANA_ROW_SWITCHBOARD_KIND,
    validate: validateKatakanaRowSwitchboard,
    render: renderKatakanaRowSwitchboard,
    grade: gradeKatakanaRowSwitchboard,
    toReviewSeeds: katakanaRowSwitchboardReviewSeeds,
};

export * from './engine';
export * from './manifest';

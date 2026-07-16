import './style.css';

import type { ActivityPlugin } from '../../domain/activity-runtime';
import { gradeKatakanaTwoRowAudioRoute, katakanaTwoRowAudioRouteReviewSeeds, validateKatakanaTwoRowAudioRoute } from './engine';
import { KATAKANA_TWO_ROW_AUDIO_ROUTE_KIND, type KatakanaTwoRowAudioRouteModel, type KatakanaTwoRowAudioRouteResponse } from './manifest';
import { renderKatakanaTwoRowAudioRoute } from './view';

export const katakanaTwoRowAudioRoutePlugin: ActivityPlugin<KatakanaTwoRowAudioRouteModel, KatakanaTwoRowAudioRouteResponse> = {
    kind: KATAKANA_TWO_ROW_AUDIO_ROUTE_KIND,
    validate: validateKatakanaTwoRowAudioRoute,
    render: renderKatakanaTwoRowAudioRoute,
    grade: gradeKatakanaTwoRowAudioRoute,
    toReviewSeeds: katakanaTwoRowAudioRouteReviewSeeds,
};

export * from './engine';
export * from './manifest';

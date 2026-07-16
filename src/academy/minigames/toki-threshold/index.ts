import './style.css';
import type { ActivityPlugin } from '../../domain/activity-runtime';
import { gradeTokiThreshold, tokiThresholdReviewSeeds, validateTokiThreshold } from './engine';
import { TOKI_THRESHOLD_KIND, type TokiThresholdModel, type TokiThresholdResponse } from './manifest';
import { renderTokiThreshold } from './view';

export const tokiThresholdPlugin: ActivityPlugin<TokiThresholdModel, TokiThresholdResponse> = {
    kind: TOKI_THRESHOLD_KIND,
    validate: validateTokiThreshold,
    render: renderTokiThreshold,
    grade: gradeTokiThreshold,
    toReviewSeeds: tokiThresholdReviewSeeds,
};

export * from './engine';
export * from './manifest';

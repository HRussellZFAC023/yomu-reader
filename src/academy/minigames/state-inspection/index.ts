import './style.css';
import type { ActivityPlugin } from '../../domain/activity-runtime';
import { gradeStateInspection, stateInspectionReviewSeeds, validateStateInspection } from './engine';
import { STATE_INSPECTION_KIND, type StateInspectionModel, type StateInspectionResponse } from './manifest';
import { renderStateInspection } from './view';

export const stateInspectionPlugin: ActivityPlugin<StateInspectionModel, StateInspectionResponse> = {
    kind: STATE_INSPECTION_KIND,
    validate: validateStateInspection,
    render: renderStateInspection,
    grade: gradeStateInspection,
    toReviewSeeds: stateInspectionReviewSeeds,
};

export * from './engine';
export * from './manifest';

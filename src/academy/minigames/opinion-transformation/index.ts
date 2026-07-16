import './style.css';
import type { ActivityPlugin } from '../../domain/activity-runtime';
import {
    gradeOpinionTransformation,
    opinionTransformationReviewSeeds,
    validateOpinionTransformation,
} from './engine';
import {
    OPINION_TRANSFORMATION_KIND,
    type OpinionTransformationModel,
    type OpinionTransformationResponse,
} from './manifest';
import { renderOpinionTransformation } from './view';

export const opinionTransformationPlugin: ActivityPlugin<OpinionTransformationModel, OpinionTransformationResponse> = {
    kind: OPINION_TRANSFORMATION_KIND,
    validate: validateOpinionTransformation,
    render: renderOpinionTransformation,
    grade: gradeOpinionTransformation,
    toReviewSeeds: opinionTransformationReviewSeeds,
};

export * from './engine';
export * from './manifest';

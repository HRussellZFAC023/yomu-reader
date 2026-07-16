import './style.css';
import type { ActivityPlugin } from '../../domain/activity-runtime';
import { gradeOccasionRoute, occasionRouteReviewSeeds, validateOccasionRoute } from './engine';
import { OCCASION_ROUTE_KIND, type OccasionRouteModel, type OccasionRouteResponse } from './manifest';
import { renderOccasionRoute } from './view';

export const occasionRoutePlugin: ActivityPlugin<OccasionRouteModel, OccasionRouteResponse> = {
    kind: OCCASION_ROUTE_KIND,
    validate: validateOccasionRoute,
    render: renderOccasionRoute,
    grade: gradeOccasionRoute,
    toReviewSeeds: occasionRouteReviewSeeds,
};

export * from './engine';
export * from './manifest';

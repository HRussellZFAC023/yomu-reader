import './style.css';
import type { ActivityPlugin } from '../../domain/activity-runtime';
import { clauseRailReviewSeeds, gradeClauseRail, validateClauseRail } from './engine';
import { CLAUSE_RAIL_KIND, type ClauseRailModel, type ClauseRailResponse } from './manifest';
import { renderClauseRail } from './view';

export const clauseRailPlugin: ActivityPlugin<ClauseRailModel, ClauseRailResponse> = {
    kind: CLAUSE_RAIL_KIND,
    validate: validateClauseRail,
    render: renderClauseRail,
    grade: gradeClauseRail,
    toReviewSeeds: clauseRailReviewSeeds,
};

export * from './engine';
export * from './manifest';

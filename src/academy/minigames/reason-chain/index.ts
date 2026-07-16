import './style.css';
import type { ActivityPlugin } from '../../domain/activity-runtime';
import { gradeReasonChain, reasonChainReviewSeeds, validateReasonChain } from './engine';
import { REASON_CHAIN_KIND, type ReasonChainModel, type ReasonChainResponse } from './manifest';
import { renderReasonChain } from './view';

export const reasonChainPlugin: ActivityPlugin<ReasonChainModel, ReasonChainResponse> = {
    kind: REASON_CHAIN_KIND,
    validate: validateReasonChain,
    render: renderReasonChain,
    grade: gradeReasonChain,
    toReviewSeeds: reasonChainReviewSeeds,
};

export * from './engine';
export * from './manifest';

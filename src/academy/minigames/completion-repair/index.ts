import '../state-inspection/style.css';
import type { ActivityPlugin } from '../../domain/activity-runtime';
import { completionRepairReviewSeeds, gradeCompletionRepair, validateCompletionRepair } from './engine';
import { COMPLETION_REPAIR_KIND, type CompletionRepairModel, type CompletionRepairResponse } from './manifest';
import { renderCompletionRepair } from './view';

export const completionRepairPlugin: ActivityPlugin<CompletionRepairModel, CompletionRepairResponse> = {
    kind: COMPLETION_REPAIR_KIND,
    validate: validateCompletionRepair,
    render: renderCompletionRepair,
    grade: gradeCompletionRepair,
    toReviewSeeds: completionRepairReviewSeeds,
};

export * from './engine';
export * from './manifest';

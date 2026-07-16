import './style.css';
import type { ActivityPlugin } from '../../domain/activity-runtime';
import { gradeNagaraWorkshop, nagaraWorkshopReviewSeeds, validateNagaraWorkshop } from './engine';
import { NAGARA_WORKSHOP_KIND, type NagaraWorkshopModel, type NagaraWorkshopResponse } from './manifest';
import { renderNagaraWorkshop } from './view';

export const nagaraWorkshopPlugin: ActivityPlugin<NagaraWorkshopModel, NagaraWorkshopResponse> = {
    kind: NAGARA_WORKSHOP_KIND,
    validate: validateNagaraWorkshop,
    render: renderNagaraWorkshop,
    grade: gradeNagaraWorkshop,
    toReviewSeeds: nagaraWorkshopReviewSeeds,
};

export * from './engine';
export * from './manifest';

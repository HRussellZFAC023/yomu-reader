import './style.css';
import type { ActivityPlugin } from '../../domain/activity-runtime';
import { confirmationSignalReviewSeeds, gradeConfirmationSignal, validateConfirmationSignal } from './engine';
import { CONFIRMATION_SIGNAL_KIND, type ConfirmationSignalModel, type ConfirmationSignalResponse } from './manifest';
import { renderConfirmationSignal } from './view';

export const confirmationSignalPlugin: ActivityPlugin<ConfirmationSignalModel, ConfirmationSignalResponse> = {
    kind: CONFIRMATION_SIGNAL_KIND,
    validate: validateConfirmationSignal,
    render: renderConfirmationSignal,
    grade: gradeConfirmationSignal,
    toReviewSeeds: confirmationSignalReviewSeeds,
};

export * from './engine';
export * from './manifest';

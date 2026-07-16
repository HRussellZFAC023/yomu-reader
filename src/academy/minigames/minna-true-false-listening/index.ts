import './style.css';

import type { ActivityPlugin } from '../../domain/activity-runtime';
import {
    gradeMinnaTrueFalseListening,
    minnaTrueFalseListeningReviewSeeds,
    validateMinnaTrueFalseListening,
} from './engine';
import {
    MINNA_TRUE_FALSE_LISTENING_KIND,
    type MinnaTrueFalseListeningModel,
    type MinnaTrueFalseListeningResponse,
} from './manifest';
import { renderMinnaTrueFalseListening } from './view';

export const minnaTrueFalseListeningPlugin: ActivityPlugin<MinnaTrueFalseListeningModel, MinnaTrueFalseListeningResponse> = {
    kind: MINNA_TRUE_FALSE_LISTENING_KIND,
    validate: validateMinnaTrueFalseListening,
    render: renderMinnaTrueFalseListening,
    grade: gradeMinnaTrueFalseListening,
    toReviewSeeds: minnaTrueFalseListeningReviewSeeds,
};

export * from './engine';
export * from './manifest';

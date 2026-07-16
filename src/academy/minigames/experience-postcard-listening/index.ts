import './style.css';

import type { ActivityPlugin } from '../../domain/activity-runtime';
import { experiencePostcardListeningReviewSeeds, gradeExperiencePostcardListening, validateExperiencePostcardListening } from './engine';
import { EXPERIENCE_POSTCARD_LISTENING_KIND, type ExperiencePostcardListeningModel, type ExperiencePostcardListeningResponse } from './manifest';
import { renderExperiencePostcardListening } from './view';

export const experiencePostcardListeningPlugin: ActivityPlugin<ExperiencePostcardListeningModel, ExperiencePostcardListeningResponse> = {
    kind: EXPERIENCE_POSTCARD_LISTENING_KIND,
    validate: validateExperiencePostcardListening,
    render: renderExperiencePostcardListening,
    grade: gradeExperiencePostcardListening,
    toReviewSeeds: experiencePostcardListeningReviewSeeds,
};

export * from './engine';
export * from './manifest';

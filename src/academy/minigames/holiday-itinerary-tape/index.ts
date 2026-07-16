import './style.css';

import type { ActivityPlugin } from '../../domain/activity-runtime';
import { gradeHolidayItineraryTape, holidayItineraryTapeReviewSeeds, validateHolidayItineraryTape } from './engine';
import { HOLIDAY_ITINERARY_TAPE_KIND, type HolidayItineraryTapeModel, type HolidayItineraryTapeResponse } from './manifest';
import { renderHolidayItineraryTape } from './view';

export const holidayItineraryTapePlugin: ActivityPlugin<HolidayItineraryTapeModel, HolidayItineraryTapeResponse> = {
    kind: HOLIDAY_ITINERARY_TAPE_KIND,
    validate: validateHolidayItineraryTape,
    render: renderHolidayItineraryTape,
    grade: gradeHolidayItineraryTape,
    toReviewSeeds: holidayItineraryTapeReviewSeeds,
};

export * from './engine';
export * from './manifest';

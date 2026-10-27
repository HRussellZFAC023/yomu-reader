import type { WorldPlaceId } from './world-locations';

function academyDayNumber(dayId: string): number | undefined {
    const match = /^day:([1-9]\d*)$/.exec(dayId);
    if (!match) return undefined;
    const day = Number(match[1]);
    return Number.isSafeInteger(day) ? day : undefined;
}

/** The calendar advances from durable day-closure evidence and has no authored maximum. */
export function currentAcademyDayNumber(closedDays: Readonly<Record<string, unknown>>): number {
    const latest = Object.keys(closedDays)
        .map(academyDayNumber)
        .filter((day): day is number => day !== undefined)
        .reduce((maximum, day) => Math.max(maximum, day), 0);
    return latest + 1;
}

const DAY_ONE_WORLD_PLACE_IDS: readonly WorldPlaceId[] = Object.freeze([
    'courtyard',
    'classroom',
    'library',
    'home',
]);

const DAY_ONE_WORLD_PRACTICE_IDS = new Set([
    'courtyard-notice-look',
    'courtyard-notice-write',
    'classroom-board-understanding',
    'classroom-board-confirmation',
]);

export function worldPlaceAvailableOnAcademyDay(place: WorldPlaceId, dayNumber: number): boolean {
    return dayNumber > 1 || DAY_ONE_WORLD_PLACE_IDS.includes(place);
}

export function worldPracticeAvailableOnAcademyDay(
    _place: WorldPlaceId,
    practiceId: string,
    dayNumber: number,
): boolean {
    return dayNumber > 1 || DAY_ONE_WORLD_PRACTICE_IDS.has(practiceId);
}

import type { FoundationLesson } from './foundation-course';
import type { FoundationSection } from './foundation-player';
import { ACADEMY_CAST, castAtSpot, type CampusSpot } from './cast';

export type CampusTimeOfDay = 'morning' | 'afternoon' | 'evening' | 'night';
export type CampusWeather = 'clear' | 'cloudy' | 'rain' | 'snow';
export type CampusActionKind = 'scene' | 'learn' | 'review' | 'write' | 'social';
export type CampusUrgency = 'none' | 'low' | 'high';

export interface CampusLoopInput {
    readonly activeLesson: FoundationLesson;
    readonly unlockedCharacterIds: readonly string[];
    readonly dueReviewCount: number;
    readonly completedSections: readonly FoundationSection[];
    readonly timeOfDay: CampusTimeOfDay;
    readonly weather: CampusWeather;
}

export interface CampusLocationChoice {
    readonly id: CampusSpot;
    readonly label: string;
    readonly japaneseCue: string;
    readonly note: string;
    readonly available: boolean;
    readonly urgency: CampusUrgency;
    readonly characterIds: readonly string[];
    readonly actionKind: CampusActionKind;
}

interface LocationRecipe {
    readonly id: CampusSpot;
    readonly label: string;
    readonly japaneseCue: string;
    readonly actionKind: CampusActionKind;
    readonly note: string;
    readonly weather?: CampusWeather;
    readonly times?: readonly CampusTimeOfDay[];
}

const LOCATION_RECIPES: readonly LocationRecipe[] = [
    { id: 'classroom', label: 'Classroom', japaneseCue: '教室', actionKind: 'scene', note: 'Continue the lesson scene.' },
    { id: 'library', label: 'Library', japaneseCue: '図書館', actionKind: 'review', note: 'Bring older words back into focus.' },
    { id: 'lab', label: 'Language lab', japaneseCue: 'ラボ', actionKind: 'learn', note: 'Work through the next lesson section.' },
    { id: 'studio', label: 'Writing studio', japaneseCue: '書く場所', actionKind: 'write', note: 'Shape the lesson idea into your own words.' },
    { id: 'cafe', label: 'Cafe', japaneseCue: 'カフェ', actionKind: 'social', note: 'A classmate is taking a study break.', times: ['afternoon', 'evening'] },
    { id: 'quad', label: 'Main quad', japaneseCue: '広場', actionKind: 'social', note: 'Find someone between classes.', weather: 'clear' },
    { id: 'garden', label: 'Garden', japaneseCue: '庭', actionKind: 'social', note: 'A quieter place to talk.', weather: 'clear', times: ['morning', 'afternoon'] },
    { id: 'ramen', label: 'Ramen counter', japaneseCue: 'ラーメン', actionKind: 'social', note: 'Someone is ready to talk over noodles.', times: ['evening', 'night'] },
    { id: 'pub', label: 'Pub', japaneseCue: 'パブ', actionKind: 'social', note: 'Talk through the day together.', times: ['evening', 'night'] },
    { id: 'gym', label: 'Gym', japaneseCue: 'ジム', actionKind: 'social', note: 'A classmate is between activities.', times: ['afternoon', 'evening'] },
    { id: 'konbini', label: 'Konbini', japaneseCue: 'コンビニ', actionKind: 'social', note: 'A useful little stop on the way home.', times: ['evening', 'night'] },
    { id: 'station', label: 'Station', japaneseCue: '駅', actionKind: 'scene', note: 'Revisit the lesson route and its practical language.' },
];

function castIdForLessonSpeaker(name: string): string | undefined {
    const key = name.toLowerCase().replace(/[^a-z]/g, '').replace(/sensei$/, '');
    return ACADEMY_CAST.find(member => member.name.toLowerCase().replace(/[^a-z]/g, '') === key)?.id;
}

function lessonCastIds(lesson: FoundationLesson): readonly string[] {
    return lesson.cast.map(castIdForLessonSpeaker).filter((id): id is string => Boolean(id));
}

function urgencyFor(actionKind: CampusActionKind, dueReviewCount: number, completed: ReadonlySet<FoundationSection>): CampusUrgency {
    if (actionKind === 'review') return dueReviewCount > 0 ? 'high' : 'none';
    if (actionKind === 'write') return completed.has('mission') ? 'none' : 'low';
    if (actionKind === 'learn') return completed.has('scene') ? 'low' : 'none';
    return 'none';
}

function score(choice: CampusLocationChoice, input: CampusLoopInput): number {
    let value = 0;
    if (choice.urgency === 'high') value += 100;
    if (choice.urgency === 'low') value += 20;
    if (choice.actionKind === 'scene' && !input.completedSections.includes('scene')) value += 60;
    if (choice.actionKind === 'learn' && !input.completedSections.includes('grammar')) value += 25;
    if (choice.characterIds.length > 0) value += 10 + choice.characterIds.length;
    if (input.weather === 'rain' && ['library', 'classroom', 'lab', 'studio', 'cafe'].includes(choice.id)) value += 12;
    if (input.weather === 'rain' && ['quad', 'garden'].includes(choice.id)) value -= 30;
    if (input.timeOfDay === 'night' && ['ramen', 'pub', 'konbini'].includes(choice.id)) value += 18;
    return value;
}

export function buildCampusLoop(input: CampusLoopInput): readonly CampusLocationChoice[] {
    const completed = new Set(input.completedSections);
    const unlocked = new Set(input.unlockedCharacterIds);
    const lessonIds = new Set(lessonCastIds(input.activeLesson));

    const choices = LOCATION_RECIPES.map(recipe => {
        const residentIds = castAtSpot(recipe.id)
            .filter(member => unlocked.has(member.id))
            .filter(member => lessonIds.has(member.id) || recipe.actionKind === 'social')
            .map(member => member.id);
        const timeFits = !recipe.times || recipe.times.includes(input.timeOfDay);
        const weatherFits = !recipe.weather || recipe.weather === input.weather;
        const available = recipe.actionKind !== 'social' || (residentIds.length > 0 && timeFits && weatherFits);
        const urgency = urgencyFor(recipe.actionKind, Math.max(0, input.dueReviewCount), completed);
        return {
            id: recipe.id,
            label: recipe.label,
            japaneseCue: recipe.japaneseCue,
            note: recipe.note,
            available,
            urgency,
            characterIds: residentIds,
            actionKind: recipe.actionKind,
        } satisfies CampusLocationChoice;
    });

    return choices
        .sort((left, right) => score(right, input) - score(left, input))
        .filter((choice, index, all) => index === 0 || choice.id !== all[index - 1].id);
}

export const campusLoop = buildCampusLoop;

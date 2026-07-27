import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    academyDayId,
    academyDayIsProductionComplete,
    academyDayNumber,
    currentAcademyDayNumber,
    DAY_CLOSURE_DIMENSIONS,
    DAY_ONE_AVAILABILITY_MANIFEST,
    DAY_ONE_CLASSROOM_EXPRESSION_IDS,
    DAY_ONE_WORLD_PLACE_IDS,
    dayDeliveryGaps,
    validateAcademyDayAvailabilityManifest,
    worldPlaceAvailableOnAcademyDay,
    worldPracticeAvailableOnAcademyDay,
    type DayActivityCategory,
    type DayAvailabilityMode,
} from '../../src/academy/domain/day-availability';
import { projectWorldPlace, WORLD_PLACE_IDS, type WorldProgress } from '../../src/academy/domain/world-locations';

const EMPTY_PROGRESS: WorldProgress = {
    completedScenes: [],
    completedEncounterIds: [],
    currentDay: 1,
    metCharacterIds: [],
    worldVisits: {},
    seenIntroductions: [],
};

describe('unbounded Academy day availability', () => {
    it('uses positive stable day ids without an authored upper cap', () => {
        expect(academyDayId(1)).toBe('day:1');
        expect(academyDayId(Number.MAX_SAFE_INTEGER)).toBe(`day:${Number.MAX_SAFE_INTEGER}`);
        expect(academyDayNumber('day:200')).toBe(200);
        expect(academyDayNumber('day:0')).toBeUndefined();
        expect(() => academyDayId(0)).toThrow(/positive safe integers/i);
        expect(currentAcademyDayNumber({})).toBe(1);
        expect(currentAcademyDayNumber({ 'day:1': {}, 'day:73': {}, invalid: {} })).toBe(74);
    });

    it('defines a structurally complete Day 1 production manifest', () => {
        expect(validateAcademyDayAvailabilityManifest(DAY_ONE_AVAILABILITY_MANIFEST)).toEqual([]);
        expect(DAY_ONE_AVAILABILITY_MANIFEST.dayId).toBe('day:1');
        expect(DAY_ONE_AVAILABILITY_MANIFEST.entries.length).toBeGreaterThan(40);

        const categories = new Set(DAY_ONE_AVAILABILITY_MANIFEST.entries.map(entry => entry.category));
        const requiredCategories: readonly DayActivityCategory[] = [
            'enrollment', 'story', 'lesson', 'study', 'review', 'world', 'exploration',
            'social', 'bond', 'minigame', 'one-off', 'prop', 'wiki', 'account',
            'accessibility', 'offline', 'evening',
        ];
        requiredCategories.forEach(category => expect(categories).toContain(category));

        const modes = new Set(DAY_ONE_AVAILABILITY_MANIFEST.entries.flatMap(entry => entry.modes));
        const requiredModes: readonly DayAvailabilityMode[] = [
            'required', 'optional', 'revisitable', 'repeatable',
            'one-off', 'accessibility', 'online', 'offline',
        ];
        requiredModes.forEach(mode => expect(modes).toContain(mode));

        DAY_ONE_AVAILABILITY_MANIFEST.entries.forEach(entry => {
            expect(entry.route.route).toBeTruthy();
            expect(entry.contentIds.length).toBeGreaterThan(0);
            expect(entry.persistenceEvidence).not.toHaveLength(0);
            expect(entry.journeyEvidence).not.toHaveLength(0);
            expect(Object.keys(entry.delivery).sort()).toEqual([...DAY_CLOSURE_DIMENSIONS].sort());
        });
    });

    it('covers every canonical Lesson 0 activity and all fourteen classroom expressions', () => {
        const source = JSON.parse(readFileSync(
            'public/academy/content/lessons/lesson-zero.v1.json',
            'utf8',
        )) as { lesson: { activities: readonly { id: string }[] } };
        const sourceActivityIds = source.lesson.activities.map(activity => activity.id).sort();
        const manifestActivityIds = DAY_ONE_AVAILABILITY_MANIFEST.entries
            .filter(entry => entry.id.startsWith('day:1:lesson-zero:'))
            .map(entry => entry.contentIds[0]!)
            .sort();
        expect(manifestActivityIds).toEqual(sourceActivityIds);

        const classroom = DAY_ONE_AVAILABILITY_MANIFEST.entries
            .find(entry => entry.id === 'day:1:classroom-expressions');
        expect(classroom?.contentIds.filter(id => id.startsWith('expression:')))
            .toEqual(DAY_ONE_CLASSROOM_EXPRESSION_IDS);
    });

    it('keeps canonical Lesson 0 delivery ids stable when new activities are inserted', () => {
        const rowIdByActivityId = Object.fromEntries(DAY_ONE_AVAILABILITY_MANIFEST.entries
            .filter(entry => entry.category === 'lesson' && entry.contentIds.length === 1)
            .map(entry => [entry.contentIds[0], entry.id]));

        expect(rowIdByActivityId).toMatchObject({
            'activity:lesson-zero-greet-rie': 'day:1:lesson-zero:01',
            'activity:lesson-zero-vowel-listen': 'day:1:lesson-zero:02',
            'activity:lesson-zero-hiragana-bootcamp': 'day:1:lesson-zero:hiragana-bootcamp',
            'activity:lesson-zero-vowel-doodle': 'day:1:lesson-zero:03',
            'activity:lesson-zero-follow-instructions': 'day:1:lesson-zero:04',
            'activity:lesson-zero-reconstruct-repair': 'day:1:lesson-zero:05',
            'activity:lesson-zero-desk-language': 'day:1:lesson-zero:06',
            'activity:lesson-zero-build-sentence-frames': 'day:1:lesson-zero:07',
            'activity:lesson-zero-name-card-draft': 'day:1:lesson-zero:08',
            'activity:lesson-zero-close-room': 'day:1:lesson-zero:18',
        });
    });

    it('cannot call the day complete while any available activity lacks proof', () => {
        const gaps = dayDeliveryGaps(DAY_ONE_AVAILABILITY_MANIFEST);
        const deliveryStates = DAY_ONE_AVAILABILITY_MANIFEST.entries
            .flatMap(entry => Object.values(entry.delivery));
        expect(gaps.length).toBeGreaterThan(0);
        expect(gaps.length).toBeLessThan(DAY_ONE_AVAILABILITY_MANIFEST.entries.length * DAY_CLOSURE_DIMENSIONS.length);
        expect(deliveryStates.filter(state => state === 'verified')).toHaveLength(147);
        expect(deliveryStates.filter(state => state === 'partial')).toHaveLength(3);
        expect(deliveryStates.filter(state => state === 'unverified')).toHaveLength(115);
        expect(DAY_ONE_AVAILABILITY_MANIFEST.entries.filter(entry =>
            Object.values(entry.delivery).every(state => state === 'verified'))).toHaveLength(29);
        expect(DAY_ONE_AVAILABILITY_MANIFEST.entries.find(entry =>
            entry.id === 'day:1:access')?.delivery).toEqual({
            implementation: 'verified',
            reachability: 'verified',
            media: 'verified',
            persistence: 'verified',
            journeyProof: 'verified',
        });
        expect(DAY_ONE_AVAILABILITY_MANIFEST.entries.find(entry =>
            entry.id === 'day:1:account-link')?.delivery).toEqual({
            implementation: 'verified',
            reachability: 'verified',
            media: 'verified',
            persistence: 'verified',
            journeyProof: 'verified',
        });
        expect(DAY_ONE_AVAILABILITY_MANIFEST.entries.find(entry =>
            entry.id === 'day:1:offline-entry')?.delivery).toEqual({
            implementation: 'verified',
            reachability: 'verified',
            media: 'verified',
            persistence: 'verified',
            journeyProof: 'verified',
        });
        expect(DAY_ONE_AVAILABILITY_MANIFEST.entries.find(entry =>
            entry.id === 'day:1:profile')?.delivery).toEqual({
            implementation: 'verified',
            reachability: 'verified',
            media: 'verified',
            persistence: 'verified',
            journeyProof: 'verified',
        });
        expect(DAY_ONE_AVAILABILITY_MANIFEST.entries.find(entry =>
            entry.id === 'day:1:rie-introduction')?.delivery).toEqual({
            implementation: 'verified',
            reachability: 'verified',
            media: 'verified',
            persistence: 'verified',
            journeyProof: 'verified',
        });
        expect(DAY_ONE_AVAILABILITY_MANIFEST.entries.find(entry =>
            entry.id === 'day:1:start-choice')?.delivery).toEqual({
            implementation: 'verified',
            reachability: 'verified',
            media: 'verified',
            persistence: 'verified',
            journeyProof: 'verified',
        });
        expect(DAY_ONE_AVAILABILITY_MANIFEST.entries.find(entry =>
            entry.id === 'day:1:manual-band')?.delivery).toEqual({
            implementation: 'verified',
            reachability: 'verified',
            media: 'verified',
            persistence: 'verified',
            journeyProof: 'verified',
        });
        expect(DAY_ONE_AVAILABILITY_MANIFEST.entries.find(entry =>
            entry.id === 'day:1:placement')?.delivery).toEqual({
            implementation: 'verified',
            reachability: 'verified',
            media: 'verified',
            persistence: 'verified',
            journeyProof: 'verified',
        });
        expect(DAY_ONE_AVAILABILITY_MANIFEST.entries.find(entry =>
            entry.contentIds.includes('activity:lesson-zero-sound-input'))?.delivery).toEqual({
            implementation: 'verified',
            reachability: 'verified',
            media: 'verified',
            persistence: 'verified',
            journeyProof: 'verified',
        });
        expect(DAY_ONE_AVAILABILITY_MANIFEST.entries.find(entry =>
            entry.id === 'day:1:blank-atlas')?.delivery).toEqual({
            implementation: 'verified',
            reachability: 'verified',
            media: 'verified',
            persistence: 'verified',
            journeyProof: 'verified',
        });
        [
            'activity:lesson-zero-text-input',
            'activity:lesson-zero-speaking-input',
            'activity:lesson-zero-read-name-cards',
            'activity:lesson-zero-write-name-card',
            'activity:lesson-zero-sound-transfer',
            'activity:lesson-zero-text-transfer',
            'activity:lesson-zero-speaking-transfer',
            'activity:lesson-zero-written-transfer',
            'activity:lesson-zero-close-room',
        ].forEach(activityId => {
            expect(DAY_ONE_AVAILABILITY_MANIFEST.entries.find(entry =>
                entry.contentIds.includes(activityId))?.delivery).toEqual({
                implementation: 'verified',
                reachability: 'verified',
                media: 'verified',
                persistence: 'verified',
                journeyProof: 'verified',
            });
        });
        expect(DAY_ONE_AVAILABILITY_MANIFEST.entries.find(entry =>
            entry.contentIds.includes('activity:lesson-zero-greet-rie'))?.delivery).toEqual({
            implementation: 'verified',
            reachability: 'verified',
            media: 'verified',
            persistence: 'verified',
            journeyProof: 'verified',
        });
        expect(DAY_ONE_AVAILABILITY_MANIFEST.entries.find(entry =>
            entry.contentIds.includes('activity:lesson-zero-vowel-listen'))?.delivery).toEqual({
            implementation: 'verified',
            reachability: 'verified',
            media: 'verified',
            persistence: 'verified',
            journeyProof: 'verified',
        });
        expect(DAY_ONE_AVAILABILITY_MANIFEST.entries.find(entry =>
            entry.contentIds.includes('activity:lesson-zero-vowel-doodle'))?.delivery).toEqual({
            implementation: 'verified',
            reachability: 'verified',
            media: 'verified',
            persistence: 'verified',
            journeyProof: 'verified',
        });
        expect(DAY_ONE_AVAILABILITY_MANIFEST.entries.find(entry =>
            entry.contentIds.includes('activity:lesson-zero-follow-instructions'))?.delivery).toEqual({
            implementation: 'verified',
            reachability: 'verified',
            media: 'verified',
            persistence: 'verified',
            journeyProof: 'verified',
        });
        expect(DAY_ONE_AVAILABILITY_MANIFEST.entries.find(entry =>
            entry.contentIds.includes('activity:lesson-zero-reconstruct-repair'))?.delivery).toEqual({
            implementation: 'verified',
            reachability: 'verified',
            media: 'verified',
            persistence: 'verified',
            journeyProof: 'verified',
        });
        expect(DAY_ONE_AVAILABILITY_MANIFEST.entries.find(entry =>
            entry.contentIds.includes('activity:lesson-zero-desk-language'))?.delivery).toEqual({
            implementation: 'verified',
            reachability: 'verified',
            media: 'verified',
            persistence: 'verified',
            journeyProof: 'verified',
        });
        expect(DAY_ONE_AVAILABILITY_MANIFEST.entries.find(entry =>
            entry.contentIds.includes('activity:lesson-zero-build-sentence-frames'))?.delivery).toEqual({
            implementation: 'verified',
            reachability: 'verified',
            media: 'verified',
            persistence: 'verified',
            journeyProof: 'verified',
        });
        expect(DAY_ONE_AVAILABILITY_MANIFEST.entries.find(entry =>
            entry.contentIds.includes('activity:lesson-zero-name-card-draft'))?.delivery).toEqual({
            implementation: 'verified',
            reachability: 'partial',
            media: 'partial',
            persistence: 'verified',
            journeyProof: 'partial',
        });
        expect(DAY_ONE_AVAILABILITY_MANIFEST.entries.find(entry =>
            entry.contentIds.includes('game:lesson-zero-vowel-listening-bingo'))?.delivery).toEqual({
            implementation: 'verified',
            reachability: 'verified',
            media: 'verified',
            persistence: 'verified',
            journeyProof: 'verified',
        });
        expect(academyDayIsProductionComplete(DAY_ONE_AVAILABILITY_MANIFEST)).toBe(false);
    });
});

describe('Day 1 world chronology', () => {
    it('opens only the intended Day 1 world and leaves later locations locked', () => {
        const open = WORLD_PLACE_IDS.filter(place => worldPlaceAvailableOnAcademyDay(place, 1));
        expect(open).toEqual(DAY_ONE_WORLD_PLACE_IDS);
        expect(WORLD_PLACE_IDS.every(place => worldPlaceAvailableOnAcademyDay(place, 2))).toBe(true);

        expect(projectWorldPlace('courtyard', EMPTY_PROGRESS).availability.state).toBe('open');
        expect(projectWorldPlace('classroom', EMPTY_PROGRESS).availability.state).toBe('open');
        expect(projectWorldPlace('library', EMPTY_PROGRESS).availability.state).toBe('open');
        expect(projectWorldPlace('home', EMPTY_PROGRESS).availability.state).toBe('open');
        expect(projectWorldPlace('cafe', EMPTY_PROGRESS).availability.state).toBe('locked');
        expect(projectWorldPlace('ramen', EMPTY_PROGRESS).availability.state).toBe('locked');
    });

    it('keeps later grammar out of a Day 1 threshold while retaining first-day practice', () => {
        expect(projectWorldPlace('library', EMPTY_PROGRESS).practice).toBeUndefined();
        expect(projectWorldPlace('home', EMPTY_PROGRESS).practice).toBeUndefined();
        expect(projectWorldPlace('courtyard', EMPTY_PROGRESS).practice?.id).toBe('courtyard-notice-look');
        expect(projectWorldPlace('classroom', EMPTY_PROGRESS).practice?.id).toBe('classroom-board-understanding');
        expect(worldPracticeAvailableOnAcademyDay('library', 'library-dictionary-location', 1)).toBe(false);
        expect(worldPracticeAvailableOnAcademyDay('library', 'library-dictionary-location', 2)).toBe(true);
    });

    it('uses the durable calendar day instead of guessing from completed scene count', () => {
        const manyScenes: WorldProgress = {
            ...EMPTY_PROGRESS,
            completedScenes: Array.from({ length: 100 }, (_, index) => `scene:${index}`),
        };
        expect(projectWorldPlace('cafe', manyScenes).availability.state).toBe('locked');
        expect(projectWorldPlace('cafe', { ...manyScenes, currentDay: 2 }).availability.state).toBe('open');
        expect(projectWorldPlace('courtyard', manyScenes).moment.en).toContain('Day 1');
        expect(projectWorldPlace('courtyard', { ...manyScenes, currentDay: 200 }).moment.en).toContain('Day 200');
    });
});

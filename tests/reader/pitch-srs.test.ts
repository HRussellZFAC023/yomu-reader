import { describe, expect, it } from 'vitest';

import type { JPDBCard } from '../../src/reader/app/types';
import { pitchPatternFromPosition } from '../../src/reader/lookup/pitch-accent';
import {
    createPitchItem,
    isPitchItemDue,
    pitchAccuracyByClass,
    pitchItemKey,
    pitchSeedFromCard,
    schedulePitchItem,
    selectPitchSessionPool,
    type PitchHistoryEntry,
    type PitchSrsItem,
} from '../../src/reader/newtab/pitch-srs';

const NOW = 1_000_000_000_000;
const DAY = 86_400_000;

function newItem(overrides: Partial<PitchSrsItem> = {}): PitchSrsItem {
    return {
        ...createPitchItem({ reading: 'はし', pitchNumber: 1, pattern: 'HLL', pitchClass: 'atamadaka', displaySpelling: '箸', now: NOW }),
        ...overrides,
    };
}

describe('schedulePitchItem', () => {
    it('graduates okay/pass through the 1 -> 3 -> ease ladder', () => {
        let item = newItem();
        item = schedulePitchItem(item, 'okay', NOW);
        expect(item.reps).toBe(1);
        expect(item.intervalDays).toBe(1);
        expect(item.due).toBe(NOW + DAY);

        item = schedulePitchItem(item, 'pass', NOW);
        expect(item.reps).toBe(2);
        expect(item.intervalDays).toBe(3);

        item = schedulePitchItem(item, 'okay', NOW);
        expect(item.reps).toBe(3);
        expect(item.intervalDays).toBe(Math.round(3 * 2.5)); // prevInterval * ease
    });

    it('boosts ease and interval on easy, lowers on hard', () => {
        const easy = schedulePitchItem(newItem(), 'easy', NOW);
        expect(easy.ease).toBeCloseTo(2.65, 5);
        expect(easy.intervalDays).toBeGreaterThanOrEqual(1);

        const hard = schedulePitchItem(newItem({ reps: 2, intervalDays: 5 }), 'hard', NOW);
        expect(hard.ease).toBeCloseTo(2.45, 5);
        expect(hard.reps).toBe(3); // hard still counts as a passing rep (stays out of the "new" bucket)
        expect(hard.intervalDays).toBe(6); // round(5 * 1.2)
    });

    it('resets and re-dues in ~1 minute on a lapse, lowering ease', () => {
        for (const grade of ['fail', 'nothing', 'something'] as const) {
            const lapsed = schedulePitchItem(newItem({ reps: 4, intervalDays: 20, ease: 2.5 }), grade, NOW);
            expect(lapsed.reps).toBe(0);
            expect(lapsed.intervalDays).toBe(0);
            expect(lapsed.lapses).toBe(1);
            expect(lapsed.ease).toBeCloseTo(2.3, 5);
            expect(lapsed.due).toBe(NOW + 60_000);
        }
    });

    it('clamps ease to [1.3, 2.8]', () => {
        let item = newItem({ ease: 1.35 });
        item = schedulePitchItem(item, 'nothing', NOW); // -0.2 -> would be 1.15
        expect(item.ease).toBe(1.3);

        let high = newItem({ ease: 2.75 });
        high = schedulePitchItem(high, 'easy', NOW); // +0.15 -> would be 2.9
        expect(high.ease).toBe(2.8);
    });
});

describe('createPitchItem / isPitchItemDue', () => {
    it('creates a fresh, immediately-studyable item', () => {
        const item = newItem();
        expect(item.key).toBe(pitchItemKey('はし', 1));
        expect(item.reps).toBe(0);
        expect(item.ease).toBe(2.5);
        expect(item.due).toBe(NOW);
        expect(isPitchItemDue(item, NOW)).toBe(true);
        expect(isPitchItemDue({ ...item, suspended: true }, NOW)).toBe(false);
        expect(isPitchItemDue({ ...item, due: NOW + DAY }, NOW)).toBe(false);
    });
});

describe('selectPitchSessionPool', () => {
    it('orders due items first (most overdue first), then caps new items', () => {
        const reviewedDue = newItem({ key: 'a#0', reps: 2, due: NOW - 2 * DAY });
        const reviewedDueLater = newItem({ key: 'b#0', reps: 1, due: NOW - 1 * DAY });
        const notDue = newItem({ key: 'c#0', reps: 3, due: NOW + DAY });
        const fresh1 = newItem({ key: 'd#0', reps: 0, introducedAt: NOW - 10 });
        const fresh2 = newItem({ key: 'e#0', reps: 0, introducedAt: NOW - 5 });
        const fresh3 = newItem({ key: 'f#0', reps: 0, introducedAt: NOW - 1 });

        const pool = selectPitchSessionPool(
            [notDue, reviewedDueLater, fresh3, reviewedDue, fresh1, fresh2],
            { now: NOW, newItemCap: 2 },
        );
        expect(pool.map(item => item.key)).toEqual(['a#0', 'b#0', 'd#0', 'e#0']);
    });
});

describe('pitchAccuracyByClass', () => {
    it('aggregates correct/total per pitch class', () => {
        const history: PitchHistoryEntry[] = [
            { key: 'a', at: 1, grade: 'okay', subMode: 'perceive', pitchClass: 'heiban', correct: true },
            { key: 'b', at: 2, grade: 'something', subMode: 'perceive', pitchClass: 'heiban', correct: false },
            { key: 'c', at: 3, grade: 'okay', subMode: 'recall', pitchClass: 'odaka', correct: true },
        ];
        const byClass = pitchAccuracyByClass(history);
        expect(byClass.find(b => b.pitchClass === 'heiban')).toMatchObject({ total: 2, correct: 1 });
        expect(byClass.find(b => b.pitchClass === 'odaka')).toMatchObject({ total: 1, correct: 1 });
    });
});

describe('pitchSeedFromCard', () => {
    function card(overrides: Partial<JPDBCard>): JPDBCard {
        return { spelling: '箸', reading: 'はし', pitchAccent: [pitchPatternFromPosition('はし', 1)], ...overrides } as unknown as JPDBCard;
    }

    it('derives a pitch identity from a studied vocab card', () => {
        const seeded = pitchSeedFromCard(card({}), NOW);
        expect(seeded?.key).toBe(pitchItemKey('はし', 1));
        expect(seeded?.pitchClass).toBe('atamadaka');
        expect(seeded?.displaySpelling).toBe('箸');
    });

    it('returns null when the card has no classifiable pitch', () => {
        expect(pitchSeedFromCard(card({ pitchAccent: [] }), NOW)).toBeNull();
        expect(pitchSeedFromCard(card({ reading: '', spelling: '箸' }), NOW)).toBeNull();
    });
});

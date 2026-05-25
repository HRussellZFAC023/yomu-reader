import { describe, expect, it } from 'vitest';

import { normalizeCardState, normalizeCardStates, primaryCardState } from '../../src/reader/card-state';

describe('normalizeCardState', () => {
    it('returns null for non-string input', () => {
        expect(normalizeCardState(null)).toBeNull();
        expect(normalizeCardState(undefined)).toBeNull();
        expect(normalizeCardState(42)).toBeNull();
        expect(normalizeCardState({})).toBeNull();
    });

    it('returns null for empty or whitespace-only strings', () => {
        expect(normalizeCardState('')).toBeNull();
        expect(normalizeCardState('   ')).toBeNull();
    });

    it('recognizes all canonical card states', () => {
        const states = ['new', 'learning', 'known', 'due', 'failed', 'locked', 'never-forget', 'blacklisted', 'suspended', 'not-in-deck', 'redundant'];
        for (const state of states) {
            expect(normalizeCardState(state)).toBe(state);
        }
    });

    it('is case-insensitive', () => {
        expect(normalizeCardState('New')).toBe('new');
        expect(normalizeCardState('KNOWN')).toBe('known');
        expect(normalizeCardState('Never-Forget')).toBe('never-forget');
    });

    it('resolves never-forget aliases', () => {
        expect(normalizeCardState('never_forget')).toBe('never-forget');
        expect(normalizeCardState('neverforget')).toBe('never-forget');
        expect(normalizeCardState('never forget')).toBe('never-forget');
        expect(normalizeCardState('NEVER_FORGET')).toBe('never-forget');
    });

    it('resolves not-in-deck aliases', () => {
        expect(normalizeCardState('not_in_deck')).toBe('not-in-deck');
        expect(normalizeCardState('notindeck')).toBe('not-in-deck');
        expect(normalizeCardState('not in deck')).toBe('not-in-deck');
    });

    it('resolves blacklisted aliases', () => {
        expect(normalizeCardState('blacklist')).toBe('blacklisted');
        expect(normalizeCardState('ignored')).toBe('blacklisted');
    });

    it('returns null for unknown states', () => {
        expect(normalizeCardState('unknown-state')).toBeNull();
        expect(normalizeCardState('reviewing')).toBeNull();
    });

    it('trims surrounding whitespace', () => {
        expect(normalizeCardState('  new  ')).toBe('new');
        expect(normalizeCardState('\tdue\n')).toBe('due');
    });
});

describe('normalizeCardStates', () => {
    it('returns the fallback when given no valid states', () => {
        expect(normalizeCardStates([])).toEqual(['not-in-deck']);
        expect(normalizeCardStates([null])).toEqual(['not-in-deck']);
        expect(normalizeCardStates('garbage')).toEqual(['not-in-deck']);
    });

    it('uses a custom fallback', () => {
        expect(normalizeCardStates([], 'new')).toEqual(['new']);
    });

    it('normalizes an array of raw state strings', () => {
        expect(normalizeCardStates(['new', 'due'])).toEqual(['new', 'due']);
    });

    it('wraps a single non-array value in an array', () => {
        expect(normalizeCardStates('known')).toEqual(['known']);
    });

    it('deduplicates states, including through aliases', () => {
        expect(normalizeCardStates(['never-forget', 'never_forget', 'neverforget'])).toEqual(['never-forget']);
    });

    it('filters out null results and keeps valid ones', () => {
        expect(normalizeCardStates(['new', 'garbage', 'due'])).toEqual(['new', 'due']);
    });
});

describe('primaryCardState', () => {
    it('returns the first valid state', () => {
        expect(primaryCardState(['new', 'due'])).toBe('new');
        expect(primaryCardState('known')).toBe('known');
    });

    it('returns not-in-deck as the fallback for invalid input', () => {
        expect(primaryCardState(null)).toBe('not-in-deck');
        expect(primaryCardState('garbage')).toBe('not-in-deck');
        expect(primaryCardState([])).toBe('not-in-deck');
    });
});

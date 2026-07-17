import { describe, expect, it } from 'vitest';

import { OperationTracker } from '../../src/reader/core/operation-token';

describe('OperationTracker', () => {
    it('leaves the freshly begun token live', () => {
        const tracker = new OperationTracker();
        const op = tracker.begin('load');
        expect(op.superseded).toBe(false);
    });

    it('supersedes the previous token of the same scope on the next begin', () => {
        const tracker = new OperationTracker();
        const first = tracker.begin('load');
        expect(first.superseded).toBe(false);
        const second = tracker.begin('load');
        expect(first.superseded).toBe(true);
        expect(second.superseded).toBe(false);
    });

    it('stays superseded once a newer operation begins (latest-wins is monotonic)', () => {
        const tracker = new OperationTracker();
        const first = tracker.begin('load');
        tracker.begin('load');
        tracker.begin('load');
        expect(first.superseded).toBe(true);
    });

    it('keeps scopes independent — beginning one never supersedes another', () => {
        const tracker = new OperationTracker();
        const stats = tracker.begin('stats');
        const search = tracker.begin('search');
        // A second stats op supersedes only the earlier stats op.
        const stats2 = tracker.begin('stats');
        expect(stats.superseded).toBe(true);
        expect(search.superseded).toBe(false);
        expect(stats2.superseded).toBe(false);
    });
});

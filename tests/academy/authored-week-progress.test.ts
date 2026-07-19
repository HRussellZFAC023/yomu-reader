import {
    authoredWeekProgressAfterActivity,
    authoredWeekProgressFits,
    authoredWeekProgressRecordIsValid,
    clearAuthoredWeekProgress,
    setAuthoredWeekProgress,
} from '../../src/academy/domain/authored-week-progress';

describe('authored week progress checkpoint', () => {
    it('updates one package without losing another and removes only the completed package', () => {
        const first = setAuthoredWeekProgress(undefined, 'l1-l01', '0'.repeat(64), {
            phase: 'teaching',
            exposureId: 'mission',
        }, 10);
        const both = setAuthoredWeekProgress(first, 'l2-l04', '1'.repeat(64), {
            phase: 'question',
            activityId: 'activity:two',
        }, 20);

        expect(both).toEqual({
            'l1-l01': {
                sourceSha256: '0'.repeat(64),
                position: { phase: 'teaching', exposureId: 'mission' },
                savedAt: 10,
            },
            'l2-l04': {
                sourceSha256: '1'.repeat(64),
                position: { phase: 'question', activityId: 'activity:two' },
                savedAt: 20,
            },
        });
        expect(clearAuthoredWeekProgress(both, 'l1-l01')).toEqual({
            'l2-l04': {
                sourceSha256: '1'.repeat(64),
                position: { phase: 'question', activityId: 'activity:two' },
                savedAt: 20,
            },
        });
        expect(clearAuthoredWeekProgress(first, 'l1-l01')).toBeUndefined();
    });

    it('validates the durable shape and rejects loose or malformed cursors', () => {
        expect(authoredWeekProgressRecordIsValid({
            'l1-l01': {
                sourceSha256: '0'.repeat(64),
                position: { phase: 'support', activityId: 'activity:one' },
                savedAt: 123,
            },
            'l2-l04': { sourceSha256: '1'.repeat(64), position: { phase: 'extension' } },
        })).toBe(true);
        expect(authoredWeekProgressRecordIsValid({
            '': { sourceSha256: '0'.repeat(64), position: { phase: 'complete' } },
        })).toBe(false);
        expect(authoredWeekProgressRecordIsValid({
            'l1-l01': { sourceSha256: 'short', position: { phase: 'complete' } },
        })).toBe(false);
        expect(authoredWeekProgressRecordIsValid({
            'l1-l01': { sourceSha256: '0'.repeat(64), position: { phase: 'teaching', exposureId: '' } },
        })).toBe(false);
        expect(authoredWeekProgressRecordIsValid({
            'l1-l01': { sourceSha256: '0'.repeat(64), position: { phase: 'question', activityId: '' } },
        })).toBe(false);
        expect(authoredWeekProgressRecordIsValid({
            'l1-l01': { sourceSha256: '0'.repeat(64), position: { phase: 'complete' }, savedAt: -1 },
        })).toBe(false);
        expect(authoredWeekProgressRecordIsValid({
            'l1-l01': { sourceSha256: '0'.repeat(64), position: { phase: 'complete' }, savedAt: 1.5 },
        })).toBe(false);
    });

    it('accepts only cursors that belong to the loaded authored package', () => {
        const scope = {
            exposureIds: ['explanation', 'mission'],
            activityIds: ['activity:one', 'activity:two'],
            supportActivityIds: ['activity:one', 'activity:two'],
            hasExtension: false,
        } as const;

        expect(authoredWeekProgressFits({ phase: 'teaching', exposureId: 'mission' }, scope)).toBe(true);
        expect(authoredWeekProgressFits({ phase: 'teaching', exposureId: 'missing' }, scope)).toBe(false);
        expect(authoredWeekProgressFits({ phase: 'question', activityId: 'activity:two' }, scope)).toBe(true);
        expect(authoredWeekProgressFits({ phase: 'question', activityId: 'activity:missing' }, scope)).toBe(false);
        expect(authoredWeekProgressFits({ phase: 'extension' }, scope)).toBe(false);
        expect(authoredWeekProgressFits({ phase: 'complete' }, scope)).toBe(true);
        expect(authoredWeekProgressAfterActivity('activity:one', scope)).toEqual({
            phase: 'support',
            activityId: 'activity:two',
        });
        expect(authoredWeekProgressAfterActivity('activity:two', scope)).toEqual({ phase: 'complete' });
    });
});

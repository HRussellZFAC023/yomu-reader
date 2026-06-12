import { afterEach, describe, expect, it, vi } from 'vitest';

import { showReaderToast } from '../../src/reader/ui/toast';

describe('reader toast stack', () => {
    afterEach(() => {
        vi.useRealTimers();
        document.body.replaceChildren();
    });

    it('stacks distinct toasts instead of overlapping and removes them after their duration', () => {
        vi.useFakeTimers();
        showReaderToast('first', 1000);
        showReaderToast('second', 1000);

        const stack = document.querySelector('.jpdb-reader-toast-stack')!;
        expect(stack).not.toBeNull();
        expect(stack.querySelectorAll('.jpdb-reader-toast')).toHaveLength(2);

        vi.advanceTimersByTime(1000 + 250);
        expect(document.querySelector('.jpdb-reader-toast')).toBeNull();
        // The empty stack cleans itself up.
        expect(document.querySelector('.jpdb-reader-toast-stack')).toBeNull();
    });

    it('refreshes the timer of an identical visible toast instead of duplicating it', () => {
        vi.useFakeTimers();
        showReaderToast('same message', 1000);
        vi.advanceTimersByTime(800);
        showReaderToast('same message', 1000);

        expect(document.querySelectorAll('.jpdb-reader-toast')).toHaveLength(1);
        // The original timer was superseded: still visible past the first deadline.
        vi.advanceTimersByTime(500);
        expect(document.querySelector('.jpdb-reader-toast')).not.toBeNull();
        vi.advanceTimersByTime(800);
        expect(document.querySelector('.jpdb-reader-toast')).toBeNull();
    });
});

import { afterEach, describe, expect, it, vi } from 'vitest';

import { holdReaderToast, showReaderToast } from '../../src/reader/ui/toast';

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

    it('brings back a toast that was leaving when the same message is shown again', () => {
        vi.useFakeTimers();
        showReaderToast('same message', 1000);
        vi.advanceTimersByTime(1100);
        expect(document.querySelector('.jpdb-reader-toast')?.classList.contains('is-visible')).toBe(false);
        showReaderToast('same message', 1000);

        vi.advanceTimersByTime(500);
        const toast = document.querySelector('.jpdb-reader-toast');
        expect(toast?.classList.contains('is-visible')).toBe(true);
        vi.advanceTimersByTime(800);
        expect(document.querySelector('.jpdb-reader-toast')).toBeNull();
    });

    it('keeps a held status until its last holder releases it, even if one releases as another takes it', () => {
        vi.useFakeTimers();
        const releaseFirst = holdReaderToast('waiting');
        releaseFirst();
        vi.advanceTimersByTime(100);
        const releaseSecond = holdReaderToast('waiting');
        const releaseThird = holdReaderToast('waiting');
        vi.advanceTimersByTime(1000);
        expect(document.querySelectorAll('.jpdb-reader-toast')).toHaveLength(1);
        expect(document.querySelector('.jpdb-reader-toast')?.classList.contains('is-visible')).toBe(true);

        releaseSecond();
        releaseSecond();
        showReaderToast('waiting', 100);
        vi.advanceTimersByTime(1000);
        expect(document.querySelector('.jpdb-reader-toast')?.textContent).toBe('waiting');

        releaseThird();
        vi.advanceTimersByTime(300);
        expect(document.querySelector('.jpdb-reader-toast')).toBeNull();
    });
});
